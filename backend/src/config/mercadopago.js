import { MercadoPagoConfig } from "mercadopago";
import { env } from "./env.js";

let cliente = null;

/** Cliente perezoso — no truena al arrancar el server si falta el token
 *  (Mercado Pago es opcional/pendiente de credenciales), solo cuando de
 *  verdad se intenta usar un endpoint de /pagos. */
export function obtenerClienteMercadoPago() {
  if (!env.mercadopagoAccessToken) return null;
  if (!cliente) cliente = new MercadoPagoConfig({ accessToken: env.mercadopagoAccessToken });
  return cliente;
}
