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

async function peticion(metodo, ruta, { body, query } = {}) {
  let url = `${API_BASE_URL}${ruta}`;
  if (query) {
    const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ""));
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  const sesion = await obtenerSesionActual();
  if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;

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
    if (respuesta.status === 401) {
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
