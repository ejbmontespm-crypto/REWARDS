import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound, conflict } from "../lib/errors.js";
import { requireStaffAuth, requireRole, requireClienteAuth } from "../middleware/auth.js";

export const solicitudesCanjeRouter = Router();

// ---------------------------------------------------------------------
// POST /solicitudes-canje
// El "quiero redimir" del cliente (plan §5 / fase3 §4) — se valida que
// de verdad cumpla la regla antes de dejarlo pendiente para el staff.
// ---------------------------------------------------------------------
solicitudesCanjeRouter.post(
  "/",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const cliente_id = req.cliente.id;

    const { rows: pendientes } = await query(
      `select id from solicitudes_canje where cliente_id = $1 and estado = 'pendiente'`,
      [cliente_id]
    );
    if (pendientes[0]) throw conflict("Ya hay una solicitud de redención pendiente para este cliente");

    const { rows: configRows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
    const config = configRows[0];
    if (!config) throw conflict("No hay una regla de recompensa activa");

    const { rows: saldoRows } = await query(`select * from saldos_cliente_v where cliente_id = $1`, [cliente_id]);
    const saldo = saldoRows[0] || { creditos_disponibles: 0, visitas_disponibles: 0 };

    if (config.modalidad === "credito_valor_mxn" && Number(saldo.creditos_disponibles) <= 0) {
      throw conflict("No tienes créditos disponibles para redimir");
    }
    if (config.modalidad === "credito_umbral" && Number(saldo.creditos_disponibles) < Number(config.umbral_cd)) {
      throw conflict("Todavía no llegas al umbral de créditos necesario");
    }
    if (config.modalidad === "visitas" && Number(saldo.visitas_disponibles) < Number(config.umbral_visitas)) {
      throw conflict("Todavía no llegas al número de visitas necesario");
    }

    const { rows } = await query(
      `insert into solicitudes_canje (cliente_id, tipo, estado) values ($1, $2, 'pendiente') returning *`,
      [cliente_id, config.modalidad]
    );
    res.status(201).json({ solicitud: rows[0] });
  })
);

// ---------------------------------------------------------------------
// GET /solicitudes-canje?estado=pendiente&cliente_id=  (staff/admin)
// ---------------------------------------------------------------------
solicitudesCanjeRouter.get(
  "/",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const condiciones = [];
    const valores = [];
    if (req.query.estado) {
      valores.push(req.query.estado);
      condiciones.push(`estado = $${valores.length}`);
    }
    if (req.query.cliente_id) {
      valores.push(req.query.cliente_id);
      condiciones.push(`cliente_id = $${valores.length}`);
    }
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";
    const { rows } = await query(
      `select sc.*, c.nombre, c.apellido_paterno from solicitudes_canje sc
       join clientes c on c.id = sc.cliente_id
       ${where} order by sc.creado_en`,
      valores
    );
    res.json({ solicitudes: rows });
  })
);

// ---------------------------------------------------------------------
// PATCH /solicitudes-canje/:id  — cancelar una solicitud pendiente (staff/admin)
// ---------------------------------------------------------------------
solicitudesCanjeRouter.patch(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    if (req.body?.estado !== "cancelada") throw badRequest('El único cambio manual permitido es estado: "cancelada"');
    const { rows } = await query(
      `update solicitudes_canje set estado = 'cancelada' where id = $1 and estado = 'pendiente' returning *`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("Solicitud no encontrada o ya no está pendiente");
    res.json({ solicitud: rows[0] });
  })
);
