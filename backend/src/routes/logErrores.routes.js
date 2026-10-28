import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";

export const logErroresRouter = Router();

// ---------------------------------------------------------------------
// GET /log-errores  (admin) — bitácora temporal de errores inesperados
// (500), mientras dura el desarrollo. Sin esto, la única forma de ver el
// detalle real detrás de "Algo salió mal de nuestro lado" eran los logs
// de Railway, a los que no todos tienen acceso.
// ---------------------------------------------------------------------
logErroresRouter.get(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select le.*, u.nombre_completo as staff_nombre, c.nombre as cliente_nombre
       from log_errores le
       left join usuarios_staff u on u.id = le.staff_id
       left join clientes c on c.id = le.cliente_id
       order by le.created_at desc
       limit 200`
    );
    res.json({ errores: rows });
  })
);

// ---------------------------------------------------------------------
// DELETE /log-errores  (admin) — limpiar la bitácora.
// ---------------------------------------------------------------------
logErroresRouter.delete(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    await query(`delete from log_errores`);
    res.status(204).end();
  })
);
