import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Clave anon (pública) — el login OTP habla directo con Supabase desde aquí.
// El backend nunca ve esta llamada; solo verifica después el token resultante.
const SUPABASE_URL = "https://upkwsjiuvwovpltldwxs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwa3dzaml1dndvdnBsdGxkd3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTQ2MTYsImV4cCI6MjEwNDk5MDYxNn0.bZVSHSyyuJmkcOAmFNo_56K4zeg9rcSVsL1j-3CnxI4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
