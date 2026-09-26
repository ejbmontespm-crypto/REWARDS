import pg from "pg";
import { env } from "./env.js";

/**
 * Único punto de acceso a Postgres. Conexión directa (no vía la API
 * REST de Supabase) — ver "Seguridad de acceso" en fase1-esquema-datos.md:
 * este backend es el único que toca las tablas; el resto pasa por aquí.
 */
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  // Error en un cliente inactivo del pool (ej. la conexión se cayó) —
  // no debe tumbar el proceso completo, solo se registra.
  console.error("Error inesperado en el pool de Postgres:", err);
});

/**
 * node-postgres no trae parser automático para arrays de tipos enum
 * PROPIOS (ej. perfil_tipo[], usado en promociones_informativas.segmentos)
 * — sin esto llega como el texto crudo de Postgres ("{docente}", un
 * string) en vez de un arreglo real, lo que rompe silenciosamente
 * cualquier código que espere Array.isArray(...). Se registra una sola
 * vez, al arrancar, buscando el OID real del tipo (no es fijo, Postgres
 * lo asigna al crear el tipo).
 */
function parsePgTextArray(raw) {
  if (raw == null) return null;
  const inner = raw.slice(1, -1);
  return inner === "" ? [] : inner.split(",");
}

try {
  const { rows } = await pool.query(`select typarray from pg_type where typname = 'perfil_tipo'`);
  const arrayOid = rows[0]?.typarray;
  if (arrayOid) pg.types.setTypeParser(arrayOid, parsePgTextArray);
} catch (err) {
  console.error("No se pudo registrar el parser de perfil_tipo[] — segmentos llegará como texto crudo:", err.message);
}

/**
 * Columnas `date` (sin hora ni zona) — el parser default de node-postgres
 * las convierte a un objeto Date de JS usando la zona horaria AMBIENTE
 * del proceso, algo ambiguo y distinto de la zona de Postgres (`current_date`
 * corre en UTC salvo que se configure otra cosa). Esa mezcla causó un bug
 * real en el job de vigencias (fase5): una fecha "hoy" según Postgres podía
 * leerse como "mañana" en JS según dónde corriera el servidor. Se evita
 * de raíz dejando las columnas `date` como el texto plano que Postgres ya
 * guarda ("2026-09-28", OID 1082, fijo para todo Postgres) — sin
 * conversión a Date en absoluto; quien la use decide su propia zona
 * horaria explícita (ver diasEntre/hoyMexico en lib/cicloVigencia.js).
 */
pg.types.setTypeParser(1082, (valor) => valor);

/** Atajo para consultas sueltas: query('select 1 where id = $1', [id]) */
export function query(text, params) {
  return pool.query(text, params);
}

/** Para operaciones que necesitan una sola conexión (ej. transacciones). */
export function getClient() {
  return pool.connect();
}
