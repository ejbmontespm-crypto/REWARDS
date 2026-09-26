import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";

// No está en el mapa original de fase6-backend-api.md como grupo aparte,
// pero el panel (fase2 §4) sí necesita CRUD de categorías — se agrega
// aquí, junto a productos/extras, que es donde vive conceptualmente.
export const categoriasProductoRouter = Router();

categoriasProductoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select id, nombre, orden from categorias_producto order by orden, nombre`);
    res.json({ categorias: rows });
  })
);

categoriasProductoRouter.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { nombre, orden } = req.body || {};
    if (!nombre?.trim()) throw badRequest("Falta nombre");
    const { rows } = await query(
      `insert into categorias_producto (nombre, orden) values ($1, coalesce($2, 0)) returning id, nombre, orden`,
      [nombre.trim(), orden]
    );
    res.status(201).json({ categoria: rows[0] });
  })
);

categoriasProductoRouter.patch(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { nombre, orden } = req.body || {};
    const { rows } = await query(
      `update categorias_producto set nombre = coalesce($2, nombre), orden = coalesce($3, orden) where id = $1
       returning id, nombre, orden`,
      [req.params.id, nombre?.trim(), orden]
    );
    if (!rows[0]) throw notFound("Categoría no encontrada");
    res.json({ categoria: rows[0] });
  })
);

categoriasProductoRouter.delete(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`delete from categorias_producto where id = $1`, [req.params.id]);
    if (!rowCount) throw notFound("Categoría no encontrada");
    res.status(204).end();
  })
);
