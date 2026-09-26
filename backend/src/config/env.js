import "dotenv/config";

/**
 * Carga y valida las variables de entorno una sola vez, al arrancar.
 * Si falta algo obligatorio, truena de inmediato con un mensaje claro
 * en vez de fallar después, a medias, cuando algo intente usarlas.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (revisa tu .env, compáralo con .env.example)`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  qrSecret: required("QR_SECRET"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  clienteSecret: required("CLIENTE_SECRET"),
  // Opcionales — Mercado Pago (punto 9, fase A ronda 4). Sin el token, los
  // endpoints de /pagos regresan un error claro en vez de tronar al arrancar.
  mercadopagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || null,
  mercadopagoPointDeviceId: process.env.MERCADOPAGO_POINT_DEVICE_ID || null,
  // URL pública del backend + "/api/pagos/mercadopago/webhook" — Mercado
  // Pago necesita poder llamarla desde fuera, así que en local (mientras no
  // haya deploy) esto se deja vacío y se confirma el pago a mano para
  // probar, o se usa un túnel (ngrok) apuntando aquí.
  mercadopagoNotificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL || null,
  mercadopagoBackUrl: process.env.MERCADOPAGO_BACK_URL || null,
};
