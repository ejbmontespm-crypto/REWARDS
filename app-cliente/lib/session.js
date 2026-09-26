import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const CLAVE_TOKEN_PROPIO = "cliente_token_propio";
const CLAVE_TOKEN_STAFF = "staff_token";

// SecureStore (Keychain/Keystore) no existe en web — ahí cae a AsyncStorage.
// En nativo (el destino real de esta app) sí usa SecureStore, más apropiado
// para un token de sesión largo.
const esWeb = Platform.OS === "web";

async function guardar(clave, valor) {
  if (esWeb) await AsyncStorage.setItem(clave, valor);
  else await SecureStore.setItemAsync(clave, valor);
}
async function leer(clave) {
  if (esWeb) return AsyncStorage.getItem(clave);
  return SecureStore.getItemAsync(clave);
}
async function borrar(clave) {
  if (esWeb) await AsyncStorage.removeItem(clave);
  else await SecureStore.deleteItemAsync(clave);
}

/**
 * Guarda el JWT propio del backend para un cliente (no es una sesión de
 * Supabase) — se usa justo después del registro (primer login implícito)
 * y del acceso asistido, los dos casos que no pasan por el login real por OTP.
 */
export async function guardarTokenPropio(token) {
  await guardar(CLAVE_TOKEN_PROPIO, token);
}

/** Guarda la sesión de staff/admin (POST /auth/staff/login) — nada que ver con Supabase. */
export async function guardarTokenStaff(token) {
  await guardar(CLAVE_TOKEN_STAFF, token);
}

/**
 * El payload de un JWT es solo base64 (no está cifrado) — se puede leer
 * del lado del cliente sin problema, solo no hay que CONFIAR en él para
 * nada que importe de verdad (eso lo revalida siempre el backend). Aquí
 * se usa nada más para saber el rol y mostrar o no el atajo de admin.
 */
function decodificarPayloadJwt(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

/**
 * La sesión activa del dispositivo — nunca hay dos a la vez. Prioriza
 * staff (si se inició sesión así, es el modo del dispositivo), luego
 * cliente: una sesión real de Supabase (login por OTP) o, si no, el JWT
 * propio (registro recién hecho o acceso asistido) — mismo orden que
 * valida requireClienteAuth en el backend.
 */
export async function obtenerSesionActual() {
  const tokenStaff = await leer(CLAVE_TOKEN_STAFF);
  if (tokenStaff) {
    const payload = decodificarPayloadJwt(tokenStaff);
    return { tipo: "staff", token: tokenStaff, rol: payload?.rol, nombreUsuario: payload?.nombre_usuario };
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return { tipo: "cliente", token: data.session.access_token };

  const tokenPropio = await leer(CLAVE_TOKEN_PROPIO);
  if (tokenPropio) return { tipo: "cliente", token: tokenPropio };

  return null;
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  await borrar(CLAVE_TOKEN_PROPIO);
  await borrar(CLAVE_TOKEN_STAFF);
}
