import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";

export const productosRouter = Router();

// ---------------------------------------------------------------------
// GET /productos  — catálogo (público)
// ---------------------------------------------------------------------
productosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const soloDisponibles = req.query.disponible === "true";
    const condiciones = soloDisponibles ? "where p.disponible = true" : "";
    const { rows } = await query(
      `select p.id, p.nombre, p.descripcion, p.precio, p.disponible, p.imagen_path,
              c.id as categoria_id, c.nombre as categoria_nombre
       from productos p
       left join categorias_producto c on c.id = p.categoria_id
       ${condiciones}
       order by c.orden nulls last, p.nombre`
    );
    res.json({ productos: rows });
  })
);

productosRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select p.*, c.nombre as categoria_nombre from productos p
       left join categorias_producto c on c.id = p.categoria_id
       where p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) throw notFound("Producto no encontrado");

    const extras = await query(
      `select e.id, e.nombre, e.costo, e.disponible
       from producto_extras pe join extras e on e.id = pe.extra_id
       where pe.producto_id = $1 order by e.nombre`,
      [req.params.id]
    );
    res.json({ producto: rows[0], extras: extras.rows });
  })
);

// ---------------------------------------------------------------------
// POST /productos  (admin)
// ---------------------------------------------------------------------
productosRouter.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { nombre, descripcion, precio, categoria_id, imagen_path } = req.body || {};
    if (!nombre?.trim()) throw badRequest("Falta nombre");
    if (precio == null || Number(precio) < 0) throw badRequest("precio inválido");

    const { rows } = await query(
      `insert into productos (nombre, descripcion, precio, categoria_id, imagen_path)
       values ($1, $2, $3, $4, $5) returning *`,
      [nombre.trim(), descripcion || null, precio, categoria_id || null, imagen_path || null]
    );
    res.status(201).json({ producto: rows[0] });
  })
);

// ---------------------------------------------------------------------
// PATCH /productos/:id  (admin — edición completa)
// ---------------------------------------------------------------------
const CAMPOS_EDITABLES = ["nombre", "descripcion", "precio", "categoria_id", "imagen_path", "disponible"];

productosRouter.patch(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const cambios = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
    if (Object.keys(cambios).length === 0) throw badRequest("No mandaste ningún campo editable");

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const { rows } = await query(
      `update productos set ${asignaciones}, updated_at = now() where id = $1 returning *`,
      [req.params.id, ...columnas.map((c) => cambios[c])]
    );
    if (!rows[0]) throw notFound("Producto no encontrado");
    res.json({ producto: rows[0] });
  })
);

// ---------------------------------------------------------------------
// PATCH /productos/:id/disponibilidad  (staff O admin — toggle rápido "agotado")
// ---------------------------------------------------------------------
productosRouter.patch(
  "/:id/disponibilidad",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { disponible } = req.body || {};
    if (typeof disponible !== "boolean") throw badRequest("disponible debe ser true o false");

    const { rows } = await query(
      `update productos set disponible = $2, updated_at = now() where id = $1 returning id, nombre, disponible`,
      [req.params.id, disponible]
    );
    if (!rows[0]) throw notFound("Producto no encontrado");
    res.json({ producto: rows[0] });
  })
);

// ---------------------------------------------------------------------
// PUT /productos/:id/extras  — reemplaza el conjunto completo de extras aplicables (admin)
// ---------------------------------------------------------------------
productosRouter.put(
  "/:id/extras",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { extra_ids } = req.body || {};
    if (!Array.isArray(extra_ids)) throw badRequest("extra_ids debe ser un arreglo de IDs");

    const existe = await query(`select 1 from productos where id = $1`, [req.params.id]);
    if (!existe.rows[0]) throw notFound("Producto no encontrado");

    await query(`delete from producto_extras where producto_id = $1`, [req.params.id]);
    for (const extraId of extra_ids) {
      await query(`insert into producto_extras (producto_id, extra_id) values ($1, $2)`, [req.params.id, extraId]);
    }
    res.json({ producto_id: req.params.id, extra_ids });
  })
);

// ---------------------------------------------------------------------
// DELETE /productos/:id  (admin)
// ---------------------------------------------------------------------
productosRouter.delete(
  "/:id",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`delete from productos where id = $1`, [req.params.id]);
    if (!rowCount) throw notFound("Producto no encontrado");
    res.status(204).end();
  })
);
