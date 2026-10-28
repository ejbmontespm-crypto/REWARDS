import { router } from "expo-router";
import { API_BASE_URL } from "./config";
import { obtenerSesionActual, cerrarSesion } from "./session";

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Endpoints públicos de autenticación — no necesitan (ni deben llevar) el
// token de una sesión previa, y su propio 401 (credenciales/código
// incorrectos) es un resultado normal, no una sesión vencida.
const RUTAS_AUTH_PUBLICAS = new Set([
  "/auth/staff/login",
  "/auth/staff/forgot-password",
  "/auth/admin/backup-code/solicitar",
  "/auth/admin/backup-code/verificar",
  "/auth/cliente/codigo-asistido/verificar",
]);

async function peticion(metodo, ruta, { body, query } = {}) {
  let url = `${API_BASE_URL}${ruta}`;
  if (query) {
    const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ""));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const esRutaPublica = RUTAS_AUTH_PUBLICAS.has(ruta);
  const headers = { "Content-Type": "application/json" };
  const sesion = esRutaPublica ? null : await obtenerSesionActual();
  const teniaToken = Boolean(sesion?.token);
  if (teniaToken) headers.Authorization = `Bearer ${sesion.token}`;

  let respuesta;
  try {
    respuesta = await fetch(url, { method: metodo, headers, body: body != null ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor — revisa tu conexión.", "sin_conexion", 0);
  }

  if (respuesta.status === 204) return null;

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    /* respuesta sin cuerpo JSON legible */
  }

  if (!respuesta.ok) {
    const mensaje = datos?.error?.message || `Error ${respuesta.status}`;
    const codigo = datos?.error?.code || "error";
    // Solo forzamos logout+redirect si la petición SÍ llevaba un token y lo
    // rechazaron (sesión vencida a medio uso) — un 401 en el login mismo
    // (credenciales incorrectas, sin token todavía) es un error normal que
    // la pantalla de login ya maneja con su propio mensaje inline.
    if (respuesta.status === 401 && teniaToken && !esRutaPublica) {
      await cerrarSesion();
      router.replace("/(auth)");
    }
    throw new ApiError(mensaje, codigo, respuesta.status);
  }

  return datos;
}

export const api = {
  get: (ruta, opts) => peticion("GET", ruta, opts),
  post: (ruta, body, opts) => peticion("POST", ruta, { ...opts, body }),
  patch: (ruta, body, opts) => peticion("PATCH", ruta, { ...opts, body }),
  delete: (ruta, opts) => peticion("DELETE", ruta, opts),
};
