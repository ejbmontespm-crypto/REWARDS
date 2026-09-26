import { query } from "../config/db.js";
import { enviarCorreo } from "./mailer.js";

/**
 * El "disparador único" de notificaciones (plan-maestro §10): decide a
 * quién, arma el contenido, envía por correo (Resend real hasta que se
 * conecte esa fase — por ahora usa el mailer stub) y deja registro en
 * notificaciones_log para el reporte del admin y la bandeja del cliente.
 *
 * Solo registra el canal "correo" por ahora — "push" necesitaría tokens
 * de Expo que todavía no existen (no hay app construida), así que
 * anotarlo como "enviado" sería falso. Se agrega cuando exista la app.
 */
export async function notificarClientes({ tipo, segmentos, asunto, texto }) {
  const tieneSegmentos = Array.isArray(segmentos) && segmentos.length > 0;
  const { rows: destinatarios } = await query(
    `select id, nombre, correo from clientes
     where notificaciones_activas = true
     ${tieneSegmentos ? "and tipo_perfil = any($1::perfil_tipo[])" : ""}`,
    tieneSegmentos ? [segmentos] : []
  );

  let enviados = 0;
  for (const cliente of destinatarios) {
    let estado = "enviado";
    let detalle = null;
    try {
      await enviarCorreo({ to: cliente.correo, subject: asunto, text: texto });
      enviados++;
    } catch (err) {
      estado = "fallido";
      detalle = { error: err.message };
    }
    await query(
      `insert into notificaciones_log (cliente_id, canal, tipo, estado, detalle) values ($1, 'correo', $2, $3, $4)`,
      [cliente.id, tipo, estado, detalle ? JSON.stringify(detalle) : null]
    );
  }

  return { destinatarios: destinatarios.length, enviados };
}

/**
 * Para avisos TRANSACCIONALES a una lista explícita de clientes (ej.
 * vencimiento de puntos) — se manda siempre, sin filtrar por
 * notificaciones_activas (esa bandera solo frena lo promocional, plan
 * §10 / fase4-correo.md). `destinatarios` es [{id, correo}, ...].
 */
export async function notificarClientesPorId(destinatarios, { tipo, asunto, texto }) {
  let enviados = 0;
  for (const cliente of destinatarios) {
    let estado = "enviado";
    let detalle = null;
    try {
      await enviarCorreo({ to: cliente.correo, subject: asunto, text: texto });
      enviados++;
    } catch (err) {
      estado = "fallido";
      detalle = { error: err.message };
    }
    await query(
      `insert into notificaciones_log (cliente_id, canal, tipo, estado, detalle) values ($1, 'correo', $2, $3, $4)`,
      [cliente.id, tipo, estado, detalle ? JSON.stringify(detalle) : null]
    );
  }
  return { destinatarios: destinatarios.length, enviados };
}
