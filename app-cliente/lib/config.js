export const API_BASE_URL = "https://rewards-production-5ce8.up.railway.app/api";

// Base para assets estáticos (logo) que sirve el backend fuera de /api.
export const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

// Panel web — el atajo de admin en "Más" lo abre en el navegador del
// celular en vez de duplicar esa pantalla dentro de la app (fase7 §4).
// TODO: reemplazar con el dominio real de Railway en cuanto exista el
// segundo servicio (panel).
export const PANEL_URL = "http://192.168.100.120:4100";
