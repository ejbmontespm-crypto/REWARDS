import { query } from "../config/db.js";
import { obtenerConfig } from "./config.js";
import { notificarClientes, notificarClientesPorId } from "./notificar.js";

const MS_POR_DIA = 86_400_000;

/**
 * Todo el cálculo de "cuántos días faltan" se hace en días de calendario
 * puros (YYYY-MM-DD → UTC de medianoche), nunca con Date + hora local —
 * evita el bug de mezclar la zona horaria de Postgres con la del sistema
 * donde corre Node (ver la nota en config/db.js). "Hoy" se ancla siempre
 * a America/Mexico_City, sin importar en qué zona esté el servidor real.
 */
function aTimestampUTC(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function diasEntre(fechaIsoA, fechaIsoB) {
  return Math.round((aTimestampUTC(fechaIsoB) - aTimestampUTC(fechaIsoA)) / MS_POR_DIA);
}

function hoyMexicoISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

// =========================================================
// tipo = 'puntos_creditos_visitas'
// =========================================================

async function pasoAvisoPrevioPuntos(ciclo) {
  if (ciclo.aviso_previo_enviado_en) return null; // ya se mandó, no repetir

  const { dias: diasAviso } = await obtenerConfig("vigencia_aviso_previo_dias");
  const faltan = diasEntre(hoyMexicoISO(), ciclo.fecha_limite);
  if (faltan <= 0 || faltan > diasAviso) return null; // el día exacto ya lo cubre el paso de ejecución, no los dos

  const { rows: destinatarios } = await query(
    `select cliente_id as id, c.correo from saldos_cliente_v s join clientes c on c.id = s.cliente_id
     where s.creditos_disponibles > 0 or s.visitas_disponibles > 0`
  );
  const resultado = await notificarClientesPorId(destinatarios, {
    tipo: "vencimiento_puntos",
    asunto: "Tus créditos/visitas están por vencer",
    texto: `Vencen el ${ciclo.fecha_limite} (en ${faltan} día${faltan === 1 ? "" : "s"}) — aprovéchalos antes de que se pierdan.`,
  });
  await query(`update ciclos_vigencia set aviso_previo_enviado_en = now() where id = $1`, [ciclo.id]);
  return { paso: "aviso_previo_puntos", ...resultado };
}

async function pasoEjecucionPuntos(ciclo) {
  if (diasEntre(hoyMexicoISO(), ciclo.fecha_limite) > 0) return null; // todavía no llega la fecha

  const { rows: saldos } = await query(
    `select cliente_id, correo, creditos_disponibles, visitas_disponibles
     from saldos_cliente_v s join clientes c on c.id = s.cliente_id
     where s.creditos_disponibles > 0 or s.visitas_disponibles > 0`
  );

  for (const s of saldos) {
    if (Number(s.creditos_disponibles) > 0) {
      await query(`insert into canjes (cliente_id, tipo, cantidad_descontada) values ($1, 'expiracion_creditos', $2)`, [
        s.cliente_id,
        s.creditos_disponibles,
      ]);
    }
    if (Number(s.visitas_disponibles) > 0) {
      await query(`insert into canjes (cliente_id, tipo, cantidad_descontada) values ($1, 'expiracion_visitas', $2)`, [
        s.cliente_id,
        s.visitas_disponibles,
      ]);
    }
  }

  // Reinicia el contador de elegibilidad de pedidos en línea para TODOS
  // (no solo a quien tenía saldo) — fase1-esquema-datos.md, adición 11 sep.
  await query(`update clientes set ciclo_gasto_desde = now()`);

  const resultado = await notificarClientesPorId(
    saldos.map((s) => ({ id: s.cliente_id, correo: s.correo })),
    { tipo: "vencimiento_puntos", asunto: "Tus créditos/visitas vencieron", texto: "Tu saldo se reinició — vuelve a acumular en tu próxima visita." }
  );

  await query(`update ciclos_vigencia set ejecutado = true, ejecutado_en = now() where id = $1`, [ciclo.id]);
  return { paso: "ejecucion_puntos", clientes_afectados: saldos.length, ...resultado };
}

// =========================================================
// tipo = 'confirmacion_cuenta'
// =========================================================

async function pasoInvitarConfirmacion(ciclo) {
  if (ciclo.notificado_en) return null; // ya se invitó
  if (diasEntre(hoyMexicoISO(), ciclo.fecha_limite) > 0) return null; // aún no llega la fecha

  await query(`update clientes set confirmado_en_ciclo_actual = false where notificaciones_activas = true`);
  const resultado = await notificarClientes({
    tipo: "confirmacion_cuenta",
    segmentos: null,
    asunto: "Confirma tu cuenta para seguir recibiendo tus promociones",
    texto: `Tienes hasta el ${new Date(new Date(ciclo.fecha_limite).getTime() + (ciclo.plazo_gracia_dias || 0) * MS_POR_DIA).toISOString().slice(0, 10)} para confirmar — entra a la app y confirma en un toque.`,
  });
  await query(`update ciclos_vigencia set notificado_en = now() where id = $1`, [ciclo.id]);
  return { paso: "invitar_confirmacion", ...resultado };
}

async function pasoRecordatorioConfirmacion(ciclo) {
  if (!ciclo.notificado_en || ciclo.aviso_previo_enviado_en || ciclo.ejecutado) return null;
  const mitadDias = Math.floor((ciclo.plazo_gracia_dias || 0) / 2);
  if (diasEntre(hoyMexicoISO(), ciclo.fecha_limite) > -mitadDias) return null; // aún no llega el punto medio

  const { rows: destinatarios } = await query(
    `select id, correo from clientes where notificaciones_activas = true and confirmado_en_ciclo_actual = false`
  );
  const resultado = await notificarClientesPorId(destinatarios, {
    tipo: "confirmacion_cuenta",
    asunto: "Te quedan pocos días para confirmar tu cuenta",
    texto: "Si no confirmas antes de que termine el plazo, dejarás de recibir avisos de promociones (tu saldo e historial no se ven afectados).",
  });
  await query(`update ciclos_vigencia set aviso_previo_enviado_en = now() where id = $1`, [ciclo.id]);
  return { paso: "recordatorio_confirmacion", ...resultado };
}

async function pasoDesactivarNoConfirmados(ciclo) {
  if (!ciclo.notificado_en) return null;
  // hoy >= fecha_limite + plazo_gracia_dias  <=>  diasEntre(hoy, fecha_limite) <= -plazo_gracia_dias
  if (diasEntre(hoyMexicoISO(), ciclo.fecha_limite) > -(ciclo.plazo_gracia_dias || 0)) return null;

  const { rows } = await query(
    `update clientes set notificaciones_activas = false
     where notificaciones_activas = true and confirmado_en_ciclo_actual = false
     returning id`
  );
  await query(`update ciclos_vigencia set ejecutado = true, ejecutado_en = now() where id = $1`, [ciclo.id]);
  return { paso: "desactivar_no_confirmados", clientes_desactivados: rows.length };
}

// =========================================================
// Punto de entrada — corre los 5 pasos, cada uno se salta solo si no aplica.
// Segura de correr más de una vez al día (cada paso revisa sus propias banderas).
// =========================================================
export async function ejecutarCiclosVigencia() {
  const { rows: ciclos } = await query(`select * from ciclos_vigencia where ejecutado = false`);
  const resultados = [];

  for (const ciclo of ciclos) {
    if (ciclo.tipo === "puntos_creditos_visitas") {
      resultados.push(await pasoAvisoPrevioPuntos(ciclo));
      resultados.push(await pasoEjecucionPuntos(ciclo));
    } else if (ciclo.tipo === "confirmacion_cuenta") {
      resultados.push(await pasoInvitarConfirmacion(ciclo));
      resultados.push(await pasoRecordatorioConfirmacion(ciclo));
      resultados.push(await pasoDesactivarNoConfirmados(ciclo));
    }
  }

  return resultados.filter(Boolean);
}
