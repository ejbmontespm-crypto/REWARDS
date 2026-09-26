import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { obtenerSesionActual, cerrarSesion as cerrarSesionStorage } from "./session";

const SessionContext = createContext(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession debe usarse dentro de SessionProvider");
  return value;
}

/**
 * Fuente de verdad de "¿hay sesión, y de qué tipo?" para el guard de rutas
 * protegidas — el dispositivo puede estar en modo cliente o modo staff,
 * nunca los dos. Reacciona a cambios de sesión de Supabase (login/logout
 * real por OTP) y a refrescar() manual, que se llama justo después de
 * guardar un token propio (registro, acceso asistido, o login de staff)
 * — esos casos no disparan onAuthStateChange porque no pasan por Supabase.
 */
export function SessionProvider({ children }) {
  const [sesion, setSesion] = useState(null); // { tipo: 'cliente' | 'staff', token } | null
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    setSesion(await obtenerSesionActual());
  }, []);

  useEffect(() => {
    refrescar().finally(() => setCargando(false));
    const { data: suscripcion } = supabase.auth.onAuthStateChange(() => {
      refrescar();
    });
    return () => suscripcion.subscription.unsubscribe();
  }, [refrescar]);

  const cerrarSesion = useCallback(async () => {
    await cerrarSesionStorage();
    setSesion(null);
  }, []);

  return (
    <SessionContext.Provider value={{ sesion, cargando, refrescar, cerrarSesion }}>
      {children}
    </SessionContext.Provider>
  );
}
