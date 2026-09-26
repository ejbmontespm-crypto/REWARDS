import { ApiError } from "../lib/errors.js";

// Nombre amigable por constraint, para no exponer nombres de columnas/tablas crudos.
const CONSTRAINT_MENSAJES = {
  idx_clientes_telefono_unico: "Ese teléfono ya está registrado con otra cuenta.",
  idx_clientes_correo_unico: "Ese correo ya está registrado con otra cuenta.",
  usuarios_staff_nombre_usuario_key: "Ese nombre de usuario ya existe.",
  usuarios_staff_correo_key: "Ese correo ya está en uso por otra cuenta de staff.",
};

/** Debe ser el último middleware montado (4 argumentos = Express lo reconoce como error handler). */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // Errores conocidos de Postgres — se traducen a algo que el cliente de la API entiende,
  // en vez de reventar como error interno genérico.
  if (err.code === "23505") {
    // unique_violation
    const mensaje = CONSTRAINT_MENSAJES[err.constraint] || "Ese valor ya existe y debe ser único.";
    return res.status(409).json({ error: { code: "valor_duplicado", message: mensaje } });
  }
  if (err.code === "23503") {
    // foreign_key_violation
    return res.status(400).json({ error: { code: "referencia_invalida", message: "Hace referencia a algo que no existe." } });
  }
  if (err.code === "22P02") {
    // invalid_text_representation (ej. un uuid mal formado, o un valor de enum que no existe)
    return res.status(400).json({ error: { code: "formato_invalido", message: "Alguno de los valores enviados tiene un formato inválido." } });
  }

  // Error no anticipado — no revelamos el detalle interno al cliente, pero sí lo logueamos.
  console.error(err);
  res.status(500).json({
    error: { code: "error_interno", message: "Algo salió mal de nuestro lado. Ya quedó registrado." },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "ruta_no_encontrada", message: `${req.method} ${req.path} no existe` } });
}
