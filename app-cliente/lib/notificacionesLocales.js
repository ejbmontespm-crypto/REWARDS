import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";

/**
 * Notificaciones LOCALES (no push real) — el aviso lo dispara el propio
 * celular mientras la app está abierta, comparando el estado actual contra
 * el que vio la última vez (ver useVigilarPedidoCliente / useVigilarPedidosNuevos).
 *
 * En ANDROID dentro de Expo Go, versiones de expo-notifications de SDK 53+
 * pueden truenar (throw) al tocar ciertas partes del módulo relacionadas con
 * push. Se detecta ese caso y se desactiva el módulo ahí como respaldo —
 * en la práctica, en las pruebas reales (Expo Go, Android) SÍ funcionan las
 * notificaciones locales, así que este bloqueo casi nunca se activa; solo
 * es para no tronar la app si algún día sí aplica.
 */
const NOTIFICACIONES_DESACTIVADAS = Platform.OS === "web" || (Platform.OS === "android" && isRunningInExpoGo());

let Notifications = null;
function cargarNotifications() {
  if (!Notifications) Notifications = require("expo-notifications");
  return Notifications;
}

let canalListo = false;
// "pedidos-v3", no "pedidos"/"pedidos-v2" — Android BLOQUEA cambiar
// sonido/vibración/importancia de un canal ya existente (solo el usuario
// puede desde Ajustes del sistema una vez creado). Los ids anteriores ya
// habían quedado creados con importance=5 (bug: era DEFAULT, no MAX — ver
// abajo), así que quedaron "congelados" en ese valor para siempre; un id
// nuevo fuerza que se cree de cero, ya con el valor correcto.
const CANAL_ANDROID = "pedidos-v3";

/**
 * Android exige un "canal de notificación" con su propio sonido/vibración
 * configurados — mandar `sound: true` en cada notificación NO basta por sí
 * solo, si el canal no tiene sonido/vibración habilitados la notificación
 * se ve pero se queda muda y sin vibrar (justo lo que se reportó: "sí
 * aparecen, pero no suena ni vibra"). iOS no usa canales, así que ahí no aplica.
 */
async function asegurarCanalAndroid() {
  if (canalListo || Platform.OS !== "android" || NOTIFICACIONES_DESACTIVADAS) return;
  canalListo = true;
  try {
    const N = cargarNotifications();
    // Se borran los canales viejos (si existían) para que no queden
    // "huérfanos" en Ajustes del sistema confundiendo — ignora el error si
    // nunca existieron.
    await N.deleteNotificationChannelAsync("pedidos").catch(() => {});
    await N.deleteNotificationChannelAsync("pedidos-v2").catch(() => {});
    await N.setNotificationChannelAsync(CANAL_ANDROID, {
      name: "Pedidos",
      importance: N.AndroidImportance.MAX, // = 7 — antes decía "5" pensando que era MAX, pero 5 es DEFAULT
      sound: "default",
      vibrationPattern: [0, 300, 150, 300],
      enableVibrate: true,
      lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    /* si falla, la notificación igual se manda, solo sin garantía de sonido */
  }
}

if (!NOTIFICACIONES_DESACTIVADAS) {
  cargarNotifications().setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  asegurarCanalAndroid();
}

let permisoPedido = false;

export async function asegurarPermisoNotificaciones() {
  if (permisoPedido || NOTIFICACIONES_DESACTIVADAS) return;
  permisoPedido = true;
  try {
    const N = cargarNotifications();
    const { status } = await N.getPermissionsAsync();
    if (status !== "granted") await N.requestPermissionsAsync();
    await asegurarCanalAndroid();
  } catch {
    /* si falla o la rechazan, simplemente no habrá notificaciones locales */
  }
}

export async function notificarLocal(titulo, cuerpo) {
  if (NOTIFICACIONES_DESACTIVADAS) return;
  try {
    await asegurarCanalAndroid();
    await cargarNotifications().scheduleNotificationAsync({
      content: {
        title: titulo,
        body: cuerpo,
        sound: "default",
        ...(Platform.OS === "android" ? { channelId: CANAL_ANDROID } : null),
      },
      trigger: null,
    });
  } catch {
    /* no bloquea el flujo de la app si falla */
  }
}
