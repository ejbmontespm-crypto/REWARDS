// Cambiar cuando el backend tenga un dominio real (Hostinger/producción).
export const API_BASE_URL = "http://localhost:3000/api";

// Base para assets estáticos (logo) que sirve el backend fuera de /api.
export const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");
