import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { firmarTokenStaff, firmarTokenCliente, requireStaffAuth } from "../middleware/auth.js";
import { loginLimiter, forgotPasswordLimiter } from "../middleware/rateLimit.js";
import { enviarCorreo } from "../lib/mailer.js";

export const authRouter = Router();

// ---------------------------------------------------------------------
// POST /auth/staff/login
// ---------------------------------------------------------------------
authRouter.post(
  "/staff/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { nombre_usuario, password } = req.body || {};
    if (!nombre_usuario || !password) {
      throw badRequest("Falta nombre_usuario o password");
    }

    const { rows } = await query(
      `select id, nombre_usuario, nombre_completo, rol, password_hash, activo, debe_cambiar_password
       from usuarios_staff where nombre_usuario = $1`,
      [nombre_usuario]
    );
    const usuario = rows[0];

    // Mismo mensaje genérico si no existe o si la contraseña no coincide —
    // no revelamos cuál de las dos cosas falló.
    const credencialesInvalidas = () => unauthorized("Usuario o contraseña incorrectos", "credenciales_invalidas");

    if (!usuario || !usuario.activo) throw credencialesInvalidas();

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) throw credencialesInvalidas();

    const token = firmarTokenStaff(usuario);
    res.json({
      token,
      debe_cambiar_password: usuario.debe_cambiar_password,
      usuario: { id: usuario.id, nombre_completo: usuario.nombre_completo, rol: usuario.rol },
    });
  })
);

// ---------------------------------------------------------------------
// POST /auth/staff/cambiar-password  (autenticado — incluye el primer
// cambio obligatorio cuando debe_cambiar_password = true)
// ---------------------------------------------------------------------
authRouter.post(
  "/staff/cambiar-password",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const { password_actual, password_nueva } = req.body || {};
    if (!password_actual || !password_nueva) throw badRequest("Falta password_actual o password_nueva");
    if (password_nueva.length < 8) throw badRequest("La contraseña nueva debe tener al menos 8 caracteres");

    const { rows } = await query(`select password_hash from usuarios_staff where id = $1`, [req.staff.id]);
    const usuario = rows[0];
    if (!usuario) throw unauthorized();

    const coincide = await bcrypt.compare(password_actual, usuario.password_hash);
    if (!coincide) throw badRequest("La contraseña actual no coincide", "password_actual_incorrecta");

    const nuevoHash = await bcrypt.hash(password_nueva, 12);
    await query(
      `update usuarios_staff set password_hash = $1, debe_cambiar_password = false, updated_at = now() where id = $2`,
      [nuevoHash, req.staff.id]
    );
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------
// POST /auth/staff/forgot-password  (crea la solicitud; el admin la
// aprueba desde el panel — cuentas.routes.js)
// ---------------------------------------------------------------------
authRouter.post(
  "/staff/forgot-password",
  forgotPasswordLimiter,
  asyncHandler(async (req, res) => {
    const { nombre_usuario } = req.body || {};
    if (!nombre_usuario) throw badRequest("Falta nombre_usuario");

    const { rows } = await query(`select id from usuarios_staff where nombre_usuario = $1 and activo`, [nombre_usuario]);
    const usuario = rows[0];

    // Si existe, se crea la solicitud pendiente. Si no, respondemos igual
    // de "listo" — no delatamos qué nombres de usuario existen.
    if (usuario) {
      await query(
        `insert into password_reset_solicitudes (usuario_id, via, estado, expira_en)
         values ($1, 'validacion_admin', 'pendiente', now() + interval '3 days')`,
        [usuario.id]
      );
    }
    res.json({ ok: true, mensaje: "Si el usuario existe, quedó una solicitud pendiente de aprobación del admin." });
  })
);

// ---------------------------------------------------------------------
// Recuperación de admin por correo de respaldo (plan-maestro §4)
// ---------------------------------------------------------------------
authRouter.post(
  "/admin/backup-code/solicitar",
  forgotPasswordLimiter,
  asyncHandler(async (req, res) => {
    const { nombre_usuario } = req.body || {};
    if (!nombre_usuario) throw badRequest("Falta nombre_usuario");

    const { rows } = await query(
      `select id, correo_respaldo from usuarios_staff where nombre_usuario = $1 and rol = 'admin' and activo`,
      [nombre_usuario]
    );
    const admin = rows[0];

    if (admin?.correo_respaldo) {
      const codigo = crypto.randomInt(100000, 999999).toString(); // 6 dígitos
      const codigoHash = await bcrypt.hash(codigo, 10);
      await query(
        `insert into password_reset_solicitudes (usuario_id, via, estado, codigo_hash, expira_en)
         values ($1, 'correo_respaldo_admin', 'pendiente', $2, now() + interval '15 minutes')`,
        [admin.id, codigoHash]
      );
      await enviarCorreo({
        to: admin.correo_respaldo,
        subject: "Código para recuperar tu acceso de admin",
        text: `Tu código es: ${codigo} — vence en 15 minutos. Si no lo solicitaste, ignora este correo.`,
      });
    }
    // Mismo mensaje exista o no el usuario/correo de respaldo — evita filtrar cuentas.
    res.json({ ok: true, mensaje: "Si la cuenta existe y tiene correo de respaldo, se envió un código." });
  })
);

authRouter.post(
  "/admin/backup-code/verificar",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { nombre_usuario, codigo, password_nueva } = req.body || {};
    if (!nombre_usuario || !codigo || !password_nueva) {
      throw badRequest("Falta nombre_usuario, codigo o password_nueva");
    }
    if (password_nueva.length < 8) throw badRequest("La contraseña nueva debe tener al menos 8 caracteres");

    const { rows } = await query(
      `select prs.id as solicitud_id, prs.codigo_hash, u.id as usuario_id
       from password_reset_solicitudes prs
       join usuarios_staff u on u.id = prs.usuario_id
       where u.nombre_usuario = $1
         and prs.via = 'correo_respaldo_admin'
         and prs.estado = 'pendiente'
         and prs.expira_en > now()
       order by prs.solicitado_en desc
       limit 1`,
      [nombre_usuario]
    );
    const solicitud = rows[0];
    if (!solicitud) throw badRequest("No hay un código pendiente para este usuario, o ya venció", "codigo_invalido");

    const coincide = await bcrypt.compare(codigo, solicitud.codigo_hash);
    if (!coincide) throw badRequest("Código incorrecto", "codigo_invalido");

    const nuevoHash = await bcrypt.hash(password_nueva, 12);
    await query(`update usuarios_staff set password_hash = $1, updated_at = now() where id = $2`, [nuevoHash, solicitud.usuario_id]);
    await query(`update password_reset_solicitudes set estado = 'usada', resuelto_en = now() where id = $1`, [solicitud.solicitud_id]);

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------
// POST /auth/cliente/codigo-asistido/verificar  — acceso asistido (código
// presencial, fase3-app-cliente.md §3). La generación del código vive en
// POST /clientes/:id/acceso-asistido (staff, ya con el cliente_id a la
// mano desde su ficha en el panel); aquí solo se verifica lo que el
// cliente captura en la app, en la misma pantalla de 6 casillas del OTP.
// ---------------------------------------------------------------------
authRouter.post(
  "/cliente/codigo-asistido/verificar",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { correo, codigo } = req.body || {};
    if (!correo?.trim() || !codigo?.trim()) throw badRequest("Falta correo o código");

    const codigoInvalido = () => unauthorized("Código inválido o vencido", "codigo_invalido");

    const { rows: clientes } = await query(`select id from clientes where correo = $1`, [correo.trim().toLowerCase()]);
    const cliente = clientes[0];
    if (!cliente) throw codigoInvalido();

    const { rows: codigos } = await query(
      `select id, codigo_hash from codigos_acceso_asistido
       where cliente_id = $1 and usado_en is null and expira_en > now()
       order by created_at desc limit 1`,
      [cliente.id]
    );
    const registro = codigos[0];
    if (!registro || !(await bcrypt.compare(codigo.trim(), registro.codigo_hash))) throw codigoInvalido();

    await query(`update codigos_acceso_asistido set usado_en = now() where id = $1`, [registro.id]);
    res.json({ token: firmarTokenCliente(cliente.id) });
  })
);
