import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";
import { generarPasswordTemporal } from "../lib/passwords.js";
import { enviarCorreo } from "../lib/mailer.js";

export const usuariosStaffRouter = Router();
usuariosStaffRouter.use(requireStaffAuth, requireRole("admin"));

const ROLES = ["admin", "staff"];
const CAMPOS_PUBLICOS = "id, nombre_usuario, nombre_completo, correo, correo_respaldo, rol, activo, debe_cambiar_password, created_at";

// ---------------------------------------------------------------------
// GET /usuarios-staff
// ---------------------------------------------------------------------
usuariosStaffRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select ${CAMPOS_PUBLICOS} from usuarios_staff order by nombre_completo`);
    res.json({ usuarios: rows });
  })
);

// ---------------------------------------------------------------------
// POST /usuarios-staff  — alta de cuenta, con contraseña temporal
// ---------------------------------------------------------------------
usuariosStaffRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nombre_usuario, nombre_completo, correo, correo_respaldo, rol } = req.body || {};
    if (!nombre_usuario?.trim() || !nombre_completo?.trim() || !correo?.trim()) {
      throw badRequest("Faltan nombre_usuario, nombre_completo o correo");
    }
    if (!ROLES.includes(rol)) throw badRequest(`rol debe ser uno de: ${ROLES.join(", ")}`);
    if (rol === "admin" && !correo_respaldo?.trim()) {
      throw badRequest("Una cuenta admin necesita correo_respaldo (para la recuperación de emergencia, plan §4)");
    }

    const passwordTemporal = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(passwordTemporal, 12);

    const { rows } = await query(
      `insert into usuarios_staff (nombre_usuario, nombre_completo, correo, correo_respaldo, password_hash, rol, activo, debe_cambiar_password)
       values ($1, $2, $3, $4, $5, $6, true, true)
       returning ${CAMPOS_PUBLICOS}`,
      [nombre_usuario.trim(), nombre_completo.trim(), correo.trim(), correo_respaldo?.trim() || null, passwordHash, rol]
    );

    await enviarCorreo({
      to: correo.trim(),
      subject: "Tu cuenta en Lealtad Café",
      text: `Se creó tu cuenta (usuario: ${nombre_usuario}). Contraseña temporal: ${passwordTemporal} — se te pedirá cambiarla al entrar.`,
    });

    // La contraseña temporal se devuelve aquí TAMBIÉN (no solo por correo)
    // mientras el envío real de correo (Resend) no esté conectado — de
    // lo contrario no habría forma de usarla. Quitar esto cuando el
    // bloque de correo del roadmap esté funcionando de verdad.
    res.status(201).json({ usuario: rows[0], password_temporal: passwordTemporal });
  })
);

// ---------------------------------------------------------------------
// PATCH /usuarios-staff/:id  — editar / activar / desactivar
// (la contraseña propia se cambia por /auth/staff/cambiar-password o
// por un reset aprobado, nunca por aquí)
// ---------------------------------------------------------------------
const CAMPOS_EDITABLES = ["nombre_completo", "correo", "correo_respaldo", "rol", "activo"];

usuariosStaffRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const cambios = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
    if (Object.keys(cambios).length === 0) throw badRequest("No mandaste ningún campo editable");
    if (cambios.rol && !ROLES.includes(cambios.rol)) throw badRequest(`rol debe ser uno de: ${ROLES.join(", ")}`);

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const { rows } = await query(
      `update usuarios_staff set ${asignaciones}, updated_at = now() where id = $1 returning ${CAMPOS_PUBLICOS}`,
      [req.params.id, ...columnas.map((c) => cambios[c])]
    );
    if (!rows[0]) throw notFound("Usuario no encontrado");
    res.json({ usuario: rows[0] });
  })
);
