import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound, conflict } from "../lib/errors.js";
import { requireStaffAuth, requireRole, requireClienteAuth } from "../middleware/auth.js";
import { obtenerConfig } from "../lib/config.js";
import { calcularAcumulacion, diaLocalMexico } from "../lib/recompensa.js";
import { exportarXlsx } from "../lib/exportarExcel.js";

export const movimientosRouter = Router();

// ---------------------------------------------------------------------
// GET /movimientos/mios — historial de compras propio (fase3 §10: "lista
// de fecha + monto de cada movimiento"). Va antes de GET / para no
// chocar con el reporte de admin.
// ---------------------------------------------------------------------
movimientosRouter.get(
  "/mios",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select id, monto, creditos_generados, cuenta_como_visita, created_at
       from movimientos where cliente_id = $1 order by created_at desc limit 100`,
      [req.cliente.id]
    );
    res.json({ movimientos: rows });
  })
);

// ---------------------------------------------------------------------
// GET /movimientos?fecha_desde=&fecha_hasta=&export=xlsx
// Reporte de Ventas (fase8 §1) — no estaba en el mapa original de
// fase6-backend-api.md como endpoint aparte; se agrega aquí porque es
// el mismo recurso.
// ---------------------------------------------------------------------
movimientosRouter.get(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { fecha_desde, fecha_hasta, export: exportar } = req.query;
    const condiciones = [];
    const valores = [];
    if (fecha_desde) {
      valores.push(fecha_desde);
      condiciones.push(`m.created_at >= $${valores.length}`);
    }
    if (fecha_hasta) {
      valores.push(fecha_hasta);
      condiciones.push(`m.created_at < ($${valores.length}::date + 1)`);
    }
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

    const { rows } = await query(
      `select m.id, m.created_at, m.monto, m.creditos_generados, m.cuenta_como_visita,
              c.nombre, c.apellido_paterno, u.nombre_completo as registrado_por
       from movimientos m
       join clientes c on c.id = m.cliente_id
       join usuarios_staff u on u.id = m.registrado_por
       ${where}
       order by m.created_at desc
       limit 5000`,
      valores
    );

    if (exportar !== "xlsx") return res.json({ movimientos: rows });

    await exportarXlsx(res, {
      nombreArchivo: "ventas.xlsx",
      nombreHoja: "Ventas",
      columnas: [
        { header: "Fecha", key: "fecha", width: 20 },
        { header: "Cliente", key: "cliente", width: 28 },
        { header: "Monto", key: "monto", width: 12 },
        { header: "Créditos generados", key: "creditos", width: 16 },
        { header: "Cuenta como visita", key: "visita", width: 14 },
        { header: "Registrado por", key: "staff", width: 22 },
      ],
      filas: rows.map((m) => ({
        fecha: new Date(m.created_at).toLocaleString("es-MX"),
        cliente: `${m.nombre} ${m.apellido_paterno}`,
        monto: Number(m.monto),
        creditos: Number(m.creditos_generados),
        visita: m.cuenta_como_visita ? "Sí" : "No",
        staff: m.registrado_por,
      })),
    });
  })
);

// ---------------------------------------------------------------------
// POST /movimientos
// Cubre los dos casos del flujo unificado (plan §7.1): venta de
// mostrador tecleada a mano (monto), o confirmar la entrega de un
// pedido de la app (pedido_id — el monto sale de ahí, no se teclea).
// ---------------------------------------------------------------------
movimientosRouter.post(
  "/",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { cliente_id, monto, pedido_id } = req.body || {};
    if (!cliente_id) throw badRequest("Falta cliente_id");
    if (monto == null && !pedido_id) throw badRequest("Manda monto (venta de mostrador) o pedido_id (entrega de pedido)");

    let montoFinal = monto;
    let pedido = null;

    if (pedido_id) {
      const { rows } = await query(`select * from pedidos where id = $1`, [pedido_id]);
      pedido = rows[0];
      if (!pedido) throw notFound("Pedido no encontrado");
      if (pedido.cliente_id !== cliente_id) throw badRequest("Ese pedido no es de este cliente");
      if (!["recibido", "preparando", "listo"].includes(pedido.estado)) {
        throw conflict(`Ese pedido ya está en estado "${pedido.estado}", no se puede confirmar de nuevo`);
      }
      montoFinal = Number(pedido.total_mxn);
    }

    if (montoFinal == null || Number(montoFinal) < 0) throw badRequest("monto inválido");

    const { rows: configRows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
    const config = configRows[0];
    if (!config) throw conflict("No hay una regla de recompensa activa — configúrala antes de registrar ventas");

    const diaLocal = diaLocalMexico();
    const { creditosGenerados, cuentaComoVisita } = await calcularAcumulacion({
      config,
      monto: Number(montoFinal),
      clienteId: cliente_id,
      diaLocal,
    });

    const { rows: movRows } = await query(
      `insert into movimientos
         (cliente_id, tipo_evento, monto, creditos_generados, cuenta_como_visita, dia_local, configuracion_recompensa_id, registrado_por, pedido_id)
       values ($1, 'venta', $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [cliente_id, montoFinal, creditosGenerados, cuentaComoVisita, diaLocal, config.id, req.staff.id, pedido_id || null]
    );

    let canjeCreado = null;
    if (pedido) {
      await query(`update pedidos set estado = 'entregado', updated_at = now() where id = $1`, [pedido_id]);

      // Si el pedido traía créditos aplicados como pago (modalidad A), aquí
      // se confirma la redención — no antes (plan §7.1). Convierte de MXN
      // (lo que se guardó en el pedido) a cd, con la regla activa en este
      // momento — si ya no es credito_valor_mxn, se deja sin cobrar (caso
      // raro: la regla cambió entre que se armó el carrito y se entregó).
      const creditosAplicadosMxn = Number(pedido.creditos_aplicados_mxn || 0);
      if (creditosAplicadosMxn > 0 && config.modalidad === "credito_valor_mxn" && Number(config.valor_cd_mxn) > 0) {
        const cdADescontar = Math.round((creditosAplicadosMxn / Number(config.valor_cd_mxn)) * 100) / 100;
        const { rows: canjeRows } = await query(
          `insert into canjes (cliente_id, tipo, cantidad_descontada, monto_cubierto_mxn, pedido_id, configuracion_recompensa_id, autorizado_por)
           values ($1, 'credito_valor_mxn', $2, $3, $4, $5, $6) returning *`,
          [cliente_id, cdADescontar, creditosAplicadosMxn, pedido_id, config.id, req.staff.id]
        );
        canjeCreado = canjeRows[0];
      }
    }

    const { rows: saldoRows } = await query(`select * from saldos_cliente_v where cliente_id = $1`, [cliente_id]);

    res.status(201).json({ movimiento: movRows[0], canje: canjeCreado, saldo: saldoRows[0] });
  })
);

// ---------------------------------------------------------------------
// POST /movimientos/:id/correccion  — editar o anular, con PIN
// ---------------------------------------------------------------------
movimientosRouter.post(
  "/:id/correccion",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { accion, pin, monto_nuevo } = req.body || {};
    if (!["editar", "anular"].includes(accion)) throw badRequest('accion debe ser "editar" o "anular"');
    if (!pin) throw badRequest("Falta el PIN de corrección");

    const pinGuardado = await obtenerConfig("pin_correccion");
    if (!pinGuardado?.pin) {
      throw conflict("Todavía no se ha configurado un PIN de corrección (desde configuración del sistema)");
    }
    if (String(pin) !== String(pinGuardado.pin)) throw badRequest("PIN incorrecto", "pin_incorrecto");

    const { rows } = await query(`select * from movimientos where id = $1`, [req.params.id]);
    const movimiento = rows[0];
    if (!movimiento) throw notFound("Movimiento no encontrado");

    const valoresAnteriores = {
      monto: movimiento.monto,
      creditos_generados: movimiento.creditos_generados,
      cuenta_como_visita: movimiento.cuenta_como_visita,
    };
    let valoresNuevos;
    let movimientoActualizado;

    if (accion === "anular") {
      valoresNuevos = { monto: movimiento.monto, creditos_generados: 0, cuenta_como_visita: false };
      const { rows: upd } = await query(
        `update movimientos set creditos_generados = 0, cuenta_como_visita = false,
                nota = trim(both ' ' from coalesce(nota, '') || ' [Anulado]')
         where id = $1 returning *`,
        [req.params.id]
      );
      movimientoActualizado = upd[0];
    } else {
      if (monto_nuevo == null || Number(monto_nuevo) < 0) throw badRequest("Falta monto_nuevo o es inválido");

      const { rows: configRows } = await query(`select * from configuracion_recompensa where id = $1`, [
        movimiento.configuracion_recompensa_id,
      ]);
      const config = configRows[0];
      const { creditosGenerados, cuentaComoVisita } = await calcularAcumulacion({
        config,
        monto: Number(monto_nuevo),
        clienteId: movimiento.cliente_id,
        diaLocal: movimiento.dia_local,
        movimientoId: movimiento.id,
      });

      valoresNuevos = { monto: monto_nuevo, creditos_generados: creditosGenerados, cuenta_como_visita: cuentaComoVisita };
      const { rows: upd } = await query(
        `update movimientos set monto = $2, creditos_generados = $3, cuenta_como_visita = $4 where id = $1 returning *`,
        [req.params.id, monto_nuevo, creditosGenerados, cuentaComoVisita]
      );
      movimientoActualizado = upd[0];
    }

    await query(
      `insert into correcciones_movimiento (movimiento_id, accion, valores_anteriores, valores_nuevos, realizado_por)
       values ($1, $2, $3, $4, $5)`,
      [req.params.id, accion, JSON.stringify(valoresAnteriores), JSON.stringify(valoresNuevos), req.staff.id]
    );

    res.json({ movimiento: movimientoActualizado });
  })
);
