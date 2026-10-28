import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole, requireClienteAuth, firmarTokenCliente } from "../middleware/auth.js";
import { registroLimiter } from "../middleware/rateLimit.js";
import { calcularElegibilidadPedidos } from "../lib/elegibilidad.js";
import { exportarXlsx } from "../lib/exportarExcel.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { generarTokenQr, QR_TTL_SEGUNDOS } from "../lib/qrToken.js";

export const clientesRouter = Router();

const TIPOS_PERFIL = ["alumno", "docente", "otro"];

// ---------------------------------------------------------------------
// POST /clientes  — registro (público)
// ---------------------------------------------------------------------
clientesRouter.post(
  "/",
  registroLimiter,
  asyncHandler(async (req, res) => {
    const { nombre, apellido_paterno, apellido_materno, telefono, correo, tipo_perfil, fecha_nacimiento } = req.body || {};

    if (!nombre?.trim() || !apellido_paterno?.trim()) throw badRequest("Falta nombre o apellido_paterno");
    if (!telefono?.trim() || !correo?.trim()) throw badRequest("Teléfono y correo son obligatorios los dos");
    if (!fecha_nacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
      throw badRequest("Falta fecha_nacimiento (formato AAAA-MM-DD)");
    }
    if (tipo_perfil && !TIPOS_PERFIL.includes(tipo_perfil)) {
      throw badRequest(`tipo_perfil debe ser uno de: ${TIPOS_PERFIL.join(", ")}`);
    }

    const correoNormalizado = correo.trim().toLowerCase();

    // Se crea (o se reutiliza si ya existía) la cuenta de Supabase Auth de
    // este correo — así el login por OTP en regresos futuros ya encuentra
    // el auth_user_id enlazado. Si falla (p. ej. Supabase no responde), no
    // se bloquea el registro: requireClienteAuth enlaza de todas formas en
    // el primer login real por correo.
    let authUserId = null;
    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: correoNormalizado,
        email_confirm: true,
      });
      if (!error) authUserId = data.user.id;
    } catch {
      /* ver comentario arriba — se enlaza después si esto falla */
    }

    const { rows } = await query(
      `insert into clientes (nombre, apellido_paterno, apellido_materno, telefono, correo, tipo_perfil, auth_user_id, fecha_nacimiento)
       values ($1, $2, $3, $4, $5, coalesce($6, 'otro')::perfil_tipo, $7, $8)
       returning id, nombre, apellido_paterno, apellido_materno, telefono, correo, tipo_perfil, fecha_nacimiento, created_at`,
      [nombre.trim(), apellido_paterno.trim(), apellido_materno?.trim() || null, telefono.trim(), correoNormalizado, tipo_perfil, authUserId, fecha_nacimiento]
    );

    // Primer login implícito (fase3-app-cliente.md): al registrarse, la app
    // pasa directo adentro sin pedir OTP — se emite ya la sesión.
    const token = firmarTokenCliente(rows[0].id);
    res.status(201).json({ cliente: rows[0], token });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/me  — perfil propio (fase3-app-cliente.md §4 y §10:
// Inicio y Perfil comparten esta misma foto: datos, saldo en la modalidad
// activa, si ya hay una recompensa lista para redimir, y el pedido en
// curso si hay uno).
// ---------------------------------------------------------------------
clientesRouter.get(
  "/me",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select c.id, c.nombre, c.apellido_paterno, c.apellido_materno, c.telefono, c.correo, c.tipo_perfil,
              c.notificaciones_activas, c.confirmado_en_ciclo_actual, c.created_at, c.fecha_nacimiento,
              s.creditos_disponibles, s.visitas_disponibles
       from clientes c
       left join saldos_cliente_v s on s.cliente_id = c.id
       where c.id = $1`,
      [req.cliente.id]
    );
    const cliente = rows[0];
    if (!cliente) throw notFound("Cliente no encontrado");

    const { rows: configRows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
    const config = configRows[0] || null;

    let recompensaLista = false;
    if (config) {
      const creditos = Number(cliente.creditos_disponibles || 0);
      const visitas = Number(cliente.visitas_disponibles || 0);
      if (config.modalidad === "credito_valor_mxn") recompensaLista = creditos > 0;
      else if (config.modalidad === "credito_umbral") recompensaLista = creditos >= Number(config.umbral_cd);
      else if (config.modalidad === "visitas") recompensaLista = visitas >= Number(config.umbral_visitas);
    }

    // Un cliente puede tener MÁS DE UN pedido activo a la vez (nada le
    // impide pedir otra vez antes de que le entreguen el primero) — se
    // regresan todos, no solo el más reciente (fase A, ronda 5).
    const { rows: pedidos } = await query(
      `select p.id, p.estado, p.hora_pickup, p.total_mxn, p.metodo_pago, p.pago_confirmado, p.created_at,
              coalesce((select sum(cantidad) from pedido_items where pedido_id = p.id), 0) as cantidad_productos,
              (select json_agg(json_build_object('cantidad', pi.cantidad, 'producto_nombre', pr.nombre))
                 from pedido_items pi join productos pr on pr.id = pi.producto_id
                 where pi.pedido_id = p.id) as items
       from pedidos p
       where p.cliente_id = $1 and p.estado not in ('entregado', 'cancelado', 'no_recogido')
       order by p.created_at asc`,
      [req.cliente.id]
    );

    const { rows: solicitudes } = await query(
      `select id, tipo from solicitudes_canje where cliente_id = $1 and estado = 'pendiente' limit 1`,
      [req.cliente.id]
    );

    const elegibilidadPedidos = await calcularElegibilidadPedidos(req.cliente.id);

    res.json({
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        apellido_paterno: cliente.apellido_paterno,
        apellido_materno: cliente.apellido_materno,
        telefono: cliente.telefono,
        correo: cliente.correo,
        tipo_perfil: cliente.tipo_perfil,
        notificaciones_activas: cliente.notificaciones_activas,
        confirmado_en_ciclo_actual: cliente.confirmado_en_ciclo_actual,
        fecha_nacimiento: cliente.fecha_nacimiento,
        created_at: cliente.created_at,
      },
      saldo: {
        creditos_disponibles: Number(cliente.creditos_disponibles || 0),
        visitas_disponibles: Number(cliente.visitas_disponibles || 0),
      },
      recompensa_lista: recompensaLista,
      solicitud_canje_pendiente: solicitudes[0] || null,
      pedidos_en_curso: pedidos,
      elegibilidad_pedidos: elegibilidadPedidos,
    });
  })
);

// ---------------------------------------------------------------------
// PATCH /clientes/me — el cliente edita sus propios datos (fase3 §10:
// "editables por el cliente, salvo el tipo de perfil — eso lo cambia el
// staff/admin"). Reutiliza las mismas validaciones de forma que la ruta
// de staff, pero con su propia lista de campos permitidos.
// ---------------------------------------------------------------------
const CAMPOS_EDITABLES_CLIENTE = ["nombre", "apellido_paterno", "apellido_materno", "telefono", "correo", "notificaciones_activas", "fecha_nacimiento"];

clientesRouter.patch(
  "/me",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const cambios = Object.fromEntries(
      Object.entries(req.body || {}).filter(([clave]) => CAMPOS_EDITABLES_CLIENTE.includes(clave))
    );
    if (Object.keys(cambios).length === 0) throw badRequest("No mandaste ningún campo editable");
    if (cambios.nombre != null && !cambios.nombre.trim()) throw badRequest("El nombre no puede quedar vacío");
    if (cambios.apellido_paterno != null && !cambios.apellido_paterno.trim()) throw badRequest("El apellido paterno no puede quedar vacío");
    if (cambios.telefono != null && !cambios.telefono.trim()) throw badRequest("El teléfono no puede quedar vacío");
    if (cambios.correo != null && !cambios.correo.trim()) throw badRequest("El correo no puede quedar vacío");
    if (cambios.correo) cambios.correo = cambios.correo.trim().toLowerCase();
    if (cambios.fecha_nacimiento != null && !/^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha_nacimiento)) {
      throw badRequest("fecha_nacimiento debe tener formato AAAA-MM-DD");
    }

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((col, i) => `${col} = $${i + 2}`).join(", ");
    const valores = columnas.map((col) => cambios[col]);

    const { rows } = await query(
      `update clientes set ${asignaciones}, updated_at = now() where id = $1
       returning id, nombre, apellido_paterno, apellido_materno, telefono, correo, tipo_perfil, notificaciones_activas, fecha_nacimiento`,
      [req.cliente.id, ...valores]
    );
    res.json({ cliente: rows[0] });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/me/qr-token — token dinámico del QR personal (fase3 §5).
// El cliente lo vuelve a pedir cada 30-60s mientras la pantalla de Mi QR
// está abierta; lo valida `verificarTokenQr` del lado del escaneo (staff).
// ---------------------------------------------------------------------
clientesRouter.get(
  "/me/qr-token",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select id, qr_secret_version from clientes where id = $1`, [req.cliente.id]);
    if (!rows[0]) throw notFound("Cliente no encontrado");
    res.json({ token: generarTokenQr(rows[0]), expira_en_segundos: QR_TTL_SEGUNDOS });
  })
);

// A partir de aquí, todo es operación de staff/admin (todavía no hay login de cliente conectado).
clientesRouter.use(requireStaffAuth);

// ---------------------------------------------------------------------
// GET /clientes?buscar=...  — búsqueda por coincidencia parcial (admin)
// También sirve como reporte "Clientes por estado" (fase8 §1) con
// ?tipo_perfil= y ?confirmado=true|false, y exportación con ?export=xlsx
// — en modo reporte no aplica el tope de 50 que sí tiene la búsqueda
// normal del panel.
// ---------------------------------------------------------------------
// La búsqueda simple (?buscar=) es libre para todo el staff (fase7 §4:
// "útil si el cliente olvidó cómo mostrar su QR", sin PIN) — pero el modo
// reporte (tipo_perfil/confirmado/export, usado por el panel) sigue
// exclusivo de admin.
const esReporteClientes = (req) => Boolean(req.query.tipo_perfil || req.query.confirmado != null || req.query.export);

clientesRouter.get(
  "/",
  (req, res, next) => (esReporteClientes(req) ? requireRole("admin")(req, res, next) : next()),
  asyncHandler(async (req, res) => {
    const termino = (req.query.buscar || "").trim();
    const { tipo_perfil, confirmado, export: exportar } = req.query;
    const esReporte = esReporteClientes(req);

    const condiciones = [];
    const valores = [];
    if (termino) {
      valores.push(`%${termino}%`);
      const i = valores.length;
      condiciones.push(`(nombre ilike $${i} or apellido_paterno ilike $${i} or apellido_materno ilike $${i} or telefono ilike $${i} or correo ilike $${i})`);
    }
    if (tipo_perfil) {
      valores.push(tipo_perfil);
      condiciones.push(`tipo_perfil = $${valores.length}::perfil_tipo`);
    }
    if (confirmado != null) {
      valores.push(confirmado === "true");
      condiciones.push(`confirmado_en_ciclo_actual = $${valores.length}`);
    }
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";
    const orden = termino ? "order by nombre" : "order by created_at desc";
    const limite = esReporte ? "limit 5000" : "limit 50";

    const { rows } = await query(
      `select id, nombre, apellido_paterno, apellido_materno, telefono, correo, tipo_perfil,
              notificaciones_activas, confirmado_en_ciclo_actual, created_at
       from clientes ${where} ${orden} ${limite}`,
      valores
    );

    if (exportar !== "xlsx") return res.json({ clientes: rows });

    await exportarXlsx(res, {
      nombreArchivo: "clientes.xlsx",
      nombreHoja: "Clientes",
      columnas: [
        { header: "Nombre", key: "nombre", width: 28 },
        { header: "Contacto", key: "contacto", width: 26 },
        { header: "Perfil", key: "perfil", width: 12 },
        { header: "Confirmado", key: "confirmado", width: 12 },
        { header: "Notificaciones activas", key: "notif", width: 16 },
        { header: "Registrado", key: "registrado", width: 20 },
      ],
      filas: rows.map((c) => ({
        nombre: `${c.nombre} ${c.apellido_paterno} ${c.apellido_materno || ""}`.trim(),
        contacto: c.correo || c.telefono || "—",
        perfil: c.tipo_perfil,
        confirmado: c.confirmado_en_ciclo_actual ? "Sí" : "No",
        notif: c.notificaciones_activas ? "Sí" : "No",
        registrado: new Date(c.created_at).toLocaleDateString("es-MX"),
      })),
    });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/:id  — ficha (admin por ahora; "propio" cuando exista requireClienteAuth)
// ---------------------------------------------------------------------
clientesRouter.get(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select c.*, s.creditos_disponibles, s.visitas_disponibles
       from clientes c
       left join saldos_cliente_v s on s.cliente_id = c.id
       where c.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("Cliente no encontrado");
    res.json({ cliente: rows[0] });
  })
);

// ---------------------------------------------------------------------
// PATCH /clientes/:id  — editar / reactivar (admin)
// ---------------------------------------------------------------------
const CAMPOS_EDITABLES = ["nombre", "apellido_paterno", "apellido_materno", "telefono", "correo", "tipo_perfil", "notificaciones_activas", "confirmado_en_ciclo_actual", "fecha_nacimiento"];

clientesRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const cambios = Object.fromEntries(
      Object.entries(req.body || {}).filter(([clave]) => CAMPOS_EDITABLES.includes(clave))
    );
    if (Object.keys(cambios).length === 0) throw badRequest("No mandaste ningún campo editable");
    if (cambios.tipo_perfil && !TIPOS_PERFIL.includes(cambios.tipo_perfil)) {
      throw badRequest(`tipo_perfil debe ser uno de: ${TIPOS_PERFIL.join(", ")}`);
    }

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((col, i) => `${col} = $${i + 2}`).join(", ");
    const valores = columnas.map((col) => cambios[col]);

    const { rows } = await query(
      `update clientes set ${asignaciones}, updated_at = now() where id = $1 returning *`,
      [req.params.id, ...valores]
    );
    if (!rows[0]) throw notFound("Cliente no encontrado");
    res.json({ cliente: rows[0] });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/:id/saldo  — vista saldos_cliente_v
// ---------------------------------------------------------------------
clientesRouter.get(
  "/:id/saldo",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select * from saldos_cliente_v where cliente_id = $1`, [req.params.id]);
    res.json({ saldo: rows[0] || { cliente_id: req.params.id, creditos_disponibles: 0, visitas_disponibles: 0 } });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/:id/movimientos  — historial (admin)
// ---------------------------------------------------------------------
clientesRouter.get(
  "/:id/movimientos",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const limite = Math.min(Number(req.query.limite) || 20, 100);
    const { rows } = await query(
      `select id, tipo_evento, monto, creditos_generados, cuenta_como_visita, created_at
       from movimientos where cliente_id = $1 order by created_at desc limit $2`,
      [req.params.id, limite]
    );
    res.json({ movimientos: rows });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/:id/elegibilidad-pedidos  — vista + comparación contra config
// ---------------------------------------------------------------------
clientesRouter.get(
  "/:id/elegibilidad-pedidos",
  asyncHandler(async (req, res) => {
    res.json(await calcularElegibilidadPedidos(req.params.id));
  })
);

// ---------------------------------------------------------------------
// GET /clientes/:id/pedidos  — historial de pedidos (admin; apoyo para
// soporte mientras no exista sesión propia de cliente en /pedidos/mios)
// ---------------------------------------------------------------------
clientesRouter.get(
  "/:id/pedidos",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select id, estado, hora_pickup, total_mxn, creditos_aplicados_mxn, created_at
       from pedidos where cliente_id = $1 order by created_at desc limit 50`,
      [req.params.id]
    );
    res.json({ pedidos: rows });
  })
);

// ---------------------------------------------------------------------
// GET /clientes/:id/notificaciones  — bandeja (admin; apoyo mientras
// /notificaciones/mias no tenga sesión propia de cliente)
// ---------------------------------------------------------------------
clientesRouter.get(
  "/:id/notificaciones",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select id, canal, tipo, estado, leido_en, created_at
       from notificaciones_log where cliente_id = $1 order by created_at desc limit 50`,
      [req.params.id]
    );
    res.json({ notificaciones: rows });
  })
);

// ---------------------------------------------------------------------
// POST /clientes/:id/acceso-asistido  — código presencial de un solo uso
// (fase3-app-cliente.md §3: para quien no tiene correo o nunca le llega el
// OTP). Cualquier staff puede generarlo, no solo admin — se genera en
// mostrador. Se verifica en POST /auth/cliente/codigo-asistido/verificar.
// ---------------------------------------------------------------------
clientesRouter.post(
  "/:id/acceso-asistido",
  asyncHandler(async (req, res) => {
    const { rows: clientes } = await query(`select id from clientes where id = $1`, [req.params.id]);
    if (!clientes[0]) throw notFound("Cliente no encontrado");

    const codigo = crypto.randomInt(100000, 999999).toString();
    const codigoHash = await bcrypt.hash(codigo, 10);

    const { rows } = await query(
      `insert into codigos_acceso_asistido (cliente_id, codigo_hash, generado_por, expira_en)
       values ($1, $2, $3, now() + interval '10 minutes')
       returning expira_en`,
      [req.params.id, codigoHash, req.staff.id]
    );

    res.status(201).json({ codigo, expira_en: rows[0].expira_en });
  })
);
