import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * Notificaciones LOCALES (no push real) — el aviso lo dispara el propio
 * celular mientras la app está abierta, comparando el estado actual contra
 * el que vio la última vez (ver useVigilarPedidoCliente / useVigilarPedidosNuevos).
 * No requiere token de push ni build nativa (expo-notifications con push
 * REMOTO ya no funciona en Expo Go desde el SDK 53 — local sí, y es
 * suficiente para "avísame si cambia el estado mientras tengo la app abierta").
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let permisoPedido = false;

export async function asegurarPermisoNotificaciones() {
  if (permisoPedido || Platform.OS === "web") return;
  permisoPedido = true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") await Notifications.requestPermissionsAsync();
  } catch {
    /* si falla o la rechazan, simplemente no habrá notificaciones locales */
  }
}

export async function notificarLocal(titulo, cuerpo) {
  if (Platform.OS === "web") return; // expo-notifications no soporta notificaciones locales en web
  try {
    await Notifications.scheduleNotificationAsync({ content: { title: titulo, body: cuerpo, sound: true }, trigger: null });
  } catch {
    /* no bloquea el flujo de la app si falla */
  }
}
