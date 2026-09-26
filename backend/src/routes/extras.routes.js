import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";

export const extrasRouter = Router();

extrasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select id, nombre, costo, disponible from extras order by nombre`);
    res.json({ extras: rows });
  })
);

extrasRouter.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { nombre, costo } = req.body || {};
    if (!nombre?.trim()) throw badRequest("Falta nombre");
    const { rows } = await query(
      `insert into extras (nombre, costo) values ($1, coalesce($2, 0)) returning *`,
      [nombre.trim(), costo]
    );
    res.status(201).json({ extra: rows[0] });
  })
);

const CAMPOS_EDITABLES = ["nombre", "costo", "disponible"];

extrasRouter.patch(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const cambios = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
    if (Object.keys(cambios).length === 0) throw badRequest("No mandaste ningún campo editable");

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const { rows } = await query(`update extras set ${asignaciones} where id = $1 returning *`, [
      req.params.id,
      ...columnas.map((c) => cambios[c]),
    ]);
    if (!rows[0]) throw notFound("Extra no encontrado");
    res.json({ extra: rows[0] });
  })
);

extrasRouter.patch(
  "/:id/disponibilidad",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { disponible } = req.body || {};
    if (typeof disponible !== "boolean") throw badRequest("disponible debe ser true o false");
    const { rows } = await query(`update extras set disponible = $2 where id = $1 returning id, nombre, disponible`, [
      req.params.id,
      disponible,
    ]);
    if (!rows[0]) throw notFound("Extra no encontrado");
    res.json({ extra: rows[0] });
  })
);

extrasRouter.delete(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`delete from extras where id = $1`, [req.params.id]);
    if (!rowCount) throw notFound("Extra no encontrado");
    res.status(204).end();
  })
);
