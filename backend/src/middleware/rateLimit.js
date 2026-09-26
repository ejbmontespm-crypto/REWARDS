import rateLimit from "express-rate-limit";

/**
 * Límites tal como quedaron definidos en plan-maestro §11:
 *  - Login: máx. 5 intentos fallidos / 10 min por cuenta.
 *  - "Olvidé mi contraseña": máx. 3 solicitudes / hora por cuenta.
 *  - Registro de clientes: límite por IP en una ventana corta.
 *
 * "Por cuenta" se aproxima usando el identificador que el usuario mandó en
 * el body (nombre_usuario/correo/teléfono) como llave, en vez de la IP —
 * así alguien no se queda bloqueado por compartir wifi con otros, pero
 * tampoco puede meterle fuerza bruta a una cuenta puntual.
 */
function porCuenta(req) {
  const identificador = req.body?.nombre_usuario || req.body?.correo || req.body?.telefono;
  return identificador ? String(identificador).toLowerCase() : req.ip;
}

export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: porCuenta,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "demasiados_intentos", message: "Demasiados intentos. Espera unos minutos e intenta de nuevo." } },
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: porCuenta,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "demasiadas_solicitudes", message: "Ya se solicitó varias veces. Espera antes de volver a intentar." } },
});

export const registroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "demasiados_registros", message: "Demasiados registros desde aquí. Intenta más tarde." } },
});
