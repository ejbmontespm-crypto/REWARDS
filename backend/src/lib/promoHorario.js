import { minutosDelDiaMexico } from "./recompensa.js";

function minutosDesde(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const DIA_SEMANA_MEXICO = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** 0=domingo...6=sábado, leído en hora de México (no la del servidor). */
function diaSemanaMexico(fecha = new Date()) {
  const abrev = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", weekday: "short" }).format(fecha);
  return DIA_SEMANA_MEXICO[abrev];
}

/**
 * true si la promo no tiene ventana de días/horario configurada (dias_semana
 * y hora_inicio/hora_fin son casos independientes: cualquiera puede faltar),
 * o si "ahora" cae dentro de la que sí tenga.
 */
export function promoDentroDeVentana(promo, ahora = new Date()) {
  if (promo.dias_semana?.length && !promo.dias_semana.includes(diaSemanaMexico(ahora))) {
    return false;
  }
  if (promo.hora_inicio && promo.hora_fin) {
    const minutosAhora = minutosDelDiaMexico(ahora);
    if (minutosAhora < minutosDesde(promo.hora_inicio) || minutosAhora >= minutosDesde(promo.hora_fin)) {
      return false;
    }
  }
  return true;
}

/** Una promo con horario propio (ej. happy hour) solo se puede recoger de inmediato — no se "aparta" el precio para horas después. */
export function promoExigePickupInmediato(promo) {
  return Boolean(promo.hora_inicio && promo.hora_fin);
}
