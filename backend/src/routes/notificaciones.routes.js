import { Router } from "express";
import ExcelJS from "exceljs";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole, requireClienteAuth } from "../middleware/auth.js";

export const notificacionesRouter = Router();

// ---------------------------------------------------------------------
// GET /notificaciones/mias  — bandeja del cliente (fase3 §4.1). Misma
// consulta que ya usaba GET /clientes/:id/notificaciones para el staff;
// aquí el cliente sale de la sesión, no de :id. No se guarda asunto/texto
// por notificación (notificaciones_log es un log de entrega, no un buzón
// de mensajes) — el tipo se traduce a texto legible del lado de la app.
// ---------------------------------------------------------------------
notificacionesRouter.get(
  "/mias",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select id, canal, tipo, estado, leido_en, created_at
       from notificaciones_log where cliente_id = $1 order by created_at desc limit 50`,
      [req.cliente.id]
    );
    res.json({ notificaciones: rows });
  })
);

// ---------------------------------------------------------------------
// PATCH /notificaciones/:id/leido — solo puede marcar como leída una
// notificación propia (nunca la de otro cliente, aunque adivine el id).
// ---------------------------------------------------------------------
notificacionesRouter.patch(
  "/:id/leido",
  requireClienteAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `update notificaciones_log set leido_en = coalesce(leido_en, now())
       where id = $1 and cliente_id = $2
       returning id, leido_en`,
      [req.params.id, req.cliente.id]
    );
    if (!rows[0]) throw notFound("Notificación no encontrada");
    res.json({ notificacion: rows[0] });
  })
);

// ---------------------------------------------------------------------
// GET /notificaciones/log?fecha_desde=&fecha_hasta=&tipo=&canal=&estado=&export=xlsx
// Reporte del admin (fase8-reportes-pulido.md §1).
// ---------------------------------------------------------------------
notificacionesRouter.get(
  "/log",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { fecha_desde, fecha_hasta, tipo, canal, estado, export: exportar } = req.query;

    const condiciones = [];
    const valores = [];
    const agregar = (sql, valor) => {
      valores.push(valor);
      condiciones.push(sql.replace("?", `$${valores.length}`));
    };
    if (fecha_desde) agregar("nl.created_at >= ?", fecha_desde);
    if (fecha_hasta) agregar("nl.created_at < (?::date + 1)", fecha_hasta);
    if (tipo) agregar("nl.tipo = ?", tipo);
    if (canal) agregar("nl.canal = ?", canal);
    if (estado) agregar("nl.estado = ?", estado);
    const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

    const { rows } = await query(
      `select nl.id, nl.canal, nl.tipo, nl.estado, nl.detalle, nl.created_at,
              c.nombre, c.apellido_paterno, c.correo
       from notificaciones_log nl
       left join clientes c on c.id = nl.cliente_id
       ${where}
       order by nl.created_at desc
       limit 5000`,
      valores
    );

    if (exportar !== "xlsx") {
      return res.json({ notificaciones: rows });
    }

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Notificaciones");
    hoja.columns = [
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Cliente", key: "cliente", width: 30 },
      { header: "Correo", key: "correo", width: 28 },
      { header: "Canal", key: "canal", width: 12 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Estado", key: "estado", width: 12 },
    ];
    hoja.getRow(1).font = { bold: true };
    for (const n of rows) {
      hoja.addRow({
        fecha: new Date(n.created_at).toLocaleString("es-MX"),
        cliente: [n.nombre, n.apellido_paterno].filter(Boolean).join(" ") || "—",
        correo: n.correo || "—",
        canal: n.canal,
        tipo: n.tipo,
        estado: n.estado,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="notificaciones.xlsx"`);
    await libro.xlsx.write(res);
    res.end();
  })
);
