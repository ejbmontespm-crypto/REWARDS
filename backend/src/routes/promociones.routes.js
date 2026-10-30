import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole, clienteOpcional } from "../middleware/auth.js";
import { notificarClientes } from "../lib/notificar.js";

export const promocionesRouter = Router();

const TIPOS_ARCHIVO = ["imagen", "pdf"];
const PERFILES = ["alumno", "docente", "otro"];
const DIAS_SEMANA_VALIDOS = [0, 1, 2, 3, 4, 5, 6];
const esHora = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// Naturaleza de la promoción (fase B, unificación de Promociones + Saldo y
// recompensas): "informativa" es el banner de siempre (autoevaluado por
// vigencia/horario/cumpleaños); "credito_regalo"/"bebida_regalo" son
// campañas puntuales que el admin dispara YA MISMO a una lista de clientes
// (lo que antes vivía aparte, en promos_saldo_historial) — se guardan en
// esta misma tabla como un registro ya ejecutado, no editable.
const NATURALEZAS = ["informativa", "credito_regalo", "bebida_regalo"];
const ALCANCES = ["producto_unico", "varios_productos", "categoria_completa", "todo_el_menu"];
const FILTROS = ["clientes", "perfil", "todos"];

/**
 * Para "bebida_regalo": el monto que se acredita al monedero es el precio
 * del producto (si el alcance es uno solo) o el precio MÁS ALTO entre los
 * productos del alcance elegido — así el cliente puede cambiar ese crédito
 * por cualquiera de los productos incluidos sin que la promo salga perdiendo.
 */
async function resolverMontoBebidaRegalo({ alcance_tipo, producto_id, producto_ids, alcance_categoria_id }) {
  if (alcance_tipo === "producto_unico") {
    const { rows } = await query(`select precio from productos where id = $1`, [producto_id]);
    if (!rows[0]) throw notFound("Producto no encontrado");
    return Number(rows[0].precio);
  }
  if (alcance_tipo === "varios_productos") {
    const { rows } = await query(`select max(precio) as max from productos where id = any($1::uuid[])`, [producto_ids]);
    if (rows[0].max == null) throw badRequest("Ninguno de esos productos existe");
    return Number(rows[0].max);
  }
  if (alcance_tipo === "categoria_completa") {
    const { rows } = await query(`select max(precio) as max from productos where categoria_id = $1 and disponible = true`, [
      alcance_categoria_id,
    ]);
    if (rows[0].max == null) throw badRequest("Esa categoría no tiene productos disponibles");
    return Number(rows[0].max);
  }
  const { rows } = await query(`select max(precio) as max from productos where disponible = true`);
  if (rows[0].max == null) throw badRequest("No hay productos disponibles en el menú");
  return Number(rows[0].max);
}

/** Misma resolución "en caliente" que usaba promos-saldo: siempre contra la
 *  base real al momento de aplicar, nunca una lista ya calculada antes. */
async function resolverClienteIds({ filtro_tipo, filtro_perfil, clientes_ids }) {
  if (filtro_tipo === "todos") {
    const { rows } = await query(`select id from clientes`);
    return rows.map((r) => r.id);
  }
  if (filtro_tipo === "perfil") {
    const { rows } = await query(`select id from clientes where tipo_perfil = $1`, [filtro_perfil]);
    return rows.map((r) => r.id);
  }
  const { rows } = await query(`select id from clientes where id = any($1::uuid[])`, [clientes_ids]);
  return rows.map((r) => r.id);
}

/**
 * Campaña puntual de saldo/bebida — reemplaza lo que hacía
 * POST /promos-saldo/aplicar: valida, resuelve la lista de clientes,
 * acredita el monedero de cada uno YA MISMO, y deja el registro en la
 * misma tabla que las promociones informativas (naturaleza != "informativa"),
 * marcado como ya aplicado (aplicada_en) — no es editable ni reversible
 * desde aquí, igual que antes.
 */
async function crearCampanaManual(req, res, naturaleza) {
  const { titulo, monto_mxn, producto_id, alcance_tipo, producto_ids, alcance_categoria_id, filtro_tipo, filtro_perfil, clientes_ids } =
    req.body || {};
  if (!titulo?.trim()) throw badRequest("Falta titulo");
  if (!FILTROS.includes(filtro_tipo)) throw badRequest(`filtro_tipo debe ser uno de: ${FILTROS.join(", ")}`);
  if (filtro_tipo === "clientes" && (!Array.isArray(clientes_ids) || clientes_ids.length === 0)) {
    throw badRequest("Falta clientes_ids — elige al menos un cliente");
  }
  if (filtro_tipo === "perfil" && !PERFILES.includes(filtro_perfil)) {
    throw badRequest(`filtro_perfil debe ser uno de: ${PERFILES.join(", ")}`);
  }

  let montoPorCliente;
  let productoIdFinal = null;
  let productoIdsFinal = null;
  let alcanceTipoFinal = null;
  let alcanceCategoriaFinal = null;

  if (naturaleza === "credito_regalo") {
    montoPorCliente = Number(monto_mxn);
    if (!(montoPorCliente > 0)) throw badRequest("monto_mxn debe ser mayor a 0");
  } else {
    if (!ALCANCES.includes(alcance_tipo)) throw badRequest(`alcance_tipo debe ser uno de: ${ALCANCES.join(", ")}`);
    if (alcance_tipo === "producto_unico" && !producto_id) throw badRequest("Falta producto_id");
    if (alcance_tipo === "varios_productos" && (!Array.isArray(producto_ids) || producto_ids.length === 0)) {
      throw badRequest("Falta producto_ids — elige al menos un producto");
    }
    if (alcance_tipo === "categoria_completa" && !alcance_categoria_id) throw badRequest("Falta alcance_categoria_id");

    montoPorCliente = await resolverMontoBebidaRegalo({ alcance_tipo, producto_id, producto_ids, alcance_categoria_id });
    alcanceTipoFinal = alcance_tipo;
    productoIdFinal = alcance_tipo === "producto_unico" ? producto_id : null;
    productoIdsFinal = alcance_tipo === "varios_productos" ? producto_ids : null;
    alcanceCategoriaFinal = alcance_tipo === "categoria_completa" ? alcance_categoria_id : null;
  }
  montoPorCliente = Math.round(montoPorCliente * 100) / 100;

  const clienteIds = await resolverClienteIds({ filtro_tipo, filtro_perfil, clientes_ids });
  if (clienteIds.length === 0) throw badRequest("Ningún cliente coincide con ese filtro");

  const detalle = `Promo: ${titulo.trim()}`;
  for (const clienteId of clienteIds) {
    await query(`update clientes set saldo_monedero_mxn = saldo_monedero_mxn + $2 where id = $1`, [clienteId, montoPorCliente]);
    await query(`insert into movimientos_monedero (cliente_id, monto, tipo, detalle) values ($1, $2, 'promo', $3)`, [
      clienteId,
      montoPorCliente,
      detalle,
    ]);
  }

  const { rows } = await query(
    `insert into promociones_informativas
       (titulo, activa, creado_por, naturaleza, monto_mxn, producto_id, alcance_tipo, producto_ids, alcance_categoria_id,
        filtro_tipo, filtro_perfil, clientes_ids, cantidad_clientes_aplicados, aplicada_en)
     values ($1, true, $2, $3, $4, $5, $6, $7::uuid[], $8, $9, $10, $11::uuid[], $12, now())
     returning *`,
    [
      titulo.trim(),
      req.staff.id,
      naturaleza,
      montoPorCliente,
      productoIdFinal,
      alcanceTipoFinal,
      productoIdsFinal,
      alcanceCategoriaFinal,
      filtro_tipo,
      filtro_tipo === "perfil" ? filtro_perfil : null,
      filtro_tipo === "clientes" ? clienteIds : null,
      clienteIds.length,
    ]
  );

  res.status(201).json({ promocion: rows[0], clientes_afectados: clienteIds.length, monto_por_cliente: montoPorCliente });
}

/**
 * Ventana propia de días/horario de la promo (ej. happy hour) — independiente
 * de fecha_inicio/fecha_fin (esas son el rango de FECHAS de vigencia, no la
 * hora del día). Valida contra el estado final (actual + cambios), para que
 * una edición parcial no deje hora_inicio sin hora_fin o viceversa.
 */
function validarVentanaHoraria({ dias_semana, hora_inicio, hora_fin }) {
  if (dias_semana != null && (!Array.isArray(dias_semana) || dias_semana.some((d) => !DIAS_SEMANA_VALIDOS.includes(d)))) {
    throw badRequest("dias_semana debe ser un arreglo de números 0 (domingo) a 6 (sábado)");
  }
  if ((hora_inicio == null) !== (hora_fin == null)) {
    throw badRequest("hora_inicio y hora_fin deben mandarse juntas, o ninguna de las dos");
  }
  if (hora_inicio != null && (!esHora(hora_inicio) || !esHora(hora_fin) || hora_inicio >= hora_fin)) {
    throw badRequest("hora_inicio/hora_fin deben tener formato HH:MM, con hora_inicio antes de hora_fin");
  }
}

// ---------------------------------------------------------------------
// GET /promociones
// Pública, vigentes (fase2 §5). ?perfil=alumno filtra por segmento — es
// query param temporal mientras no exista sesión de cliente; cuando la
// haya, el perfil sale del token en vez de venir en la URL.
// Con ?todas=true (admin) se ven todas, incluidas pausadas/vencidas —
// es la vista de gestión del panel.
// ---------------------------------------------------------------------
const esVistaAdmin = (req) => req.query.todas === "true";

/**
 * Elegible para una promo de cumpleaños: hoy cae dentro de la ventana
 * [fecha exacta de nacimiento - diasAntes, fecha exacta + diasDespues]
 * (se prueba contra el cumpleaños del año pasado, este año y el que
 * viene, para que la ventana no se rompa cuando cruza el 31-dic/1-ene),
 * Y cada uno de los últimos `mesesHistorial` meses (completos, sin
 * contar el actual) tuvo compras por al menos `gastoMinimo`, Y todavía
 * no se agotó `limiteUsos` dentro de esa misma ventana.
 */
async function clienteElegibleCumpleanos(clienteId, promo) {
  const { cumpleanos_dias_antes: diasAntes, cumpleanos_dias_despues: diasDespues, cumpleanos_limite_usos: limiteUsos, cumpleanos_meses_historial: mesesHistorial, cumpleanos_gasto_minimo_mxn: gastoMinimo, producto_id: productoId } = promo;

  const { rows } = await query(`select fecha_nacimiento from clientes where id = $1`, [clienteId]);
  const fechaNacimiento = rows[0]?.fecha_nacimiento;
  if (!fechaNacimiento) return false;

  const mes = Number(fechaNacimiento.slice(5, 7));
  const dia = Number(fechaNacimiento.slice(8, 10));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let ventana = null;
  for (const anio of [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1]) {
    const cumple = new Date(anio, mes - 1, dia);
    const desde = new Date(cumple);
    desde.setDate(desde.getDate() - diasAntes);
    const hasta = new Date(cumple);
    hasta.setDate(hasta.getDate() + diasDespues);
    if (hoy >= desde && hoy <= hasta) {
      ventana = { desde, hasta };
      break;
    }
  }
  if (!ventana) return false;

  const { rows: incumplidos } = await query(
    `select 1 from generate_series(1, $2::int) as gs(n)
     where coalesce(
       (select sum(m.monto) from movimientos m
        where m.cliente_id = $1
          and date_trunc('month', m.created_at) = date_trunc('month', current_date) - (gs.n || ' months')::interval),
       0
     ) < $3
     limit 1`,
    [clienteId, mesesHistorial, gastoMinimo]
  );
  if (incumplidos.length > 0) return false;

  if (limiteUsos > 0 && productoId) {
    const { rows: usos } = await query(
      `select count(*)::int as total
       from pedido_items pi
       join pedidos p on p.id = pi.pedido_id
       where p.cliente_id = $1 and pi.producto_id = $2 and p.estado <> 'cancelado'
         and p.created_at >= $3 and p.created_at <= $4`,
      [clienteId, productoId, ventana.desde, ventana.hasta]
    );
    if (usos[0].total >= limiteUsos) return false;
  }

  return true;
}

promocionesRouter.get(
  "/",
  clienteOpcional,
  (req, res, next) => (esVistaAdmin(req) ? requireStaffAuth(req, res, next) : next()),
  (req, res, next) => (esVistaAdmin(req) ? requireRole("admin")(req, res, next) : next()),
  asyncHandler(async (req, res) => {
    if (esVistaAdmin(req)) {
      // left join a productos: si la promo tiene producto_id, el panel
      // necesita precio/categoría/disponible para precargar el formulario.
      // Para las campañas de saldo/bebida se resuelven también los nombres
      // de categoría/productos del alcance y quién las aplicó, mismo dato
      // que mostraba antes la tabla aparte de "Saldo y recompensas".
      const { rows } = await query(
        `select pr.*,
                p.precio as producto_precio, p.categoria_id as producto_categoria_id, p.disponible as producto_disponible, p.nombre as producto_nombre,
                cat.nombre as alcance_categoria_nombre,
                (select array_agg(p2.nombre order by p2.nombre) from productos p2 where p2.id = any(pr.producto_ids)) as producto_ids_nombres,
                st.nombre_completo as creado_por_nombre
         from promociones_informativas pr
         left join productos p on p.id = pr.producto_id
         left join categorias_producto cat on cat.id = pr.alcance_categoria_id
         left join usuarios_staff st on st.id = pr.creado_por
         order by pr.created_at desc`
      );
      return res.json({ promociones: rows });
    }

    const { perfil } = req.query;
    if (perfil && !PERFILES.includes(perfil)) throw badRequest(`perfil debe ser uno de: ${PERFILES.join(", ")}`);

    // Las campañas de saldo/bebida ("credito_regalo"/"bebida_regalo") son
    // acciones ya ejecutadas, no promociones para mostrarle al cliente —
    // la vista pública solo ve las informativas (banner/vigencia/cumpleaños).
    const condicionPerfil = perfil ? `and (pr.segmentos is null or array_length(pr.segmentos, 1) is null or $1 = any(pr.segmentos))` : "";
    const { rows } = await query(
      `select pr.*, p.precio as producto_precio, p.disponible as producto_disponible
       from promociones_informativas pr
       left join productos p on p.id = pr.producto_id
       where pr.activa = true
         and pr.naturaleza = 'informativa'
         and (pr.fecha_inicio is null or pr.fecha_inicio <= current_date)
         and (pr.fecha_fin is null or pr.fecha_fin >= current_date)
         ${condicionPerfil}
       order by pr.created_at desc`,
      perfil ? [perfil] : []
    );

    const promociones = [];
    for (const promo of rows) {
      if (!promo.solo_cumpleanos) {
        promociones.push(promo);
        continue;
      }
      if (req.cliente && (await clienteElegibleCumpleanos(req.cliente.id, promo))) {
        promociones.push(promo);
      }
    }
    res.json({ promociones });
  })
);

// ---------------------------------------------------------------------
// POST /promociones  (admin)
// ---------------------------------------------------------------------
promocionesRouter.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const naturaleza = req.body?.naturaleza || "informativa";
    if (!NATURALEZAS.includes(naturaleza)) throw badRequest(`naturaleza debe ser una de: ${NATURALEZAS.join(", ")}`);
    if (naturaleza !== "informativa") return crearCampanaManual(req, res, naturaleza);

    const {
      titulo,
      descripcion,
      tipo_archivo,
      archivo_path,
      fecha_inicio,
      fecha_fin,
      segmentos,
      activa,
      precio,
      categoria_id,
      dias_semana,
      hora_inicio,
      hora_fin,
      solo_cumpleanos,
      cumpleanos_meses_historial,
      cumpleanos_gasto_minimo_mxn,
      cumpleanos_dias_antes,
      cumpleanos_dias_despues,
      cumpleanos_limite_usos,
    } = req.body || {};
    if (!titulo?.trim()) throw badRequest("Falta titulo");
    if (
      solo_cumpleanos &&
      !(
        cumpleanos_meses_historial > 0 &&
        cumpleanos_gasto_minimo_mxn > 0 &&
        cumpleanos_dias_antes >= 0 &&
        cumpleanos_dias_despues >= 0 &&
        cumpleanos_limite_usos > 0
      )
    ) {
      throw badRequest(
        "Una promo de cumpleaños necesita cumpleanos_meses_historial y cumpleanos_gasto_minimo_mxn mayores a 0, cumpleanos_dias_antes y cumpleanos_dias_despues (>= 0), y cumpleanos_limite_usos mayor a 0"
      );
    }
    if (!TIPOS_ARCHIVO.includes(tipo_archivo)) throw badRequest(`tipo_archivo debe ser uno de: ${TIPOS_ARCHIVO.join(", ")}`);
    if (!archivo_path?.trim()) throw badRequest("Falta archivo_path");
    if (segmentos && (!Array.isArray(segmentos) || segmentos.some((s) => !PERFILES.includes(s)))) {
      throw badRequest(`segmentos debe ser un arreglo con valores de: ${PERFILES.join(", ")}`);
    }
    if (precio != null && !(typeof precio === "number" && precio >= 0)) {
      throw badRequest("precio debe ser un número >= 0");
    }
    if (precio != null && !categoria_id) {
      throw badRequest("Falta categoria_id — un producto sin categoría no aparece en el menú de la app");
    }
    validarVentanaHoraria({ dias_semana, hora_inicio, hora_fin });

    const estaActiva = activa !== false;

    // "Se puede pedir desde el menú" (fase A, punto 7): crea de una vez el
    // producto de catálogo ligado a esta promo — reutiliza el mismo
    // titulo/descripcion, para no duplicar captura. disponible sigue el
    // estado de la promo: si nace pausada, el producto tampoco es pedible.
    let productoId = null;
    if (precio != null) {
      const { rows: prodRows } = await query(
        `insert into productos (nombre, descripcion, precio, categoria_id, disponible) values ($1, $2, $3, $4, $5) returning id`,
        [titulo.trim(), descripcion || null, precio, categoria_id || null, estaActiva]
      );
      productoId = prodRows[0].id;
    }

    const { rows } = await query(
      `insert into promociones_informativas
         (titulo, descripcion, tipo_archivo, archivo_path, fecha_inicio, fecha_fin, activa, segmentos, creado_por, producto_id, dias_semana, hora_inicio, hora_fin,
          solo_cumpleanos, cumpleanos_meses_historial, cumpleanos_gasto_minimo_mxn, cumpleanos_dias_antes, cumpleanos_dias_despues, cumpleanos_limite_usos)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::smallint[], $12, $13, $14, $15, $16, $17, $18, $19)
       returning *`,
      [
        titulo.trim(),
        descripcion || null,
        tipo_archivo,
        archivo_path.trim(),
        fecha_inicio || null,
        fecha_fin || null,
        estaActiva,
        segmentos?.length ? segmentos : null,
        req.staff.id,
        productoId,
        dias_semana?.length ? dias_semana : null,
        hora_inicio || null,
        hora_fin || null,
        Boolean(solo_cumpleanos),
        solo_cumpleanos ? cumpleanos_meses_historial : null,
        solo_cumpleanos ? cumpleanos_gasto_minimo_mxn : null,
        solo_cumpleanos ? cumpleanos_dias_antes : null,
        solo_cumpleanos ? cumpleanos_dias_despues : null,
        solo_cumpleanos ? cumpleanos_limite_usos : null,
      ]
    );
    const promocion = rows[0];

    let notificacion = null;
    if (estaActiva) {
      notificacion = await notificarClientes({
        tipo: "promocion_nueva",
        segmentos: promocion.segmentos,
        asunto: `Nueva promoción: ${promocion.titulo}`,
        texto: promocion.descripcion || `Ya está disponible "${promocion.titulo}" — entra a la app para verla.`,
      });
    }

    res.status(201).json({ promocion, notificacion });
  })
);

// ---------------------------------------------------------------------
// PATCH /promociones/:id  (admin) — edición y activar/pausar
// ---------------------------------------------------------------------
const CAMPOS_EDITABLES = [
  "titulo",
  "descripcion",
  "tipo_archivo",
  "archivo_path",
  "fecha_inicio",
  "fecha_fin",
  "segmentos",
  "activa",
  "dias_semana",
  "hora_inicio",
  "hora_fin",
  "solo_cumpleanos",
  "cumpleanos_meses_historial",
  "cumpleanos_gasto_minimo_mxn",
  "cumpleanos_dias_antes",
  "cumpleanos_dias_despues",
  "cumpleanos_limite_usos",
];

promocionesRouter.patch(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows: actualRows } = await query(`select * from promociones_informativas where id = $1`, [req.params.id]);
    const actual = actualRows[0];
    if (!actual) throw notFound("Promoción no encontrada");
    if (actual.naturaleza !== "informativa") {
      throw badRequest("Una campaña de saldo/bebida ya aplicada no se puede editar — es un registro de algo que ya ocurrió.");
    }

    const { precio, categoria_id } = req.body || {};
    const cambios = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
    if (Object.keys(cambios).length === 0 && precio == null) throw badRequest("No mandaste ningún campo editable");
    if (cambios.tipo_archivo && !TIPOS_ARCHIVO.includes(cambios.tipo_archivo)) {
      throw badRequest(`tipo_archivo debe ser uno de: ${TIPOS_ARCHIVO.join(", ")}`);
    }
    if (cambios.segmentos && (!Array.isArray(cambios.segmentos) || cambios.segmentos.some((s) => !PERFILES.includes(s)))) {
      throw badRequest(`segmentos debe ser un arreglo con valores de: ${PERFILES.join(", ")}`);
    }
    if (precio != null && !(typeof precio === "number" && precio >= 0)) {
      throw badRequest("precio debe ser un número >= 0");
    }
    if (precio != null && !categoria_id) {
      throw badRequest("Falta categoria_id — un producto sin categoría no aparece en el menú de la app");
    }
    validarVentanaHoraria({
      dias_semana: "dias_semana" in cambios ? cambios.dias_semana : actual.dias_semana,
      hora_inicio: "hora_inicio" in cambios ? cambios.hora_inicio : actual.hora_inicio,
      hora_fin: "hora_fin" in cambios ? cambios.hora_fin : actual.hora_fin,
    });
    const soloCumpleanosFinal = "solo_cumpleanos" in cambios ? cambios.solo_cumpleanos : actual.solo_cumpleanos;
    const mesesFinal = "cumpleanos_meses_historial" in cambios ? cambios.cumpleanos_meses_historial : actual.cumpleanos_meses_historial;
    const gastoFinal = "cumpleanos_gasto_minimo_mxn" in cambios ? cambios.cumpleanos_gasto_minimo_mxn : actual.cumpleanos_gasto_minimo_mxn;
    const diasAntesFinal = "cumpleanos_dias_antes" in cambios ? cambios.cumpleanos_dias_antes : actual.cumpleanos_dias_antes;
    const diasDespuesFinal = "cumpleanos_dias_despues" in cambios ? cambios.cumpleanos_dias_despues : actual.cumpleanos_dias_despues;
    const limiteUsosFinal = "cumpleanos_limite_usos" in cambios ? cambios.cumpleanos_limite_usos : actual.cumpleanos_limite_usos;
    if (
      soloCumpleanosFinal &&
      !(mesesFinal > 0 && gastoFinal > 0 && diasAntesFinal >= 0 && diasDespuesFinal >= 0 && limiteUsosFinal > 0)
    ) {
      throw badRequest(
        "Una promo de cumpleaños necesita cumpleanos_meses_historial y cumpleanos_gasto_minimo_mxn mayores a 0, cumpleanos_dias_antes y cumpleanos_dias_despues (>= 0), y cumpleanos_limite_usos mayor a 0"
      );
    }

    // "Se puede pedir desde el menú" en edición: si ya tenía producto
    // ligado, se actualiza su precio/categoría; si no tenía y ahora se
    // manda precio, se crea uno nuevo (mismo criterio que al crear la promo).
    const activaFinal = cambios.activa ?? actual.activa;
    let productoId = actual.producto_id;
    if (precio != null) {
      if (productoId) {
        await query(`update productos set precio = $2, categoria_id = $3 where id = $1`, [productoId, precio, categoria_id || null]);
      } else {
        const { rows: prodRows } = await query(
          `insert into productos (nombre, descripcion, precio, categoria_id, disponible) values ($1, $2, $3, $4, $5) returning id`,
          [cambios.titulo || actual.titulo, cambios.descripcion ?? actual.descripcion, precio, categoria_id || null, activaFinal]
        );
        productoId = prodRows[0].id;
        cambios.producto_id = productoId;
      }
    }
    // El producto ligado solo debe poderse pedir mientras la promo esté
    // activa — se sincroniza cada vez que cambia `activa` (o se acaba de crear).
    if (productoId && (cambios.activa !== undefined || cambios.producto_id)) {
      await query(`update productos set disponible = $2 where id = $1`, [productoId, activaFinal]);
    }

    const columnas = Object.keys(cambios);
    const asignaciones = columnas
      .map((c, i) => {
        if (c === "segmentos") return `segmentos = $${i + 2}::perfil_tipo[]`;
        if (c === "dias_semana") return `dias_semana = $${i + 2}::smallint[]`;
        return `${c} = $${i + 2}`;
      })
      .join(", ");
    const valores = columnas.map((c) => (["segmentos", "dias_semana"].includes(c) ? (cambios[c]?.length ? cambios[c] : null) : cambios[c]));

    const { rows } = await query(
      columnas.length
        ? `update promociones_informativas set ${asignaciones}, updated_at = now() where id = $1 returning *`
        : `select * from promociones_informativas where id = $1`,
      columnas.length ? [req.params.id, ...valores] : [req.params.id]
    );
    const promocion = rows[0];

    // Se notifica solo al momento de PASAR a activa (no en cada edición menor).
    let notificacion = null;
    if (cambios.activa === true && actual.activa !== true) {
      notificacion = await notificarClientes({
        tipo: "promocion_nueva",
        segmentos: promocion.segmentos,
        asunto: `Nueva promoción: ${promocion.titulo}`,
        texto: promocion.descripcion || `Ya está disponible "${promocion.titulo}" — entra a la app para verla.`,
      });
    }

    res.json({ promocion, notificacion });
  })
);

// ---------------------------------------------------------------------
// DELETE /promociones/:id  (admin)
// ---------------------------------------------------------------------
promocionesRouter.delete(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select producto_id, naturaleza from promociones_informativas where id = $1`, [req.params.id]);
    if (!rows[0]) throw notFound("Promoción no encontrada");
    if (rows[0].naturaleza !== "informativa") {
      throw badRequest("Una campaña de saldo/bebida ya aplicada no se puede eliminar — es un registro de algo que ya ocurrió.");
    }

    // El producto ligado se oculta (no se borra) — puede que ya tenga
    // pedidos en su historial, y borrarlo rompería esos registros.
    if (rows[0].producto_id) {
      await query(`update productos set disponible = false where id = $1`, [rows[0].producto_id]);
    }
    await query(`delete from promociones_informativas where id = $1`, [req.params.id]);
    res.status(204).end();
  })
);
