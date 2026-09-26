import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Cliente admin de Supabase (service role) — se salta RLS a propósito.
 * Solo se usa server-side para: verificar tokens de sesión del cliente
 * (Auth) y crear su cuenta al registrarse. Nunca exponer esta key fuera
 * del backend.
 */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
