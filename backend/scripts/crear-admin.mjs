/**
 * Crea la primera cuenta admin — no hay forma de hacerlo desde la API
 * (crear cuentas de staff requiere ya estar autenticado como admin, y
 * la primera vez no hay nadie). Se corre una sola vez, a mano:
 *
 *   node scripts/crear-admin.mjs --usuario ltorres --nombre "Laura Torres" \
 *     --correo laura@correo.com --correo-respaldo respaldo@correo.com --password "unaContraseñaTemporal123"
 *
 * La contraseña que le pases queda marcada como temporal
 * (debe_cambiar_password = true) — se la cambia en su primer login.
 */
import bcrypt from "bcryptjs";
import { pool } from "../src/config/db.js";

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
  const { usuario, nombre, correo, "correo-respaldo": correoRespaldo, password } = leerArgs();

  const faltantes = ["usuario", "nombre", "correo", "password"].filter(
    (k) => !{ usuario, nombre, correo, password }[k]
  );
  if (faltantes.length) {
    console.error(`Faltan argumentos: ${faltantes.join(", ")}`);
    console.error('Uso: node scripts/crear-admin.mjs --usuario ltorres --nombre "Laura Torres" --correo laura@x.com --correo-respaldo backup@x.com --password "temporal123"');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { rows } = await pool.query(
    `insert into usuarios_staff (nombre_usuario, nombre_completo, correo, correo_respaldo, password_hash, rol, activo, debe_cambiar_password)
     values ($1, $2, $3, $4, $5, 'admin', true, true)
     on conflict (nombre_usuario) do nothing
     returning id, nombre_usuario, nombre_completo, rol`,
    [usuario, nombre, correo, correoRespaldo || null, passwordHash]
  );

  if (rows.length === 0) {
    console.log(`Ya existe un usuario con nombre_usuario = "${usuario}" — no se creó nada.`);
  } else {
    console.log("✅ Admin creado:", rows[0]);
    console.log("   Contraseña temporal — se pedirá cambiarla en el primer login.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Error creando el admin:", err.message);
  process.exit(1);
});
