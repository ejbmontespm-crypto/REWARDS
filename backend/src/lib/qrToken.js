import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const QR_TTL_SEGUNDOS = 45;

/**
 * Token dinámico del QR (fase3-app-cliente.md §5): se regenera cada
 * 30-60s mientras la pantalla está abierta. `v` es qr_secret_version —
 * si algún día hay que invalidar tokens viejos (QR comprometido), basta
 * con subir ese número en el cliente.
 */
export function generarTokenQr(cliente) {
  return jwt.sign({ cliente_id: cliente.id, v: cliente.qr_secret_version }, env.qrSecret, {
    expiresIn: QR_TTL_SEGUNDOS,
  });
}

/** Lanza si el token es inválido o ya expiró — quien llama decide el mensaje al staff. */
export function verificarTokenQr(token) {
  return jwt.verify(token, env.qrSecret);
}

export { QR_TTL_SEGUNDOS };
