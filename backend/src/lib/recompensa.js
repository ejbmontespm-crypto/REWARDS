import { query } from "../config/db.js";

/** Minutos desde medianoche en hora de México — para comparar contra el horario de servicio. */
export function minutosDelDiaMexico(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value])
  );
  const hora = partes.hour === "24" ? 0 : Number(partes.hour);
  return hora * 60 + Number(partes.minute);
}

/** Fecha local (America/Mexico_City) en formato YYYY-MM-DD — para el límite de 1 visita/día. */
export function diaLocalMexico(fecha = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/**
 * Instante UTC real que corresponde a "hoy 00:00:00" en hora de México —
 * para acotar columnas timestamptz a "el día de hoy" (ej. el historial de
 * "Entregados" del KDS) sin caer en el mismo bug de zona horaria que ya se
 * corrigió en cicloVigencia.js: nunca usar `current_date` de Postgres (zona
 * del servidor) ni la zona ambiente de Node — el offset se lee de verdad
 * desde Intl, así que sigue siendo correcto aunque cambie el horario de verano.
 */
export function inicioDeHoyMexicoUTC(ahora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(ahora)
      .map((p) => [p.type, p.value])
  );
  const horaMexicoLeidaComoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour === "24" ? 0 : partes.hour, partes.minute, partes.second);
  const offsetMs = horaMexicoLeidaComoUtc - ahora.getTime();
  const medianocheLeidaComoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, 0, 0, 0);
  return new Date(medianocheLeidaComoUtc - offsetMs);
}

/**
 * Calcula lo que genera un movimiento (créditos y/o si cuenta como visita)
 * según la modalidad de la regla que estaba vigente — plan-maestro §5.
 * Se usa tanto al registrar una venta como al recalcular una corrección,
 * siempre contra la regla guardada en el movimiento, no la que esté
 * activa hoy (el historial no se recalcula si la regla cambia después).
 */
export async function calcularAcumulacion({ config, monto, clienteId, diaLocal, movimientoId = null }) {
  let creditosGenerados = 0;
  let cuentaComoVisita = false;

  if (config.modalidad === "credito_valor_mxn" || config.modalidad === "credito_umbral") {
    const porcentaje = Number(config.porcentaje_acumulacion) || 0;
    creditosGenerados = Math.round(monto * (porcentaje / 100) * 100) / 100;
  } else if (config.modalidad === "visitas") {
    const consumoMinimo = Number(config.consumo_minimo_mxn) || 0;
    // `movimientoId` se manda solo al recalcular una corrección — se excluye
    // a sí mismo de la suma/bandera (su monto viejo ya se va a reemplazar).
    const { rows } = await query(
      `select coalesce(sum(monto), 0) as suma_previa, bool_or(cuenta_como_visita) as ya_conto
       from movimientos
       where cliente_id = $1 and dia_local = $2 ${movimientoId ? "and id != $3" : ""}`,
      movimientoId ? [clienteId, diaLocal, movimientoId] : [clienteId, diaLocal]
    );
    const sumaPrevia = Number(rows[0].suma_previa);
    const yaConto = Boolean(rows[0].ya_conto);
    // Se acumulan las compras del mismo cliente en el mismo día: si una sola
    // no llega al mínimo pero la suma de varias sí, la que complete el
    // mínimo es la que cuenta como la visita del día (máx. 1 por día).
    cuentaComoVisita = !yaConto && sumaPrevia + monto >= consumoMinimo;
  }

  return { creditosGenerados, cuentaComoVisita };
}
