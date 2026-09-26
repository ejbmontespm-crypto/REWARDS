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
