/**
 * Recuperación de emergencia (fase8-reportes-pulido.md §2) — para cuando
 * ni el login normal ni el correo de respaldo funcionan (ej. el correo de
 * respaldo también se perdió, o Resend está caído). Deliberadamente
 * low-tech: un comando que corres tú mismo desde la terminal del
 * servidor/repositorio cuando de verdad no hay otra opción — no es una
 * ruta HTTP ni un botón en ninguna interfaz, así que no abre una puerta
 * nueva que proteger en la app.
 *
 *   node scripts/reset-admin-emergencia.js --usuario ejbmontes@hotmail.com
 *
 * Genera una contraseña temporal nueva, la muestra en pantalla (nunca por
 * correo — ese es justo el canal que puede estar fallando) y marca
 * debe_cambiar_password = true, igual que un alta o un reset normal.
 */
import { pool } from "../src/config/db.js";
import { generarPasswordTemporal } from "../src/lib/passwords.js";
import bcrypt from "bcryptjs";

function leerArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const clave = argv[i]?.replace(/^--/, "");
    args[clave] = argv[i + 1];
  }
  return args;
}

async function main() {
  const { usuario } = leerArgs();
  if (!usuario) {
    console.error("Falta --usuario");
    console.error("Uso: node scripts/reset-admin-emergencia.js --usuario ejbmontes@hotmail.com");
    process.exit(1);
  }

  const { rows: existentes } = await pool.query(
    `select id, nombre_completo, rol, activo from usuarios_staff where nombre_usuario = $1`,
    [usuario]
  );
  const cuenta = existentes[0];
  if (!cuenta) {
    console.error(`No existe ninguna cuenta con nombre_usuario = "${usuario}".`);
    process.exit(1);
  }
  if (!cuenta.activo) {
    console.error(`La cuenta "${usuario}" (${cuenta.nombre_completo}) está desactivada — actívala primero desde otra cuenta admin, o directo en la base si esta era la única.`);
    process.exit(1);
  }

  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(passwordTemporal, 12);

  await pool.query(
    `update usuarios_staff set password_hash = $2, debe_cambiar_password = true, updated_at = now() where id = $1`,
    [cuenta.id, passwordHash]
  );

  console.log(`✅ Contraseña reseteada para "${usuario}" (${cuenta.nombre_completo}, rol: ${cuenta.rol}).`);
  console.log(`   Contraseña temporal: ${passwordTemporal}`);
  console.log("   Se pedirá cambiarla en el siguiente login. No se envió por ningún lado — solo quedó impresa aquí.");

  await pool.end();
}

main().catch((err) => {
  console.error("Error reseteando la cuenta:", err.message);
  process.exit(1);
});
