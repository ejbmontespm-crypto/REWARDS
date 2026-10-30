import { Router } from "express";
import { query, getClient } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound, conflict, forbidden } from "../lib/errors.js";
import { requireStaffAuth, requireClienteAuth, requireClienteOStaffAuth, requireRole } from "../middleware/auth.js";
import { calcularElegibilidadPedidos } from "../lib/elegibilidad.js";
import { obtenerConfig } from "../lib/config.js";
import { exportarXlsx } from "../lib/exportarExcel.js";
import { inicioDeHoyMexicoUTC, diaLocalMexico } from "../lib/recompensa.js";
import { promoDentroDeVentana, promoExigePickupInmediato } from "../lib/promoHorario.js";
import { notificarClientesPorId } from "../lib/notificar.js";

export const pedidosRouter = Router();

const ESTADOS_ACTIVOS = ["recibido", "preparando", "listo"];
const ESTADOS_FINALES = ["entregado", "cancelado", "no_recogido"];

// ---------------------------------------------------------------------
// GET /pedidos/reporte?fecha_desde=&fecha_hasta=&estado=&export=xlsx
// Reporte histórico (fase8 §1) — distinto de /pedidos/cola, que es la
// vista operativa del KDS. Va antes de /:id-como-sea para no chocar con
// otras rutas, aunque aquí no hay ninguna con parámetro que compita.
// ---------------------------------------------------------------------
pedidosRouter.get(
  "/reporte",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { fecha_desde, fecha_hasta, estado, export: exportar } = req.query;
    const condiciones = [];
    const valores = [];
    if (fecha_desde) {
      valores.push(fecha_desde);
      condiciones.push(`p.created_at >= $${valores.length}`);
    }
    if (fecha_hasta) {
      valores.push(fecha_hasta);
      condiciones.push(`p.created_at < ($${valores.length}::date + 1)`);
    }
    if (estado) {
      valores.push(estado);
      condiciones.push(`p.estado = $${valores.length}`);
    }
    if (req.query.folio) {
      valores.push(`%${req.query.folio}%`);
      condiciones.push(`p.folio ilike $${valores.length}`);
    }
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

    const { rows } = await query(
      `select p.id, p.folio, p.created_at, p.hora_pickup, p.estado, p.total_mxn, p.creditos_aplicados_mxn,
              c.nombre, c.apellido_paterno
       from pedidos p
       join clientes c on c.id = p.cliente_id
       ${where}
       order by p.created_at desc
       limit 5000`,
      valores
    );

    if (exportar !== "xlsx") return res.json({ pedidos: rows });

    await exportarXlsx(res, {
      nombreArchivo: "pedidos.xlsx",
      nombreHoja: "Pedidos",
      columnas: [
        { header: "Folio", key: "folio", width: 16 },
        { header: "Fecha", key: "fecha", width: 20 },
        { header: "Cliente", key: "cliente", width: 28 },
        { header: "Hora pickup", key: "pickup", width: 20 },
        { header: "Estado", key: "estado", width: 14 },
        { header: "Total", key: "total", width: 12 },
        { header: "Créditos aplicados", key: "creditos", width: 16 },
      ],
      filas: rows.map((p) => ({
        folio: p.folio || "—",
        fecha: new Date(p.created_at).toLocaleString("es-MX"),
        cliente: `${p.nombre} ${p.apellido_paterno}`,
        pickup: new Date(p.hora_pickup).toLocaleString("es-MX"),
        estado: p.estado,
        total: Number(p.total_mxn),
        creditos: Number(p.creditos_aplicados_mxn),
      })),
    });
  })
);

// ---------------------------------------------------------------------
// POST /pedidos  — crear (carrito/checkout, fase3-app-cliente.md §7)
// ---------------------------------------------------------------------
pedidosRouter.post(
  "/",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const cliente_id = req.cliente.id;
    const { items, hora_pickup, creditos_aplicados_mxn, monedero_aplicado_mxn, metodo_pago, canjear_producto_id } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) throw badRequest("El carrito no puede venir vacío");
    if (!hora_pickup || Number.isNaN(Date.parse(hora_pickup))) throw badRequest("hora_pickup inválida");
    // La forma de pago se fija desde que se crea el pedido — no se puede
    // "cambiar de opinión" después (plan §7.1 ampliado): si se eligió pagar
    // en caja, el botón de Mercado Pago nunca aparece para ese pedido.
    if (metodo_pago && !["caja", "liga_mp"].includes(metodo_pago)) throw badRequest('metodo_pago debe ser "caja" o "liga_mp"');
    if (new Date(hora_pickup) <= new Date()) throw badRequest("hora_pickup debe ser en el futuro");

    const elegibilidad = await calcularElegibilidadPedidos(cliente_id);
    if (!elegibilidad.pedidos_en_linea_activos_global) {
      throw conflict("Los pedidos en línea están pausados por el momento", "pedidos_en_linea_suspendidos");
    }
    if (!elegibilidad.dentro_de_horario) {
      const { apertura, cierre } = elegibilidad.horario_servicio;
      throw conflict(`Fuera de horario de servicio — abrimos de ${apertura} a ${cierre}`, "fuera_de_horario");
    }
    if (!elegibilidad.elegible) {
      throw forbidden(
        `Todavía no puedes pedir en línea — llevas $${elegibilidad.gasto_acumulado_periodo_mxn} de $${elegibilidad.gasto_minimo_mxn} necesarios`,
        "no_elegible"
      );
    }

    // Resuelve precios reales del servidor (nunca confiar en precio que mande el cliente)
    // y arma el total, validando que cada producto/extra exista y esté disponible.
    let totalMxn = 0;
    const itemsResueltos = [];
    for (const item of items) {
      if (!item.producto_id || !item.cantidad || item.cantidad < 1) {
        throw badRequest("Cada item necesita producto_id y cantidad >= 1");
      }
      const { rows: prodRows } = await query(`select id, nombre, precio, disponible from productos where id = $1`, [item.producto_id]);
      const producto = prodRows[0];
      if (!producto) throw notFound(`Producto ${item.producto_id} no encontrado`);
      if (!producto.disponible) throw conflict(`"${producto.nombre}" está agotado en este momento`);

      const extraIds = Array.isArray(item.extra_ids) ? item.extra_ids : [];
      let extrasResueltos = [];
      if (extraIds.length > 0) {
        const { rows: extraRows } = await query(`select id, nombre, costo, disponible from extras where id = any($1::uuid[])`, [extraIds]);
        if (extraRows.length !== extraIds.length) throw badRequest("Alguno de los extras no existe");
        const noDisponible = extraRows.find((e) => !e.disponible);
        if (noDisponible) throw conflict(`El extra "${noDisponible.nombre}" no está disponible`);
        extrasResueltos = extraRows;
      }

      const costoExtras = extrasResueltos.reduce((suma, e) => suma + Number(e.costo), 0);
      const precioUnitario = Number(producto.precio) + costoExtras;
      totalMxn += precioUnitario * item.cantidad;

      itemsResueltos.push({ producto_id: producto.id, cantidad: item.cantidad, precio_unitario: precioUnitario, extras: extrasResueltos });
    }
    totalMxn = Math.round(totalMxn * 100) / 100;

    // Promos con ventana propia de días/horario (ej. happy hour): el
    // producto solo se puede pedir dentro de esa ventana, y su pickup
    // queda topado a 30 min después de hacer el pedido — evita "apartar"
    // el precio de happy hour para recoger horas después, ya fuera de ella.
    const { rows: promosLigadas } = await query(
      `select titulo, dias_semana, hora_inicio, hora_fin
       from promociones_informativas
       where activa = true and producto_id = any($1::uuid[])`,
      [itemsResueltos.map((i) => i.producto_id)]
    );
    for (const promo of promosLigadas) {
      if (!promoDentroDeVentana(promo)) {
        throw conflict(
          `"${promo.titulo}" no está disponible en este momento — solo aplica ${
            promo.hora_inicio ? `de ${promo.hora_inicio} a ${promo.hora_fin}` : "en ciertos días"
          }`,
          "promo_fuera_de_ventana"
        );
      }
    }
    if (promosLigadas.some(promoExigePickupInmediato) && new Date(hora_pickup).getTime() > Date.now() + 30 * 60_000) {
      throw badRequest("Tu pedido incluye un producto de horario limitado — la hora de recolección debe ser máximo 30 minutos después de pedirlo");
    }

    // Créditos aplicados (modalidad A) — solo se STAGEA aquí, no se descuenta
    // el saldo todavía; eso se confirma hasta la entrega (plan §7.1).
    // creditos_aplicados_mxn es un monto en PESOS (lo que cubre del total),
    // no la cantidad cruda de créditos — hay que convertir con valor_cd_mxn.
    let creditosAplicados = 0;
    if (creditos_aplicados_mxn) {
      const { rows: configRows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
      const config = configRows[0];
      if (!config || config.modalidad !== "credito_valor_mxn") {
        throw badRequest("La modalidad activa no permite aplicar créditos como pago");
      }
      const valorCd = Number(config.valor_cd_mxn);
      const { rows: saldoRows } = await query(`select creditos_disponibles from saldos_cliente_v where cliente_id = $1`, [cliente_id]);
      const saldoDisponibleMxn = Number(saldoRows[0]?.creditos_disponibles || 0) * valorCd;
      creditosAplicados = Math.min(Number(creditos_aplicados_mxn), saldoDisponibleMxn, totalMxn);
      creditosAplicados = Math.round(creditosAplicados * 100) / 100;
    }

    const client = await getClient();
    try {
      await client.query("begin");

      // Saldo a favor (monedero) — a diferencia de los créditos de
      // recompensa, esto SÍ es dinero real que el negocio ya tiene (viene de
      // cancelaciones de pedidos pagados), así que se descuenta de una vez
      // aquí mismo, dentro de la transacción, releyendo el saldo real para
      // no confiar en lo que calculó el celular.
      let monederoAplicado = 0;
      if (monedero_aplicado_mxn) {
        const { rows: clienteRows } = await client.query(`select saldo_monedero_mxn from clientes where id = $1 for update`, [cliente_id]);
        const saldoMonedero = Number(clienteRows[0]?.saldo_monedero_mxn || 0);
        monederoAplicado = Math.min(Number(monedero_aplicado_mxn), saldoMonedero, totalMxn - creditosAplicados);
        monederoAplicado = Math.max(0, Math.round(monederoAplicado * 100) / 100);
        if (monederoAplicado > 0) {
          await client.query(`update clientes set saldo_monedero_mxn = saldo_monedero_mxn - $2 where id = $1`, [cliente_id, monederoAplicado]);
        }
      }

      // Folio — fecha + consecutivo del día ("20261029-007"), para el
      // sticker/comanda y para poder buscar un pedido por teléfono/en
      // persona sin andar copiando el UUID. El consecutivo se saca de una
      // tabla contadora aparte (upsert atómico) para que sea seguro aunque
      // se creen dos pedidos al mismo tiempo — nunca un simple "cuenta +1".
      const diaHoy = diaLocalMexico();
      const { rows: contadorRows } = await client.query(
        `insert into contador_folios_diario (fecha, ultimo) values ($1, 1)
         on conflict (fecha) do update set ultimo = contador_folios_diario.ultimo + 1
         returning ultimo`,
        [diaHoy]
      );
      const folio = `${diaHoy.replace(/-/g, "")}-${String(contadorRows[0].ultimo).padStart(3, "0")}`;

      // Un pedido por liga de pago no entra a cocina hasta que el webhook de
      // Mercado Pago confirme el pago — "pendiente_pago" lo deja fuera de
      // ESTADOS_ACTIVOS (invisible en la Cola del staff) mientras tanto, para
      // no preparar algo que a lo mejor nunca se pagó.
      const estadoInicial = metodo_pago === "liga_mp" ? "pendiente_pago" : "recibido";
      const { rows: pedidoRows } = await client.query(
        `insert into pedidos (cliente_id, estado, hora_pickup, total_mxn, creditos_aplicados_mxn, monedero_aplicado_mxn, metodo_pago, folio)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [cliente_id, estadoInicial, hora_pickup, totalMxn, creditosAplicados, monederoAplicado, metodo_pago || "caja", folio]
      );
      const pedido = pedidoRows[0];

      if (monederoAplicado > 0) {
        await client.query(
          `insert into movimientos_monedero (cliente_id, monto, tipo, detalle, pedido_id) values ($1, $2, 'uso_pedido', $3, $4)`,
          [cliente_id, -monederoAplicado, `Aplicado al pedido ${folio}`, pedido.id]
        );
      }

      for (const item of itemsResueltos) {
        const { rows: itemRows } = await client.query(
          `insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario) values ($1, $2, $3, $4) returning id`,
          [pedido.id, item.producto_id, item.cantidad, item.precio_unitario]
        );
        const pedidoItemId = itemRows[0].id;
        for (const extra of item.extras) {
          await client.query(
            `insert into pedido_item_extras (pedido_item_id, extra_id, costo_unitario) values ($1, $2, $3)`,
            [pedidoItemId, extra.id, extra.costo]
          );
        }
      }

      // Canje en línea (fase A, ronda 7): el cliente ya tiene su recompensa
      // lista (modalidad credito_umbral o visitas) y la aplica ella misma al
      // pedido, sin pasar por caja — el saldo se revalida aquí mismo, DENTRO
      // de esta transacción, nunca confiando en lo que calculó el celular.
      // credito_valor_mxn NO pasa por aquí: ese ya se cubre con
      // creditos_aplicados_mxn arriba (puede cubrir hasta el 100% del total).
      let canjeAplicado = null;
      if (canjear_producto_id) {
        const { rows: configRows } = await client.query(`select * from configuracion_recompensa where vigente_hasta is null`);
        const config = configRows[0];
        if (!config || !["credito_umbral", "visitas"].includes(config.modalidad)) {
          throw conflict("La modalidad de recompensa activa no permite canjear un producto gratis así");
        }
        const { rows: elegibleRows } = await client.query(
          `select 1 from configuracion_recompensa_productos_elegibles where configuracion_recompensa_id = $1 and producto_id = $2`,
          [config.id, canjear_producto_id]
        );
        if (!elegibleRows[0]) throw badRequest("Ese producto no es elegible para tu recompensa actual");

        const { rows: saldoRows } = await client.query(`select * from saldos_cliente_v where cliente_id = $1`, [cliente_id]);
        const saldo = saldoRows[0] || { creditos_disponibles: 0, visitas_disponibles: 0 };

        let cantidadDescontada;
        if (config.modalidad === "credito_umbral") {
          if (Number(saldo.creditos_disponibles) < Number(config.umbral_cd)) {
            throw conflict("Ya no tienes suficientes créditos para este canje — puede que se te haya adelantado otra sesión");
          }
          cantidadDescontada = Number(config.umbral_cd);
        } else {
          if (Number(saldo.visitas_disponibles) < Number(config.umbral_visitas)) {
            throw conflict("Ya no tienes suficientes visitas para este canje — puede que se te haya adelantado otra sesión");
          }
          cantidadDescontada = Number(config.umbral_visitas);
        }

        const { rows: prodRows } = await client.query(`select id, nombre, precio from productos where id = $1`, [canjear_producto_id]);
        const productoRecompensa = prodRows[0];
        if (!productoRecompensa) throw notFound("Producto de recompensa no encontrado");

        await client.query(`insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario) values ($1, $2, 1, 0)`, [
          pedido.id,
          productoRecompensa.id,
        ]);

        const { rows: canjeRows } = await client.query(
          `insert into canjes (cliente_id, tipo, cantidad_descontada, producto_id, monto_cubierto_mxn, diferencia_pagada_caja, pedido_id, configuracion_recompensa_id, canal)
           values ($1, $2, $3, $4, $5, 0, $6, $7, 'en_linea') returning *`,
          [cliente_id, config.modalidad, cantidadDescontada, productoRecompensa.id, productoRecompensa.precio, pedido.id, config.id]
        );
        canjeAplicado = canjeRows[0];
      }

      await client.query("commit");
      res.status(201).json({ pedido, canje: canjeAplicado });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  })
);

// ---------------------------------------------------------------------
// GET /pedidos/mios  — historial propio del cliente (fase3 §10)
// ---------------------------------------------------------------------
pedidosRouter.get(
  "/mios",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select id, estado, hora_pickup, total_mxn, creditos_aplicados_mxn, created_at
       from pedidos where cliente_id = $1 order by created_at desc limit 50`,
      [req.cliente.id]
    );
    res.json({ pedidos: rows });
  })
);

// ---------------------------------------------------------------------
// GET /pedidos/cola?estado=  — KDS (staff/admin)
// ---------------------------------------------------------------------
pedidosRouter.get(
  "/cola",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const estado = req.query.estado;
    const estados = estado ? [estado] : ESTADOS_ACTIVOS;
    // "Entregados" es historial DEL DÍA (fase7 §3) — no acumula sin límite;
    // la cola activa (sin ?estado= o uno de los 3 activos) no necesita tope.
    const soloHoy = estado && ESTADOS_FINALES.includes(estado);
    const { minutos: tolerancia } = await obtenerConfig("pedidos_tolerancia_minutos");

    const valores = [estados, tolerancia];
    if (soloHoy) valores.push(inicioDeHoyMexicoUTC());

    const { rows } = await query(
      `select p.id, p.folio, p.cliente_id, p.estado, p.hora_pickup, p.total_mxn, p.creditos_aplicados_mxn, p.created_at,
              c.nombre, c.apellido_paterno,
              (p.hora_pickup < now() - ($2::text || ' minutes')::interval) as vencido,
              (select json_agg(json_build_object('cantidad', pi.cantidad, 'producto_nombre', pr.nombre))
                 from pedido_items pi join productos pr on pr.id = pi.producto_id
                 where pi.pedido_id = p.id) as items
       from pedidos p
       join clientes c on c.id = p.cliente_id
       where p.estado = any($1::estado_pedido[])
       ${soloHoy ? "and p.updated_at >= $3::timestamptz" : ""}
       order by p.hora_pickup`,
      valores
    );
    res.json({ pedidos: rows });
  })
);

// ---------------------------------------------------------------------
// GET /pedidos/:id  — detalle con items (fase3 §8: línea de tiempo del
// pedido en curso). El cliente solo puede ver el suyo; el staff, cualquiera.
// Va después de /cola y /mios/reporte (rutas literales) a propósito —
// si fuera antes, ":id" atraparía "cola" como si fuera un uuid y tronaría.
// ---------------------------------------------------------------------
pedidosRouter.get(
  "/:id",
  requireClienteOStaffAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select p.*, c.nombre, c.apellido_paterno
       from pedidos p join clientes c on c.id = p.cliente_id
       where p.id = $1`,
      [req.params.id]
    );
    const pedido = rows[0];
    if (!pedido) throw notFound("Pedido no encontrado");
    if (req.cliente && pedido.cliente_id !== req.cliente.id) throw forbidden("Ese pedido no es tuyo");

    const { rows: items } = await query(
      `select pi.id, pi.cantidad, pi.precio_unitario, pr.nombre as producto_nombre
       from pedido_items pi join productos pr on pr.id = pi.producto_id
       where pi.pedido_id = $1`,
      [req.params.id]
    );
    const { rows: extras } = await query(
      `select pie.pedido_item_id, pie.costo_unitario, e.nombre as extra_nombre
       from pedido_item_extras pie
       join extras e on e.id = pie.extra_id
       where pie.pedido_item_id = any($1::uuid[])`,
      [items.map((i) => i.id)]
    );

    res.json({
      pedido: {
        ...pedido,
        items: items.map((item) => ({ ...item, extras: extras.filter((e) => e.pedido_item_id === item.id) })),
      },
    });
  })
);

// ---------------------------------------------------------------------
// PATCH /pedidos/:id/estado  — avanza recibido→preparando→listo (staff/admin).
// "entregado" NO se marca aquí — solo vía POST /movimientos (plan §7.1),
// que es donde se confirma el cobro real.
// ---------------------------------------------------------------------
pedidosRouter.patch(
  "/:id/estado",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { estado } = req.body || {};
    if (!["preparando", "listo"].includes(estado)) {
      throw badRequest('estado debe ser "preparando" o "listo" — "entregado" se confirma en el escaneo, no aquí');
    }

    const { rows } = await query(
      `select p.estado, p.cliente_id, c.correo from pedidos p join clientes c on c.id = p.cliente_id where p.id = $1`,
      [req.params.id]
    );
    const pedido = rows[0];
    if (!pedido) throw notFound("Pedido no encontrado");
    if (ESTADOS_FINALES.includes(pedido.estado)) {
      throw conflict(`Ese pedido ya está en estado "${pedido.estado}"`);
    }

    const { rows: updRows } = await query(
      `update pedidos set estado = $2, updated_at = now() where id = $1 returning *`,
      [req.params.id, estado]
    );

    // Bandeja de notificaciones del cliente (fase A, ronda 6) — el disparador
    // ya existía (lib/notificar.js) pero nunca se conectó a los eventos de
    // pedido, así que la pestaña "Notificaciones" del cliente se quedaba
    // vacía para esto (solo se llenaba con promos). "Preparando" no avisa a
    // propósito (no aporta), solo "listo" — es el momento que sí importa.
    if (estado === "listo") {
      notificarClientesPorId([{ id: pedido.cliente_id, correo: pedido.correo }], {
        tipo: "pedido_listo",
        asunto: "Tu pedido está listo",
        texto: "¡Tu pedido está listo para recoger! Muéstrale tu QR al staff en caja.",
      }).catch(() => {});
    }

    res.json({ pedido: updRows[0] });
  })
);

// ---------------------------------------------------------------------
// POST /pedidos/:id/pagar-en-caja — el cliente se rinde con el pago en
// línea (p. ej. Mercado Pago le marcó error) y prefiere pagar al recoger.
// Solo mientras siga "pendiente_pago" — en cuanto esto corre, el pedido
// entra a la Cola del staff como cualquier pedido normal de caja.
// ---------------------------------------------------------------------
pedidosRouter.post(
  "/:id/pagar-en-caja",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select * from pedidos where id = $1`, [req.params.id]);
    const pedido = rows[0];
    if (!pedido) throw notFound("Pedido no encontrado");
    if (pedido.cliente_id !== req.cliente.id) throw forbidden("Ese pedido no es tuyo");
    if (pedido.estado !== "pendiente_pago") {
      throw conflict("Este pedido ya no está esperando pago en línea");
    }

    const { rows: updRows } = await query(
      `update pedidos set estado = 'recibido', metodo_pago = 'caja', updated_at = now() where id = $1 returning *`,
      [req.params.id]
    );
    res.json({ pedido: updRows[0] });
  })
);

// ---------------------------------------------------------------------
// POST /pedidos/:id/cancelar
// Cliente propio: solo mientras "recibido", nunca con penalización.
// Staff/admin: en cualquier momento; si ya venció (hora_pickup + tolerancia)
// decide si aplica penalización — plan-maestro §6 (11/13 sep 2026).
// ---------------------------------------------------------------------
pedidosRouter.post(
  "/:id/cancelar",
  requireClienteOStaffAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select * from pedidos where id = $1`, [req.params.id]);
    const pedido = rows[0];
    if (!pedido) throw notFound("Pedido no encontrado");
    if (ESTADOS_FINALES.includes(pedido.estado)) throw conflict(`Ese pedido ya está en estado "${pedido.estado}"`);

    if (req.cliente) {
      if (pedido.cliente_id !== req.cliente.id) throw forbidden("Ese pedido no es tuyo");
      if (!["recibido", "pendiente_pago"].includes(pedido.estado)) {
        throw conflict('Ya no se puede cancelar — el staff ya empezó a prepararlo. Pásate a caja.');
      }

      // El saldo a favor que ya traía aplicado este pedido nunca se "gastó"
      // de verdad (el pedido nunca se entregó) — se descongela siempre,
      // sin importar la forma de pago. Si además ya estaba pagado en línea,
      // lo que Mercado Pago cobró de más (todo menos créditos de recompensa
      // Y menos el saldo ya descongelado arriba, para no contarlo dos
      // veces) también regresa como saldo — no hay reembolso real a la
      // tarjeta, solo saldo usable en la próxima compra.
      let saldoGenerado = 0;
      const monederoDelPedido = Number(pedido.monedero_aplicado_mxn || 0);
      if (monederoDelPedido > 0) {
        await query(`update clientes set saldo_monedero_mxn = saldo_monedero_mxn + $2 where id = $1`, [pedido.cliente_id, monederoDelPedido]);
        await query(
          `insert into movimientos_monedero (cliente_id, monto, tipo, detalle, pedido_id) values ($1, $2, 'devolucion_cancelacion', $3, $4)`,
          [pedido.cliente_id, monederoDelPedido, `Saldo descongelado — pedido ${pedido.folio || pedido.id.slice(0, 8)} cancelado`, pedido.id]
        );
        saldoGenerado += monederoDelPedido;
      }
      if (pedido.pago_confirmado) {
        const reembolsoMp =
          Math.round((Number(pedido.total_mxn) - Number(pedido.creditos_aplicados_mxn || 0) - monederoDelPedido) * 100) / 100;
        if (reembolsoMp > 0) {
          await query(`update clientes set saldo_monedero_mxn = saldo_monedero_mxn + $2 where id = $1`, [pedido.cliente_id, reembolsoMp]);
          await query(
            `insert into movimientos_monedero (cliente_id, monto, tipo, detalle, pedido_id) values ($1, $2, 'devolucion_cancelacion', $3, $4)`,
            [pedido.cliente_id, reembolsoMp, `Reembolso — pedido ${pedido.folio || pedido.id.slice(0, 8)} pagado en línea y cancelado`, pedido.id]
          );
          saldoGenerado += reembolsoMp;
        }
      }

      const { rows: updRows } = await query(
        `update pedidos set estado = 'cancelado', updated_at = now() where id = $1 returning *`,
        [req.params.id]
      );
      return res.json({ pedido: updRows[0], penalizacion: null, saldo_generado_mxn: saldoGenerado || undefined });
    }

    const { con_penalizacion, pin, motivo } = req.body || {};

    // Cancelar algo que ya está "preparando" (staff/admin) implica
    // ingredientes/tiempo ya gastados — exige el mismo PIN de corrección
    // que ya protege editar/anular movimientos, y guardar por qué.
    if (pedido.estado === "preparando") {
      if (!pin) throw badRequest("Falta el PIN de admin para cancelar un pedido en preparación");
      if (!motivo?.trim()) throw badRequest("Falta especificar el motivo de la cancelación");
      const pinGuardado = await obtenerConfig("pin_correccion");
      if (!pinGuardado?.pin) {
        throw conflict("Todavía no se ha configurado un PIN de corrección (desde configuración del sistema)");
      }
      if (String(pin) !== String(pinGuardado.pin)) throw badRequest("PIN incorrecto", "pin_incorrecto");
    }

    const { minutos: tolerancia } = await obtenerConfig("pedidos_tolerancia_minutos");
    const vencido = new Date(pedido.hora_pickup).getTime() + tolerancia * 60_000 < Date.now();

    const nuevoEstado = vencido ? "no_recogido" : "cancelado";
    const aplicaPenalizacion = vencido && Boolean(con_penalizacion);

    let canjeCreado = null;
    if (aplicaPenalizacion) {
      const { rows: configRows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
      const config = configRows[0];
      if (config) {
        const { rows: saldoRows } = await query(`select * from saldos_cliente_v where cliente_id = $1`, [pedido.cliente_id]);
        const saldo = saldoRows[0] || { creditos_disponibles: 0, visitas_disponibles: 0 };

        let tipo = null;
        let cantidad = 0;
        if (config.modalidad === "credito_valor_mxn") {
          const valorPedidoCd = config.valor_cd_mxn > 0 ? Number(pedido.total_mxn) / Number(config.valor_cd_mxn) : 0;
          cantidad = Math.min(Number(saldo.creditos_disponibles), valorPedidoCd);
          tipo = "penalizacion_creditos";
        } else if (config.modalidad === "credito_umbral") {
          const disponible = Number(saldo.creditos_disponibles);
          cantidad = disponible < Number(config.umbral_cd) ? disponible : Number(config.umbral_cd);
          tipo = "penalizacion_creditos";
        } else if (config.modalidad === "visitas") {
          cantidad = Number(saldo.visitas_disponibles);
          tipo = "penalizacion_visitas";
        }

        cantidad = Math.round(cantidad * 100) / 100;
        if (tipo && cantidad > 0) {
          const { rows: canjeRows } = await query(
            `insert into canjes (cliente_id, tipo, cantidad_descontada, pedido_id, configuracion_recompensa_id, autorizado_por)
             values ($1, $2, $3, $4, $5, $6) returning *`,
            [pedido.cliente_id, tipo, cantidad, pedido.id, config.id, req.staff.id]
          );
          canjeCreado = canjeRows[0];
        }
      }
    }

    // El saldo a favor congelado en este pedido nunca se entregó — se
    // descongela igual que en una cancelación del cliente, sin importar si
    // además hubo penalización a los créditos/visitas de recompensa (son
    // dos bolsas distintas; la penalización no toca el monedero).
    const monederoDelPedido = Number(pedido.monedero_aplicado_mxn || 0);
    if (monederoDelPedido > 0) {
      await query(`update clientes set saldo_monedero_mxn = saldo_monedero_mxn + $2 where id = $1`, [pedido.cliente_id, monederoDelPedido]);
      await query(
        `insert into movimientos_monedero (cliente_id, monto, tipo, detalle, pedido_id) values ($1, $2, 'devolucion_cancelacion', $3, $4)`,
        [pedido.cliente_id, monederoDelPedido, `Saldo descongelado — pedido ${pedido.folio || pedido.id.slice(0, 8)} (${nuevoEstado})`, pedido.id]
      );
    }

    const { rows: updRows } = await query(
      `update pedidos set estado = $2, motivo_cancelacion = coalesce($3, motivo_cancelacion), updated_at = now() where id = $1 returning *`,
      [req.params.id, nuevoEstado, motivo?.trim() || null]
    );

    res.json({ pedido: updRows[0], penalizacion: canjeCreado, saldo_generado_mxn: monederoDelPedido || undefined });
  })
);
