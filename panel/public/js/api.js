import { API_BASE_URL } from "./config.js";
import { obtenerToken, cerrarSesion } from "./auth.js";

/** Error normalizado — siempre trae .code y .message, venga del backend o de la red. */
export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function peticion(metodo, ruta, { body, query } = {}) {
  let url = `${API_BASE_URL}${ruta}`;
  if (query) {
    const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ""));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  const token = obtenerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(url, { method: metodo, headers, body: body != null ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor — revisa que el backend esté corriendo.", "sin_conexion", 0);
  }

  if (respuesta.status === 204) return null;

  const contentType = respuesta.headers.get("content-type") || "";
  const esArchivo = !contentType.includes("application/json");

  if (!respuesta.ok) {
    let mensaje = `Error ${respuesta.status}`;
    let codigo = "error";
    if (!esArchivo) {
      try {
        const data = await respuesta.json();
        mensaje = data?.error?.message || mensaje;
        codigo = data?.error?.code || codigo;
      } catch {
        /* respuesta sin cuerpo JSON legible */
      }
    }
    if (respuesta.status === 401) {
      cerrarSesion();
      window.dispatchEvent(new CustomEvent("auth:no-autenticado"));
    }
    throw new ApiError(mensaje, codigo, respuesta.status);
  }

  if (esArchivo) return respuesta.blob();
  return respuesta.json();
}

/** Subida de archivos (multipart) — Supabase Storage vía POST /uploads, usado
 *  por Promociones (imagen/PDF) y Apariencia (logo, botón QR, tazas). Sin
 *  Content-Type manual: el navegador arma el boundary del multipart solo. */
async function subirArchivo(archivo) {
  const form = new FormData();
  form.append("archivo", archivo);
  const headers = {};
  const token = obtenerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE_URL}/uploads`, { method: "POST", headers, body: form });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor — revisa que el backend esté corriendo.", "sin_conexion", 0);
  }
  const data = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    if (respuesta.status === 401) {
      cerrarSesion();
      window.dispatchEvent(new CustomEvent("auth:no-autenticado"));
    }
    throw new ApiError(data?.error?.message || `Error ${respuesta.status}`, data?.error?.code || "error", respuesta.status);
  }
  return data; // { url }
}

export const api = {
  get: (ruta, opts) => peticion("GET", ruta, opts),
  post: (ruta, body, opts) => peticion("POST", ruta, { ...opts, body }),
  patch: (ruta, body, opts) => peticion("PATCH", ruta, { ...opts, body }),
  put: (ruta, body, opts) => peticion("PUT", ruta, { ...opts, body }),
  delete: (ruta, opts) => peticion("DELETE", ruta, opts),
  subirArchivo,
};
