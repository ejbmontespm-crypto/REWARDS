import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Bandeja de notificaciones del STAFF — a diferencia de la del cliente
 * (notificaciones_log en el backend), esta vive solo en el dispositivo:
 * son avisos operativos en tiempo real (pedido nuevo) mientras la app está
 * abierta, no un historial que el negocio necesite auditar desde el panel.
 */
const CLAVE = "staff_notificaciones_log";
const MAXIMO = 50;
let cache = null;
let listeners = [];

async function cargar() {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(CLAVE);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function avisar() {
  listeners.forEach((fn) => fn(cache));
}

export async function agregarNotificacionStaff(texto) {
  const lista = await cargar();
  const nueva = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, texto, fecha: new Date().toISOString(), leida: false };
  cache = [nueva, ...lista].slice(0, MAXIMO);
  await AsyncStorage.setItem(CLAVE, JSON.stringify(cache));
  avisar();
}

export async function obtenerNotificacionesStaff() {
  return cargar();
}

export async function marcarLeidasStaff() {
  const lista = await cargar();
  cache = lista.map((n) => ({ ...n, leida: true }));
  await AsyncStorage.setItem(CLAVE, JSON.stringify(cache));
  avisar();
}

/** Devuelve una función para dejar de escuchar (patrón estándar de suscripción). */
export function suscribirseNotificacionesStaff(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
