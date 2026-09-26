import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound, conflict } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";
import { exportarXlsx } from "../lib/exportarExcel.js";

export const canjesRouter = Router();

// ---------------------------------------------------------------------
// GET /canjes?fecha_desde=&fecha_hasta=&tipo=&export=xlsx
// Reporte de Canjes (fase8 §1) — incluye penalizaciones y expiraciones,
// que también viven en esta tabla.
// ---------------------------------------------------------------------
canjesRouter.get(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { fecha_desde, fecha_hasta, tipo, export: exportar } = req.query;
    const condiciones = [];
    const valores = [];
    if (fecha_desde) {
      valores.push(fecha_desde);
      condiciones.push(`ca.created_at >= $${valores.length}`);
    }
    if (fecha_hasta) {
      valores.push(fecha_hasta);
      condiciones.push(`ca.created_at < ($${valores.length}::date + 1)`);
    }
    if (tipo) {
      valores.push(tipo);
      condiciones.push(`ca.tipo = $${valores.length}`);
    }
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

    const { rows } = await query(
      `select ca.id, ca.created_at, ca.tipo, ca.cantidad_descontada,
              c.nombre, c.apellido_paterno, p.nombre as producto_nombre, u.nombre_completo as autorizado_por
       from canjes ca
       join clientes c on c.id = ca.cliente_id
       left join productos p on p.id = ca.producto_id
       left join usuarios_staff u on u.id = ca.autorizado_por
       ${where}
       order by ca.created_at desc
       limit 5000`,
      valores
    );

    if (exportar !== "xlsx") return res.json({ canjes: rows });

    await exportarXlsx(res, {
      nombreArchivo: "canjes.xlsx",
      nombreHoja: "Canjes",
      columnas: [
        { header: "Fecha", key: "fecha", width: 20 },
        { header: "Cliente", key: "cliente", width: 28 },
        { header: "Tipo", key: "tipo", width: 20 },
        { header: "Cantidad descontada", key: "cantidad", width: 16 },
        { header: "Producto", key: "producto", width: 24 },
        { header: "Autorizado por", key: "staff", width: 22 },
      ],
      filas: rows.map((c) => ({
        fecha: new Date(c.created_at).toLocaleString("es-MX"),
        cliente: `${c.nombre} ${c.apellido_paterno}`,
        tipo: c.tipo,
        cantidad: Number(c.cantidad_descontada),
        producto: c.producto_nombre || "—",
        staff: c.autorizado_por || "Sistema (automático)",
      })),
    });
  })
);

// ---------------------------------------------------------------------
// POST /canjes — confirma en caja una solicitud de redención pendiente
// (plan §7.1: staff la ve en el escaneo y la aplica). Esto es una
// redención real; las penalizaciones por no recoger un pedido viven en
// POST /pedidos/:id/cancelar, no aquí.
// ---------------------------------------------------------------------
canjesRouter.post(
  "/",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { solicitud_id, producto_id } = req.body || {};
    if (!solicitud_id) throw badRequest("Falta solicitud_id");

    const { rows: solRows } = await query(`select * from solicitudes_canje where id = $1`, [solicitud_id]);
    const solicitud = solRows[0];
    if (!solicitud) throw notFound("Solicitud no encontrada");
    if (solicitud.estado !== "pendiente") throw conflict(`Esa solicitud ya está "${solicitud.estado}"`);

    const { rows: configRows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
    const config = configRows[0];
    if (!config || config.modalidad !== solicitud.tipo) {
      throw conflict("La regla de recompensa cambió desde que se hizo la solicitud — pide que la vuelva a solicitar");
    }

    const { rows: saldoRows } = await query(`select * from saldos_cliente_v where cliente_id = $1`, [solicitud.cliente_id]);
    const saldo = saldoRows[0] || { creditos_disponibles: 0, visitas_disponibles: 0 };

    let cantidadDescontada = 0;
    let montoCubierto = null;
    let diferenciaCaja = null;
    let productoFinal = producto_id || null;

    if (config.modalidad === "credito_valor_mxn") {
      if (!producto_id) throw badRequest("Falta producto_id (la bebida que va a pagar con créditos)");
      const { rows: prodRows } = await query(`select id, nombre, precio from productos where id = $1`, [producto_id]);
      const producto = prodRows[0];
      if (!producto) throw notFound("Producto no encontrado");

      const saldoDisponibleMxn = Number(saldo.creditos_disponibles) * Number(config.valor_cd_mxn);
      montoCubierto = Math.min(Number(producto.precio), saldoDisponibleMxn);
      diferenciaCaja = Math.round((Number(producto.precio) - montoCubierto) * 100) / 100;
      cantidadDescontada = Math.round((montoCubierto / Number(config.valor_cd_mxn)) * 100) / 100;
    } else if (config.modalidad === "credito_umbral") {
      if (Number(saldo.creditos_disponibles) < Number(config.umbral_cd)) {
        throw conflict("Ya no tiene suficientes créditos para este canje");
      }
      productoFinal = await validarProductoElegible(producto_id, config.id, "Falta producto_id, o no está en la lista de productos elegibles");
      cantidadDescontada = Number(config.umbral_cd);
      diferenciaCaja = 0;
    } else if (config.modalidad === "visitas") {
      if (Number(saldo.visitas_disponibles) < Number(config.umbral_visitas)) {
        throw conflict("Ya no tiene suficientes visitas para este canje");
      }
      productoFinal = await validarProductoElegible(producto_id, config.id, "Falta producto_id, o no está en la lista de productos elegibles");
      cantidadDescontada = Number(config.umbral_visitas);
      diferenciaCaja = 0;
    }

    const { rows: canjeRows } = await query(
      `insert into canjes (cliente_id, tipo, cantidad_descontada, producto_id, monto_cubierto_mxn, diferencia_pagada_caja, configuracion_recompensa_id, autorizado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [solicitud.cliente_id, config.modalidad, cantidadDescontada, productoFinal, montoCubierto, diferenciaCaja, config.id, req.staff.id]
    );

    await query(`update solicitudes_canje set estado = 'atendida', atendida_en = now(), canje_id = $2 where id = $1`, [
      solicitud_id,
      canjeRows[0].id,
    ]);

    const { rows: saldoFinal } = await query(`select * from saldos_cliente_v where cliente_id = $1`, [solicitud.cliente_id]);
    res.status(201).json({ canje: canjeRows[0], saldo: saldoFinal[0] });
  })
);

async function validarProductoElegible(productoId, configuracionId, mensajeError) {
  if (!productoId) throw badRequest(mensajeError);
  const { rows } = await query(
    `select 1 from configuracion_recompensa_productos_elegibles where configuracion_recompensa_id = $1 and producto_id = $2`,
    [configuracionId, productoId]
  );
  if (!rows[0]) throw badRequest(mensajeError);
  return productoId;
}
