import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { colores as coloresPorDefecto } from "../constants/theme";
import { ASSET_BASE_URL } from "./config";

const TemaContext = createContext({
  colores: coloresPorDefecto,
  logoUrl: null,
  logoQrUrl: null,
  tazaVaciaUrl: null,
  tazaLlenaUrl: null,
  croissantGrisUrl: null,
  croissantDoradoUrl: null,
  recargar: async () => {},
});

function resolverUrl(url) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${ASSET_BASE_URL}${url}`;
}

export function useTema() {
  return useContext(TemaContext);
}

function hexARgb(hex) {
  const limpio = hex.replace("#", "");
  const entero = parseInt(limpio, 16);
  return { r: (entero >> 16) & 255, g: (entero >> 8) & 255, b: entero & 255 };
}

/** Mezcla dos colores hex — proporcionA=1 da puro hexA, 0 da puro hexB. */
function mezclar(hexA, hexB, proporcionA) {
  const a = hexARgb(hexA);
  const b = hexARgb(hexB);
  const r = Math.round(a.r * proporcionA + b.r * (1 - proporcionA));
  const g = Math.round(a.g * proporcionA + b.g * (1 - proporcionA));
  const bl = Math.round(a.b * proporcionA + b.b * (1 - proporcionA));
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Paleta configurable desde el panel (Apariencia). Se pide una sola vez al
 * arrancar la app — no en cada pantalla ni en vivo mientras la app ya está
 * abierta, porque revisarlo todo el tiempo sería desperdiciar batería/datos
 * por algo que casi nunca cambia. Si cambias un color en el panel, se ve la
 * próxima vez que alguien abra la app — o al tocar "Actualizar apariencia"
 * en Perfil/Más, para quien no quiera esperar a reabrir. Si la llamada
 * falla (sin conexión), se queda en los valores que ya tenía — nunca
 * bloquea ni truena.
 *
 * `textoMuted` y `borde` NO son configurables desde el panel (solo 4
 * colores lo son) — se calculan mezclando `texto` y `superficie`, así que
 * siempre quedan legibles sin importar qué tan clara u oscura elija el
 * admin la superficie (antes eran un gris fijo pensado para tarjetas
 * claras — con una superficie oscura, ese gris se volvía casi invisible).
 */
export function TemaProvider({ children }) {
  const [colores, setColores] = useState(coloresPorDefecto);
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoQrUrl, setLogoQrUrl] = useState(null);
  const [tazaVaciaUrl, setTazaVaciaUrl] = useState(null);
  const [tazaLlenaUrl, setTazaLlenaUrl] = useState(null);
  const [croissantGrisUrl, setCroissantGrisUrl] = useState(null);
  const [croissantDoradoUrl, setCroissantDoradoUrl] = useState(null);

  const recargar = useCallback(async () => {
    try {
      const d = await api.get("/configuracion-sistema/publico/apariencia");
      const a = d.apariencia;
      if (!a) return;
      setColores((prev) => {
        const fondo = a.color_fondo || prev.fondo;
        const superficie = a.color_superficie || prev.superficie;
        const texto = a.color_texto || prev.texto;
        const acento = a.color_acento || prev.acento;
        return {
          ...prev,
          fondo,
          superficie,
          texto,
          acento,
          textoMuted: mezclar(texto, superficie, 0.6),
          borde: mezclar(texto, superficie, 0.18),
        };
      });
      if (a.logo_url) setLogoUrl(resolverUrl(a.logo_url));
      setLogoQrUrl(resolverUrl(a.logo_qr_url));
      setTazaVaciaUrl(resolverUrl(a.taza_vacia_url));
      setTazaLlenaUrl(resolverUrl(a.taza_llena_url));
      setCroissantGrisUrl(resolverUrl(a.croissant_gris_url));
      setCroissantDoradoUrl(resolverUrl(a.croissant_dorado_url));
      return true;
    } catch {
      /* se reintenta una vez en el arranque (ver abajo) — fuera de ahí, se
         queda con lo que ya tenía, nunca bloquea ni truena */
      return false;
    }
  }, []);

  useEffect(() => {
    // Primer intento puede fallar por un arranque en frío del backend
    // (Railway) justo al abrir la app — sin este reintento, la pantalla se
    // quedaba pegada en los colores de respaldo toda la sesión, hasta que
    // alguien tocara "Actualizar apariencia" a mano.
    recargar().then((ok) => {
      if (!ok) setTimeout(recargar, 4000);
    });
  }, [recargar]);

  return (
    <TemaContext.Provider
      value={{ colores, logoUrl, logoQrUrl, tazaVaciaUrl, tazaLlenaUrl, croissantGrisUrl, croissantDoradoUrl, recargar }}
    >
      {children}
    </TemaContext.Provider>
  );
}
