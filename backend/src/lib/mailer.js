/**
 * Stub temporal — el bloque 6 del roadmap ("Integración de correo") lo
 * reemplaza por el envío real vía Resend (ver fase4-correo.md). Mientras
 * tanto, deja el flujo de auth completo y probable: el correo "se manda"
 * aquí como un log, así se puede seguir la lógica sin depender de que
 * Resend ya esté conectado.
 */
export async function enviarCorreo({ to, subject, text }) {
  console.log(`[mailer stub] Para: ${to} | Asunto: ${subject}\n${text}\n`);
}
