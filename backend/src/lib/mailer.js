import { Resend } from "resend";
import { env } from "../config/env.js";

/**
 * Envío real vía Resend cuando hay API key configurada; si no, cae a un
 * stub que solo deja constancia de que "se mandó" (sin el cuerpo — antes
 * logueaba el mensaje completo, lo que dejaba contraseñas temporales y
 * códigos de recuperación en texto plano en los logs de Railway, hallazgo
 * de la auditoría de seguridad). El stub es solo para desarrollo local
 * sin la key configurada; en producción RESEND_API_KEY es obligatoria.
 */
const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function enviarCorreo({ to, subject, text }) {
  if (!resend) {
    console.log(`[mailer stub] Correo "${subject}" para ${to} — RESEND_API_KEY no configurada, no se mandó de verdad.`);
    return;
  }

  const { error } = await resend.emails.send({ from: env.resendFromEmail, to, subject, text });
  if (error) {
    console.error(`No se pudo mandar el correo "${subject}" a ${to}:`, error.message || error);
    throw new Error("No se pudo enviar el correo");
  }
}
