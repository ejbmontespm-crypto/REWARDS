// Paleta provisional del cliente (25 sep 2026) — configurable desde el
// panel (Apariencia → GET/PATCH /configuracion-sistema/apariencia). Estos
// son los valores por defecto si esa pantalla nunca se toca; coinciden con
// lo que el panel ya trae guardado de fábrica. El panel en sí conserva su
// propia paleta neutra B2B — esto es solo para la app del cliente.
// fondo/superficie/texto/acento son los 4 configurables desde el panel — los
// valores aquí son solo el arranque antes de que responda la API (o si
// falla). textoMuted/borde NO son un color de marca: son neutros calculados
// (mismo criterio que lib/contextoTema.js) para que, mientras carga o si la
// llamada falla, nunca se vea un contorno del color de fondo/marca en vez de
// un gris neutro — antes "borde" era un rosa fijo heredado del fondo default.
export const colores = {
  fondo: "#FFCFFF",
  superficie: "#FFFFFF",
  texto: "#000000",
  textoMuted: "#6b6b6b",
  borde: "#d1d1d1",
  acento: "#754F34",
  exito: "#15803d",
  peligro: "#b3261e",
};

/**
 * Tokens de diseño fijos (NO configurables desde el panel — a diferencia de
 * `colores`, esto es maquetación pura). Antes cada pantalla inventaba sus
 * propios radios/tamaños de fuente sueltos (8, 10, 12, 14, 16, 20, 24... sin
 * ningún patrón), lo que hacía que la app se sintiera "hecha a mano" en vez
 * de un sistema. Auditoría UX, punto 1.
 */
export const radios = { chico: 8, medio: 14, grande: 20 };

export const tipografia = {
  xs: 11, // fechas, pies de página
  sm: 12.5, // subtítulos, textos muted
  base: 14, // cuerpo de texto normal
  md: 16, // títulos de tarjeta
  lg: 20, // títulos de pantalla
  xl: 26, // cifras destacadas (saldo, totales grandes)
};

/** Dos niveles nada más — "suave" para tarjetas de contenido, "media" para
 *  elementos que de verdad flotan sobre todo (botones flotantes, modales). */
export const sombra = {
  suave: { elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  media: { elevation: 5, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
};
