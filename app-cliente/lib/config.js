// Para probar en un celular real con Expo Go, "localhost" no sirve — el
// teléfono es otro dispositivo en la red. Cambia esto a la IP local de tu
// compu (ej. 192.168.1.X, la ves con `ipconfig` en Windows) mientras
// pruebas; en producción esto va a la URL real del backend desplegado.
export const API_BASE_URL = "http://192.168.0.103:3000/api";

// Base para assets estáticos (logo) que sirve el backend fuera de /api.
export const ASSET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

// Panel web — el atajo de admin en "Más" lo abre en el navegador del
// celular en vez de duplicar esa pantalla dentro de la app (fase7 §4).
export const PANEL_URL = "http://192.168.0.103:4100";
