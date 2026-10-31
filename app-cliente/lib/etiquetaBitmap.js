// Dibujo puro del bitmap de la etiqueta — logo, texto (dos fuentes de
// píxeles de dominio público: 8×8 para folio/nombre, 5×7 a escala 2 para
// productos/hora — ver más abajo) y QR (matriz de módulos de `qrcode`),
// compuestos en un lienzo de 1 bit por píxel. Sin dependencias nativas a
// propósito: así se puede previsualizar en web/Node antes de gastar un
// build, y lo único que cambia al imprimir de verdad es quién manda los
// bytes (ver impresoraEtiquetas.js).
import { Buffer } from "buffer";
import QRCode from "qrcode";

export const ANCHO_DOTS = 320; // 40mm × 8 dots/mm (203dpi)
export const ALTO_DOTS = 480; // 60mm × 8 dots/mm

const MARGEN_X = 16;
const ANCHO_UTIL = ANCHO_DOTS - MARGEN_X * 2;
const ESCALA_ITEM = 2;

/** Nombres de producto largos ("Croissant de jamón y queso") no caben en
 *  una sola línea a esta escala — sin esto se recortaban en silencio y
 *  se perdía la última palabra (ej. "queso"), lo cual podía confundir en
 *  cocina. Corta por palabra completa, nunca a la mitad de una. */
function envolverTexto(texto, maxCaracteres) {
  const textoStr = String(texto);
  // Conserva la sangría inicial (ej. "  + extra queso") en cada línea que
  // resulte, para no perder la jerarquía visual si el extra también se
  // tiene que partir en dos.
  const indent = textoStr.match(/^\s+/)?.[0] || "";
  const palabras = textoStr.slice(indent.length).split(/\s+/).filter(Boolean);
  const maxContenido = Math.max(1, maxCaracteres - indent.length);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (candidato.length > maxContenido && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidato;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length === 0) lineas.push("");
  return lineas.map((l) => indent + l);
}

export function nombreCorto(pedido) {
  const primerNombre = (pedido.nombre || "").trim().split(/\s+/)[0] || "";
  return `${primerNombre} ${pedido.apellido_paterno || ""}`.trim();
}

export function lineasDeItems(items) {
  return (items || []).flatMap((item) => {
    const base = `${item.cantidad}x ${item.producto_nombre}`;
    const extras = item.extras?.length ? item.extras.map((e) => e.extra_nombre).join(", ") : null;
    return extras ? [base, `  + ${extras}`] : [base];
  });
}

// ---------------------------------------------------------------------
// Dos fuentes de píxeles, ambas de dominio público, embebidas en base64:
// - FUENTE_GRANDE (8×8, derivada de la VGA original de IBM vía font8x8
//   de Daniel Hepper) para folio/nombre — se quiere que se lean rápido.
// - FUENTE_CHICA (5×7, la clásica de Adafruit_GFX) para la lista de
//   productos y la hora — a escala 2 queda en un tamaño intermedio real
//   (ni tan grande como la 8×8, ni tan chica como la 8×8 a escala 1, que
//   resultó ilegible en la impresora de verdad).
// Cada fuente: N bytes por carácter (ASCII 0x20–0x7E), una columna por
// byte, bit 0 = fila de arriba.
// ---------------------------------------------------------------------
function crearDescriptorFuente(base64, cols, filas) {
  let datos = null;
  return {
    cols,
    filas,
    obtener() {
      if (!datos) datos = Buffer.from(base64, "base64");
      return datos;
    },
  };
}

const FUENTE_GRANDE = crearDescriptorFuente(
  "AAAAAAAAAAAAAAZfXwYAAAADAwADAwAAFH9/FH9/FAAkLmtrOhIAAEZmMBgMZmIAMHpPXTd6SAAEBwMAAAAAAAAcPmNBAAAAAEFjPhwAAAAIKj4cHD4qCAgIPj4ICAAAAIDgYAAAAAAICAgICAgAAAAAYGAAAAAAYDAYDAYDAQA+f3FZTX8+AEBCf39AQAAAYnNZSW9mAAAiY0lJfzYAABgcFlN/f1AAJ2dFRX05AAA8fktJeTAAAAMDcXkPBwAANn9JSX82AAAGT0lpPx4AAAAAZmYAAAAAAIDmZgAAAAAIHDZjQQAAACQkJCQkJAAAAEFjNhwIAAACA1FZDwYAAD5/QV1dHx4AfH4TE358AABBf39JSX82ABw+Y0FBYyIAQX9/QWM+HABBf39JXUFjAEF/f0kdAQMAHD5jQVFzcgB/fwgIf38AAABBf39BAAAAMHBAQX8/AQBBf38IHHdjAEF/f0FAYHAAf38OHA5/fwB/fwYMGH9/ABw+Y0FjPhwAQX9/SQkPBgAePyFxf14AAEF/fwkZf2YAJm9NWXMyAAADQX9/QQMAAH9/QEB/fwAAHz9gYD8fAAB/fzAYMH9/AENnPBg8Z0MAB094eE8HAABHY3FZTWdzAAB/f0FBAAAAAQMGDBgwYAAAQUF/fwAAAAgMBgMGDAgAgICAgICAgIAAAAMHBAAAACB0VFQ8eEAAQX8/SEh4MAA4fEREbCgAADB4SEk/f0AAOHxUVFwYAABIfn9JAwIAAJi8pKT4fAQAQX9/CAR8eAAARH19QAAAAGDggID9fQAAQX9/EDhsRAAAQX9/QAAAAHx8GDgcfHgAfHwEBHx4AAA4fEREfDgAAIT8+KQkPBgAGDwkpPj8hABEfHhMBBwYAEhcVFR0JAAAAAQ+f0QkAAA8fEBAPHxAABw8YGA8HAAAPHxwOHB8PABEbDgQOGxEAJy8oKD8fAAATGR0XExkAAAICD53QUEAAAAAAHd3AAAAQUF3PggIAAACAwEDAgMBAA==",
  8,
  8
);

const FUENTE_CHICA = crearDescriptorFuente(
  "AAAAAAAAAF8AAAAHAAcAFH8UfxQkKn8qEiMTCGRiNklWIFAACAcDAAAcIkEAAEEiHAAqHH8cKggIPggIAIBwMAAICAgICAAAYGAAIBAIBAI+UUlFPgBCf0AAcklJSUYhQUlNMxgUEn8QJ0VFRTk8SklJMUEhEQkHNklJSTZGSUkpHgAAFAAAAEA0AAAACBQiQRQUFBQUAEEiFAgCAVkJBj5BXVlOfBIREnx/SUlJNj5BQUEif0FBQT5/SUlJQX8JCQkBPkFBUXN/CAgIfwBBf0EAIEBBPwF/CBQiQX9AQEBAfwIcAn9/BAgQfz5BQUE+fwkJCQY+QVEhXn8JGSlGJklJSTIDAX8BAz9AQEA/HyBAIB8/QDhAP2MUCBRjAwR4BANhWUlNQwB/QUFBAgQIECAAQUFBfwQCAQIEQEBAQEAAAwcIACBUVHhAfyhERDg4REREKDhERCh/OFRUVBgACH4JAhikpJx4fwgEBHgARH1AACBAQD0AfxAoRAAAQX9AAHwEeAR4fAgEBHg4REREOPwYJCQYGCQkGPx8CAQECEhUVFQkBAQ/RCQ8QEAgfBwgQCAcPEAwQDxEKBAoREyQkJB8RGRUTEQACDZBAAAAdwAAAEE2CAACAQIEAg==",
  5,
  7
);

// ---------------------------------------------------------------------
// Logo "D·éclair" — convertido una sola vez (fuera de la app, ver
// scratchpad de la sesión) desde el PNG real configurado en Apariencia a
// 1 bit por píxel. NO se actualiza solo si cambia el logo del negocio —
// si eso pasa, hay que repetir la conversión y sacar un build nuevo
// (pendiente explorar una versión dinámica más adelante).
// ---------------------------------------------------------------------
const LOGO_ANCHO = 220;
const LOGO_ALTO = 80;
const LOGO_ANCHO_BYTES = 28;
const LOGO_B64 =
  "AAAAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4D8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/g/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4f/j4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A/AOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeADwBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAeAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwADwHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAcBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAHg8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AA4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAPHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AB3wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAf4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/AH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/+8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/7gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/4AAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAP//4AAAAAAAP/AAAAA//AAAAAA//gAAfh//4AD///wAAAAAAf/+AAAA//8APgAA///A+H4f//gA///+AAAAAAP//4AAA///wD4AA///4Ph+H//8AP///4AAAAAP///gAA////A+AAf///j4fh///gD4AP/AAAAAH///8AAf8A/4PgAP/z/8+H4fgP8A+AAf4AAAAD/AD/gAP8AD/D4AH+AD//h+H4A/gPgAB/AAAAB/AAH8AH8AAPw+AD+AAP/4fh+AH4D4AAH4AAAA/gAA/gD+AAB8PgB/AAA/+H4fgA/A+AAA+AAAAfgAAH4A/AAAOD4A/gAAH/h+H4APwPgAAHwAAAHwAAA/AfgAABA+APwAAA/4fh+AB8D4AAB8AAAD8AAAH4H4AAAAPgH4AAAH+H4fgAfA+AAAPgAAA+AAAA+D8AAAAD4B8AAAB/h+H4AHwPgAAB4AAAfAAAAPg/AAAAA+A/AAAAP4fh+AD8D4AAAfAAAHwAAAB8fgAAAAPgPgAAAD+H4fgA/A+AAAHwAAB8AAAAfH4AAAAD4D4AAAAfh+H4AfgPgAAA8A8A+AAAAHx+AAAAA+B+AAAAH4fh+AP4D4AAAPAfwPgAAAB8fgAAAAPgfAAAAB+H4fgH8A+AAADwP8D//////nwAAAAD4HwAAAAfh+H///APgAAA8D/g//////58AAAAA+B8AAAAD4fh///AD4AAAPA/4P/////+fAAAAAPgfAAAAA+H4f//gA+AAADwP+D//////nwAAAAD4HwAAAAfh+H//wAPgAAA8D/A/f////x+AAAAA+B8AAAAH4fh+H+AD4AAAPAfwPgAAAAAfgAAAAPgfAAAAB+H4fgfwA+AAAHwD4B4AAAAAH4AAAAD4H4AAAAfh+H4D+APgAAB4AAAfAAAAAB+AAAAA+A+AAAAH4fh+AfwD4AAAeAAAHwAAAAAPwAAAAPgPwAAAD+H4fgD8A+AAAPgAAA+AAAAAD8AAAAD4D8AAAA/h+H4AfgPgAAHwAAAPgAAAYA/gAAAA+AfgAAAf4fh+AD4D4AAB8AAAB8AAAPgH4AAAAPgH4AAAP+H4fgA/A+AAA+AAAAfgAAD4A/AAAMD4A/AAAH/h+H4AHwPgAAfAAAAD8AAD+AP4AAHg+AP4AAD/4fh+AB+D4AAfwAAAAfwAB/AB/AAD8PgB/gAB/+H4fgAfg+AAf4AAAAH/AB/gAP8AB/D4AP8AB//h+H4AD4PgA/8AAAAAf+H/wAB/wD/g+AB/4D/z4fh+AA+D///8AAAAAD///4AAP///wPgAP///4+H4fgAPw///+AAAAAAf//8AAA///4D4AA///8Ph+H4AD8P//+AAAAAAB//8AAAH//4A+AAH//+D4fh+AA/D//8AAAAAAAD/4AAAAP/4APgAAf/8A8H4fgAPwAAAAAAAAAAAAAAAAAAPAAD4AAA/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+AAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///AAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//wA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB///gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf+AAAAAAAAA=";
let LOGO = null;
function obtenerLogo() {
  if (!LOGO) LOGO = Buffer.from(LOGO_B64, "base64");
  return LOGO;
}

/** El texto en los pedidos puede traer acentos/ñ que la fuente (solo
 *  ASCII 0x20–0x7E) no tiene — se normaliza quitando diacríticos en vez
 *  de dejar un hueco/signo de interrogación por cada letra. */
function normalizarParaFuente(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/×/g, "x")
    .replace(/[  -​ ]/g, " ") // espacios "raros" que meten algunos locales (ej. antes de "p.m.")
    .replace(/[^\x20-\x7e]/g, "?");
}

// ---------------------------------------------------------------------
// Lienzo de 1 bit por píxel — se dibuja todo acá (logo, texto y QR) y al
// final se empaca en los bytes que espera el comando BITMAP de TSPL.
// ---------------------------------------------------------------------
export function crearLienzo(ancho, alto) {
  return { ancho, alto, pixeles: new Uint8Array(ancho * alto) };
}

function ponerPixel(lienzo, x, y) {
  if (x < 0 || x >= lienzo.ancho || y < 0 || y >= lienzo.alto) return;
  lienzo.pixeles[y * lienzo.ancho + x] = 1;
}

function dibujarGlifo(lienzo, x, y, codigo, escala, fuente) {
  if (codigo < 0x20 || codigo > 0x7e) return;
  const datos = fuente.obtener();
  const offset = (codigo - 0x20) * fuente.cols;
  for (let col = 0; col < fuente.cols; col++) {
    const columna = datos[offset + col];
    for (let fila = 0; fila < fuente.filas; fila++) {
      if ((columna >> fila) & 1) {
        for (let sy = 0; sy < escala; sy++) {
          for (let sx = 0; sx < escala; sx++) {
            ponerPixel(lienzo, x + col * escala + sx, y + fila * escala + sy);
          }
        }
      }
    }
  }
}

function anchoTexto(texto, escala, fuente) {
  return normalizarParaFuente(texto).length * (fuente.cols + 1) * escala;
}

/** Dibuja texto de izquierda a derecha; recorta si se pasa del ancho
 *  disponible en vez de desbordarse fuera de la etiqueta. */
export function dibujarTexto(lienzo, x, y, texto, escala, anchoMaximo, fuente = FUENTE_GRANDE) {
  const limpio = normalizarParaFuente(texto);
  const anchoGlifo = (fuente.cols + 1) * escala; // 1 columna de espacio entre letras
  let cursorX = x;
  for (const ch of limpio) {
    if (anchoMaximo != null && cursorX + anchoGlifo > x + anchoMaximo) break;
    dibujarGlifo(lienzo, cursorX, y, ch.charCodeAt(0), escala, fuente);
    cursorX += anchoGlifo;
  }
}

/** Mismo dibujo, pero centrado horizontalmente dentro de [x, x+ancho]. */
function dibujarTextoCentrado(lienzo, x, anchoDisponible, y, texto, escala, fuente = FUENTE_GRANDE) {
  const ancho = Math.min(anchoTexto(texto, escala, fuente), anchoDisponible);
  const inicio = x + Math.max(0, (anchoDisponible - ancho) / 2);
  dibujarTexto(lienzo, Math.round(inicio), y, texto, escala, anchoDisponible, fuente);
}

export function dibujarQr(lienzo, x, y, contenido, escalaModulo) {
  const qr = QRCode.create(contenido, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if ((data[row * size + col] & 1) === 1) {
        for (let sy = 0; sy < escalaModulo; sy++) {
          for (let sx = 0; sx < escalaModulo; sx++) {
            ponerPixel(lienzo, x + col * escalaModulo + sx, y + row * escalaModulo + sy);
          }
        }
      }
    }
  }
  return size * escalaModulo;
}

/** Dibuja un bitmap ya empacado a 1 bit/pixel (MSB primero) — usado para
 *  el logo estático. */
function dibujarBitmapEmpacado(lienzo, x, y, datos, anchoBytes, alto, anchoReal) {
  for (let fila = 0; fila < alto; fila++) {
    for (let col = 0; col < anchoReal; col++) {
      const bit = (datos[fila * anchoBytes + (col >> 3)] >> (7 - (col % 8))) & 1;
      if (bit) ponerPixel(lienzo, x + col, y + fila);
    }
  }
}

function dibujarLogo(lienzo, xCentro, y) {
  dibujarBitmapEmpacado(lienzo, Math.round(xCentro - LOGO_ANCHO / 2), y, obtenerLogo(), LOGO_ANCHO_BYTES, LOGO_ALTO, LOGO_ANCHO);
}

/** Centrado + ajuste de línea — el folio es siempre corto y nunca
 *  necesita envolver, pero el nombre (ej. "Roberto Hernandez") sí puede
 *  pasarse del ancho con la fuente 8×8 y se estaba recortando en
 *  silencio. Regresa la posición Y después de la última línea dibujada. */
function dibujarTextoCentradoConAjuste(lienzo, x, anchoDisponible, y, texto, escala, maxCaracteres) {
  const lineas = envolverTexto(texto, maxCaracteres);
  let cursorY = y;
  for (const linea of lineas) {
    dibujarTextoCentrado(lienzo, x, anchoDisponible, cursorY, linea, escala);
    cursorY += (FUENTE_GRANDE.filas + 1) * escala + 2;
  }
  return cursorY;
}

/** Empaca el lienzo a 1 bit por píxel, MSB primero, ancho redondeado al
 *  byte — el formato crudo que espera BITMAP en TSPL. */
export function empacarBitmap(lienzo) {
  const anchoBytes = Math.ceil(lienzo.ancho / 8);
  const datos = Buffer.alloc(anchoBytes * lienzo.alto);
  for (let y = 0; y < lienzo.alto; y++) {
    for (let x = 0; x < lienzo.ancho; x++) {
      // Esta impresora imprime tinta donde el bit es 0, no donde es 1 —
      // confirmado contra el hardware real (salía con los colores
      // invertidos: fondo negro, texto blanco, antes de este cambio).
      if (!lienzo.pixeles[y * lienzo.ancho + x]) {
        const indice = y * anchoBytes + (x >> 3);
        datos[indice] |= 1 << (7 - (x % 8));
      }
    }
  }
  return { anchoBytes, datos };
}

const MAX_CARACTERES_ITEM = Math.floor(ANCHO_UTIL / ((FUENTE_CHICA.cols + 1) * ESCALA_ITEM));
const ALTO_LINEA_ITEM = (FUENTE_CHICA.filas + 1) * ESCALA_ITEM + 5; // productos y hora de recolección
const ESCALA_CENTRADO = 2; // folio/nombre
const MAX_CARACTERES_CENTRADO = Math.floor(ANCHO_UTIL / ((FUENTE_GRANDE.cols + 1) * ESCALA_CENTRADO));

/** Arma el/los lienzo(s) de un pedido (uno por etiqueta física, 1/2, 2/2…
 *  si hay muchos productos) — la misma composición que se manda a
 *  imprimir, pero sin empacar ni mandar nada, para poder previsualizarla.
 *  Mismo orden que el diseño original en PDF: logo, QR, folio, nombre,
 *  productos, hora de recolección — todo centrado salvo la lista. */
const ALTO_LINEA_CENTRADA = (FUENTE_GRANDE.filas + 1) * ESCALA_CENTRADO + 2; // folio/nombre

export function construirLienzosEtiqueta(pedido) {
  const horaPickup = new Date(pedido.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const folio = pedido.folio || pedido.id.slice(0, 8);
  const nombre = nombreCorto(pedido);

  // El nombre (y, poquísimas veces, hasta el folio) pueden necesitar más
  // de una línea con esta fuente más ancha — el alto real del encabezado
  // varía según eso, así que la paginación de productos se calcula contra
  // el espacio que DE VERDAD queda, no contra un número fijo de líneas
  // (si no, con un nombre largo los productos se encimaban con "Pickup").
  const lineasFolio = envolverTexto(folio, MAX_CARACTERES_CENTRADO).length;
  const lineasNombre = envolverTexto(nombre, MAX_CARACTERES_CENTRADO).length;
  const lineasPickup = envolverTexto(`Pickup: ${horaPickup}`, MAX_CARACTERES_ITEM);
  const altoEncabezadoTexto = lineasFolio * ALTO_LINEA_CENTRADA + 4 + lineasNombre * ALTO_LINEA_CENTRADA + 8;
  const altoPickup = lineasPickup.length * ALTO_LINEA_ITEM + 8;

  const altoEncabezadoPrimera = 8 + LOGO_ALTO + 10 + 116 + 14 + altoEncabezadoTexto; // 116 ≈ tamaño típico del QR
  const altoEncabezadoOtras = 8 + 24 + altoEncabezadoTexto;
  const maxLineasPrimera = Math.max(1, Math.floor((ALTO_DOTS - altoEncabezadoPrimera - altoPickup) / ALTO_LINEA_ITEM));
  const maxLineasOtras = Math.max(1, Math.floor((ALTO_DOTS - altoEncabezadoOtras - altoPickup) / ALTO_LINEA_ITEM));

  const lineas = lineasDeItems(pedido.items).flatMap((linea) => envolverTexto(linea, MAX_CARACTERES_ITEM));
  const paginas = [];
  let resto = lineas;
  let primera = true;
  while (resto.length > 0 || paginas.length === 0) {
    const cupo = primera ? maxLineasPrimera : maxLineasOtras;
    paginas.push(resto.slice(0, cupo));
    resto = resto.slice(cupo);
    primera = false;
    if (paginas[paginas.length - 1].length === 0 && resto.length === 0) break;
  }
  const totalPaginas = paginas.length;

  return paginas.map((lineasPagina, i) => {
    const lienzo = crearLienzo(ANCHO_DOTS, ALTO_DOTS);
    const centroX = ANCHO_DOTS / 2;

    let y = 8;
    if (i === 0) {
      dibujarLogo(lienzo, centroX, y);
      y += LOGO_ALTO + 10;
      const tamanoQr = dibujarQr(lienzo, Math.round(centroX - 58), y, pedido.id, 4);
      y += tamanoQr + 14;
    } else {
      y += 24; // espaciador en páginas 2+, sin logo ni QR
    }

    // Esquina superior izquierda — el logo ocupa casi todo el ancho (solo
    // deja ~50dots de margen a cada lado), así que el indicador de página
    // va chico y pegado a la esquina para no encimarse con él.
    if (totalPaginas > 1) dibujarTexto(lienzo, 8, 4, `${i + 1}/${totalPaginas}`, 1, 44, FUENTE_CHICA);

    y = dibujarTextoCentradoConAjuste(lienzo, MARGEN_X, ANCHO_UTIL, y, folio, ESCALA_CENTRADO, MAX_CARACTERES_CENTRADO);
    y += 4;
    y = dibujarTextoCentradoConAjuste(lienzo, MARGEN_X, ANCHO_UTIL, y, nombre, ESCALA_CENTRADO, MAX_CARACTERES_CENTRADO);
    y += 8;

    for (const linea of lineasPagina) {
      dibujarTexto(lienzo, MARGEN_X, y, linea, ESCALA_ITEM, ANCHO_UTIL, FUENTE_CHICA);
      y += ALTO_LINEA_ITEM;
    }

    // Misma fuente que la lista — si no cabe en una línea, se envuelve
    // igual que los productos en vez de recortarse en silencio (ya pasó
    // una vez con el "p.m." cortado).
    let yPickup = ALTO_DOTS - 8 - lineasPickup.length * ALTO_LINEA_ITEM;
    for (const linea of lineasPickup) {
      dibujarTexto(lienzo, MARGEN_X, yPickup, linea, ESCALA_ITEM, ANCHO_UTIL, FUENTE_CHICA);
      yPickup += ALTO_LINEA_ITEM;
    }
    return lienzo;
  });
}

/** Un Buffer TSPL completo (comandos + bitmap binario) por cada etiqueta
 *  física — lo que de verdad se manda a imprimir. */
export function construirComandosTspl(pedido) {
  return construirLienzosEtiqueta(pedido).map((lienzo) => {
    const { anchoBytes, datos } = empacarBitmap(lienzo);
    const encabezado = Buffer.from(
      [
        "SIZE 40 mm,60 mm",
        "GAP 3 mm,0 mm",
        "SET RIBBON OFF",
        "DIRECTION 0,0",
        "REFERENCE 0,0",
        "OFFSET 0 mm",
        "SET PEEL OFF",
        "SET CUTTER OFF",
        "SET TEAR ON",
        "CLS",
        `BITMAP 0,0,${anchoBytes},${lienzo.alto},1,`,
      ].join("\r\n"),
      "ascii"
    );
    const pie = Buffer.from("\r\nPRINT 1,1\r\n", "ascii");
    return Buffer.concat([encabezado, datos, pie]);
  });
}
