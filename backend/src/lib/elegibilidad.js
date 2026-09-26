import { query } from "../config/db.js";
import { obtenerConfig } from "./config.js";
import { minutosDelDiaMexico } from "./recompensa.js";

function minutosDesde(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** true si ahora (hora de México) cae dentro de horario_servicio, o si ese
 *  horario no está activado (en cuyo caso no restringe nada). */
export function dentroDeHorarioServicio(horario, ahora = new Date()) {
  if (!horario?.activo) return true;
  const minutosAhora = minutosDelDiaMexico(ahora);
  return minutosAhora >= minutosDesde(horario.apertura) && minutosAhora < minutosDesde(horario.cierre);
}

/** Misma lógica que GET /clientes/:id/elegibilidad-pedidos — se comparte
 *  porque POST /pedidos necesita validar esto antes de aceptar el carrito. */
export async function calcularElegibilidadPedidos(clienteId) {
  const { rows } = await query(`select * from elegibilidad_pedidos_v where cliente_id = $1`, [clienteId]);
  const gastoAcumulado = Number(rows[0]?.gasto_acumulado_periodo_mxn || 0);
  const { activo: pedidosEnLineaActivos } = await obtenerConfig("pedidos_en_linea_activos");
  const { monto: gastoMinimo } = await obtenerConfig("pedidos_gasto_minimo_mxn");
  const horario = await obtenerConfig("horario_servicio");
  const dentroDeHorario = dentroDeHorarioServicio(horario);

  return {
    gasto_acumulado_periodo_mxn: gastoAcumulado,
    gasto_minimo_mxn: gastoMinimo,
    pedidos_en_linea_activos_global: pedidosEnLineaActivos,
    horario_servicio: horario,
    dentro_de_horario: dentroDeHorario,
    elegible: pedidosEnLineaActivos && gastoAcumulado >= gastoMinimo,
  };
}
