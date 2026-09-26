import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { notFound, conflict } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";
import { generarPasswordTemporal } from "../lib/passwords.js";
import { enviarCorreo } from "../lib/mailer.js";

export const passwordResetSolicitudesRouter = Router();
passwordResetSolicitudesRouter.use(requireStaffAuth, requireRole("admin"));

// ---------------------------------------------------------------------
// GET /password-reset-solicitudes?estado=pendiente
// La creación de la solicitud vive en POST /auth/staff/forgot-password
// (es pública, antes de iniciar sesión) — aquí solo se listan/resuelven.
// ---------------------------------------------------------------------
passwordResetSolicitudesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const condicion = req.query.estado ? `where prs.estado = $1` : "";
    const { rows } = await query(
      `select prs.id, prs.via, prs.estado, prs.solicitado_en, prs.expira_en, prs.resuelto_en,
              u.id as usuario_id, u.nombre_usuario, u.nombre_completo
       from password_reset_solicitudes prs
       join usuarios_staff u on u.id = prs.usuario_id
       ${condicion}
       order by prs.solicitado_en desc`,
      req.query.estado ? [req.query.estado] : []
    );
    res.json({ solicitudes: rows });
  })
);

// ---------------------------------------------------------------------
// POST /password-reset-solicitudes/:id/aprobar
// Genera contraseña temporal, la manda por correo, deja la cuenta lista
// para el primer login con cambio obligatorio (fase2 §8).
// ---------------------------------------------------------------------
passwordResetSolicitudesRouter.post(
  "/:id/aprobar",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select prs.*, u.nombre_usuario, u.correo
       from password_reset_solicitudes prs join usuarios_staff u on u.id = prs.usuario_id
       where prs.id = $1`,
      [req.params.id]
    );
    const solicitud = rows[0];
    if (!solicitud) throw notFound("Solicitud no encontrada");
    if (solicitud.estado !== "pendiente") throw conflict(`Esa solicitud ya está "${solicitud.estado}"`);
    if (solicitud.via !== "validacion_admin") throw conflict("Esta solicitud no es del tipo que se aprueba manualmente");

    const passwordTemporal = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(passwordTemporal, 12);

    await query(`update usuarios_staff set password_hash = $2, debe_cambiar_password = true, updated_at = now() where id = $1`, [
      solicitud.usuario_id,
      passwordHash,
    ]);
    await query(`update password_reset_solicitudes set estado = 'aprobada', resuelto_por = $2, resuelto_en = now() where id = $1`, [
      req.params.id,
      req.staff.id,
    ]);

    await enviarCorreo({
      to: solicitud.correo,
      subject: "Tu contraseña temporal",
      text: `Se aprobó tu solicitud. Contraseña temporal: ${passwordTemporal} — se te pedirá cambiarla al entrar.`,
    });

    // Igual que al crear una cuenta: se devuelve aquí también mientras el
    // envío real de correo no esté conectado.
    res.json({ ok: true, password_temporal: passwordTemporal });
  })
);

// ---------------------------------------------------------------------
// POST /password-reset-solicitudes/:id/rechazar
// ---------------------------------------------------------------------
passwordResetSolicitudesRouter.post(
  "/:id/rechazar",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `update password_reset_solicitudes set estado = 'rechazada', resuelto_por = $2, resuelto_en = now()
       where id = $1 and estado = 'pendiente' returning *`,
      [req.params.id, req.staff.id]
    );
    if (!rows[0]) throw notFound("Solicitud no encontrada o ya no está pendiente");
    res.json({ solicitud: rows[0] });
  })
);
