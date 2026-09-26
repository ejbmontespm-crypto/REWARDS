import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { unauthorized, forbidden } from "../lib/errors.js";
import { query } from "../config/db.js";
import { supabaseAdmin } from "../config/supabaseAdmin.js";

function tomarBearer(req) {
  const header = req.headers.authorization || "";
  const [tipo, token] = header.split(" ");
  return tipo === "Bearer" && token ? token : null;
}

/** Emite el JWT de sesión de un usuario de staff/admin ya autenticado. */
export function firmarTokenStaff(usuario) {
  return jwt.sign(
    { sub: usuario.id, rol: usuario.rol, nombre_usuario: usuario.nombre_usuario },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/** Exige un JWT de staff/admin válido; cuelga req.staff = { id, rol, nombre_usuario }. */
export function requireStaffAuth(req, res, next) {
  const token = tomarBearer(req);
  if (!token) return next(unauthorized("Falta el token de sesión"));

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.staff = { id: payload.sub, rol: payload.rol, nombre_usuario: payload.nombre_usuario };
    next();
  } catch {
    next(unauthorized("Sesión inválida o vencida"));
  }
}

/** Se usa después de requireStaffAuth para rutas exclusivas de admin. */
export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.staff) return next(unauthorized());
    if (!rolesPermitidos.includes(req.staff.rol)) return next(forbidden("Tu rol no tiene acceso a esto"));
    next();
  };
}

/**
 * Emite el JWT de sesión de un cliente para los dos casos que no pasan por
 * Supabase Auth: el primer login implícito al registrarse, y el acceso
 * asistido con código presencial (fase1-esquema-datos.md, "Autenticación
 * del cliente"). El login normal por OTP lo valida Supabase directamente;
 * nuestro backend nunca lo emite, solo lo verifica.
 */
export function firmarTokenCliente(clienteId) {
  return jwt.sign({ sub: clienteId, tipo: "cliente" }, env.clienteSecret, { expiresIn: "180d" });
}

/**
 * Exige una sesión válida de cliente; cuelga req.cliente = { id }.
 * Acepta dos tipos de token:
 *  1. El nuestro (firmarTokenCliente) — registro recién hecho o acceso asistido.
 *  2. El real de Supabase Auth (tras verificar el OTP) — se valida con la
 *     service role key (auth.getUser) y se resuelve a un cliente por
 *     auth_user_id; si es la primera vez que ese correo se autentica así,
 *     se enlaza aquí mismo.
 */
export async function requireClienteAuth(req, res, next) {
  const token = tomarBearer(req);
  if (!token) return next(unauthorized("Falta el token de sesión"));

  try {
    const payload = jwt.verify(token, env.clienteSecret);
    if (payload.tipo === "cliente") {
      req.cliente = { id: payload.sub };
      return next();
    }
  } catch {
    // no es nuestro JWT — probamos como token real de Supabase Auth
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return next(unauthorized("Sesión inválida o vencida"));

    const correo = data.user.email?.toLowerCase();
    let { rows } = await query(`select id from clientes where auth_user_id = $1`, [data.user.id]);

    if (!rows[0] && correo) {
      const enlazado = await query(
        `update clientes set auth_user_id = $1, updated_at = now()
         where correo = $2 and auth_user_id is null
         returning id`,
        [data.user.id, correo]
      );
      rows = enlazado.rows;
    }

    if (!rows[0]) return next(unauthorized("No encontramos un cliente registrado con este correo"));

    req.cliente = { id: rows[0].id };
    next();
  } catch {
    next(unauthorized("Sesión inválida o vencida"));
  }
}

/**
 * Para rutas que sirven a los dos (ej. cancelar un pedido: el cliente puede
 * cancelar el suyo, el staff puede cancelar cualquiera) — intenta primero
 * como staff (verificación síncrona, barata) y si no, cae a cliente. El
 * handler decide el resto según cuál de los dos quedó colgado en req.
 */
export function requireClienteOStaffAuth(req, res, next) {
  const token = tomarBearer(req);
  if (!token) return next(unauthorized("Falta el token de sesión"));

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.staff = { id: payload.sub, rol: payload.rol, nombre_usuario: payload.nombre_usuario };
    return next();
  } catch {
    // no es un token de staff — se intenta como cliente
  }

  return requireClienteAuth(req, res, next);
}
