// Un solo uso: agrega la columna que necesita el flujo de eliminación de
// cuenta (ver DELETE /clientes/me y /clientes/confirmar-eliminacion en
// clientes.routes.js) para poder marcar una cuenta como borrada sin
// perder el historial de pedidos/canjes que referencian su id — la fila
// se anonimiza, nunca se borra de verdad.
import { pool } from "../src/config/db.js";

await pool.query(`alter table clientes add column if not exists eliminado_en timestamptz`);
console.log("Columna clientes.eliminado_en lista.");
await pool.end();
