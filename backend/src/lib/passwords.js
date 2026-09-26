import crypto from "node:crypto";

/** Contraseña temporal legible-ish, para cuentas nuevas o resets aprobados. */
export function generarPasswordTemporal() {
  return crypto.randomBytes(9).toString("base64url"); // ~12 caracteres, sin símbolos raros
}
