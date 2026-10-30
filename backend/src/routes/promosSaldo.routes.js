import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";

export const promosSaldoRouter = Router();
promosSaldoRouter.use(requireStaffAuth, requireRole("admin"));

const TIPOS = ["credito_mxn", "bebida_gratis"];
const FILTROS = ["clientes", "perfil", "todos"];
const PERFILES = ["alumno", "docente", "otro"];

// ---------------------------------------------------------------------
// GET /promos-saldo — historial de campañas aplicadas (solo admin).
// ---------------------------------------------------------------------
promosSaldoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select h.*, p.nombre as producto_nombre, u.nombre_completo as creado_por_nombre
       from promos_saldo_historial h
       left join productos p on p.id = h.producto_id
       left join usuarios_staff u on u.id = h.creado_por
       order by h.created_at desc
       limit 200`
    );
    res.json({ promos: rows });
  })
);

// ---------------------------------------------------------------------
// POST /promos-saldo/aplicar — otorga crédito en pesos (o el precio de un
// producto, si es "bebida gratis") a los clientes que coincidan con el
// filtro, YA MISMO — no es una regla que se evalúa sola después (a
// diferencia de la promo de cumpleaños), es una acción puntual del admin.
// ---------------------------------------------------------------------
promosSaldoRouter.post(
  "/aplicar",
  asyncHandler(async (req, res) => {
    const { nombre, tipo, monto_mxn, producto_id, filtro_tipo, filtro_perfil, clientes_ids } = req.body || {};

    if (!nombre?.trim()) throw badRequest("Falta nombre");
    if (!TIPOS.includes(tipo)) throw badRequest(`tipo debe ser uno de: ${TIPOS.join(", ")}`);
    if (!FILTROS.includes(filtro_tipo)) throw badRequest(`filtro_tipo debe ser uno de: ${FILTROS.join(", ")}`);
    if (filtro_tipo === "clientes" && (!Array.isArray(clientes_ids) || clientes_ids.length === 0)) {
      throw badRequest("Falta clientes_ids — elige al menos un cliente");
    }
    if (filtro_tipo === "perfil" && !PERFILES.includes(filtro_perfil)) {
      throw badRequest(`filtro_perfil debe ser uno de: ${PERFILES.join(", ")}`);
    }

    let montoPorCliente = Number(monto_mxn);
    let productoFinal = null;
    if (tipo === "bebida_gratis") {
      if (!producto_id) throw badRequest("Falta producto_id");
      const { rows: prodRows } = await query(`select id, nombre, precio from productos where id = $1`, [producto_id]);
      if (!prodRows[0]) throw notFound("Producto no encontrado");
      montoPorCliente = Number(prodRows[0].precio);
      productoFinal = prodRows[0].id;
    } else {
      if (!(montoPorCliente > 0)) throw badRequest("monto_mxn debe ser mayor a 0");
    }
    montoPorCliente = Math.round(montoPorCliente * 100) / 100;

    // Resuelve la lista de clientes según el filtro — siempre contra la
    // base real al momento de aplicar, nunca una lista que el panel haya
    // calculado antes (un alumno pudo haberse dado de baja mientras tanto).
    let clienteIds;
    if (filtro_tipo === "todos") {
      const { rows } = await query(`select id from clientes`);
      clienteIds = rows.map((r) => r.id);
    } else if (filtro_tipo === "perfil") {
      const { rows } = await query(`select id from clientes where tipo_perfil = $1`, [filtro_perfil]);
      clienteIds = rows.map((r) => r.id);
    } else {
      const { rows } = await query(`select id from clientes where id = any($1::uuid[])`, [clientes_ids]);
      clienteIds = rows.map((r) => r.id);
    }
    if (clienteIds.length === 0) throw badRequest("Ningún cliente coincide con ese filtro");

    const detalle = `Promo: ${nombre.trim()}`;
    for (const clienteId of clienteIds) {
      await query(`update clientes set saldo_monedero_mxn = saldo_monedero_mxn + $2 where id = $1`, [clienteId, montoPorCliente]);
      await query(`insert into movimientos_monedero (cliente_id, monto, tipo, detalle) values ($1, $2, 'promo', $3)`, [
        clienteId,
        montoPorCliente,
        detalle,
      ]);
    }

    const { rows: historialRows } = await query(
      `insert into promos_saldo_historial
         (nombre, tipo, monto_mxn, producto_id, filtro_tipo, filtro_perfil, cantidad_clientes, creado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [nombre.trim(), tipo, montoPorCliente, productoFinal, filtro_tipo, filtro_tipo === "perfil" ? filtro_perfil : null, clienteIds.length, req.staff.id]
    );

    res.status(201).json({ promo: historialRows[0], clientes_afectados: clienteIds.length, monto_por_cliente: montoPorCliente });
  })
);
