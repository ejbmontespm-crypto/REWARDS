// Dibujo puro del bitmap de la etiqueta — texto (fuente de píxeles 5×7
// propia, dominio público) y QR (matriz de módulos de `qrcode`),
// compuestos en un lienzo de 1 bit por píxel. Sin dependencias nativas a
// propósito: así se puede previsualizar en web/Node antes de gastar un
// build, y lo único que cambia al imprimir de verdad es quién manda los
// bytes (ver impresoraEtiquetas.js).
import { Buffer } from "buffer";
import QRCode from "qrcode";

export const ANCHO_DOTS = 320; // 40mm × 8 dots/mm (203dpi)
export const ALTO_DOTS = 480; // 60mm × 8 dots/mm
export const MAX_LINEAS_POR_PAGINA = 7;

const MARGEN_X = 16;
const ANCHO_UTIL = ANCHO_DOTS - MARGEN_X * 2;
const ESCALA_ITEM = 2;
const MAX_CARACTERES_ITEM = Math.floor(ANCHO_UTIL / ((5 + 1) * ESCALA_ITEM));

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
// Fuente de píxeles 5×7 (ASCII 0x20–0x7E) — la clásica de Adafruit_GFX,
// de dominio público. 5 bytes por carácter (una columna por byte, bit 0
// = fila de arriba). Va en base64 solo para que no ocupe 95 líneas acá.
// ---------------------------------------------------------------------
const FUENTE_5X7_B64 =
  "AAAAAAAAAF8AAAAHAAcAFH8UfxQkKn8qEiMTCGRiNklWIFAACAcDAAAcIkEAAEEiHAAqHH8cKggIPggIAIBwMAAICAgICAAAYGAAIBAIBAI+UUlFPgBCf0AAcklJSUYhQUlNMxgUEn8QJ0VFRTk8SklJMUEhEQkHNklJSTZGSUkpHgAAFAAAAEA0AAAACBQiQRQUFBQUAEEiFAgCAVkJBj5BXVlOfBIREnx/SUlJNj5BQUEif0FBQT5/SUlJQX8JCQkBPkFBUXN/CAgIfwBBf0EAIEBBPwF/CBQiQX9AQEBAfwIcAn9/BAgQfz5BQUE+fwkJCQY+QVEhXn8JGSlGJklJSTIDAX8BAz9AQEA/HyBAIB8/QDhAP2MUCBRjAwR4BANhWUlNQwB/QUFBAgQIECAAQUFBfwQCAQIEQEBAQEAAAwcIACBUVHhAfyhERDg4REREKDhERCh/OFRUVBgACH4JAhikpJx4fwgEBHgARH1AACBAQD0AfxAoRAAAQX9AAHwEeAR4fAgEBHg4REREOPwYJCQYGCQkGPx8CAQECEhUVFQkBAQ/RCQ8QEAgfBwgQCAcPEAwQDxEKBAoREyQkJB8RGRUTEQACDZBAAAAdwAAAEE2CAACAQIEAg==";
let FUENTE_5X7 = null;
function obtenerFuente() {
  if (!FUENTE_5X7) FUENTE_5X7 = Buffer.from(FUENTE_5X7_B64, "base64");
  return FUENTE_5X7;
}

/** El texto en los pedidos puede traer acentos/ñ que la fuente 5×7
 *  (solo ASCII 0x20–0x7E) no tiene — se normaliza quitando diacríticos
 *  en vez de dejar un hueco/signo de interrogación por cada letra. */
function normalizarParaFuente(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7e]/g, "?");
}

// ---------------------------------------------------------------------
// Lienzo de 1 bit por píxel — se dibuja todo acá (texto y QR) y al final
// se empaca en los bytes que espera el comando BITMAP de TSPL.
// ---------------------------------------------------------------------
export function crearLienzo(ancho, alto) {
  return { ancho, alto, pixeles: new Uint8Array(ancho * alto) };
}

function ponerPixel(lienzo, x, y) {
  if (x < 0 || x >= lienzo.ancho || y < 0 || y >= lienzo.alto) return;
  lienzo.pixeles[y * lienzo.ancho + x] = 1;
}

function dibujarGlifo(lienzo, x, y, codigo, escala) {
  if (codigo < 0x20 || codigo > 0x7e) return;
  const fuente = obtenerFuente();
  const offset = (codigo - 0x20) * 5;
  for (let col = 0; col < 5; col++) {
    const columna = fuente[offset + col];
    for (let fila = 0; fila < 7; fila++) {
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

/** Dibuja texto de izquierda a derecha; recorta si se pasa del ancho
 *  disponible en vez de desbordarse fuera de la etiqueta. */
export function dibujarTexto(lienzo, x, y, texto, escala, anchoMaximo) {
  const limpio = normalizarParaFuente(texto);
  const anchoGlifo = (5 + 1) * escala; // 1 columna de espacio entre letras
  let cursorX = x;
  for (const ch of limpio) {
    if (anchoMaximo != null && cursorX + anchoGlifo > x + anchoMaximo) break;
    dibujarGlifo(lienzo, cursorX, y, ch.charCodeAt(0), escala);
    cursorX += anchoGlifo;
  }
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
}

/** Empaca el lienzo a 1 bit por píxel, MSB primero, ancho redondeado al
 *  byte — el formato crudo que espera BITMAP en TSPL. */
export function empacarBitmap(lienzo) {
  const anchoBytes = Math.ceil(lienzo.ancho / 8);
  const datos = Buffer.alloc(anchoBytes * lienzo.alto);
  for (let y = 0; y < lienzo.alto; y++) {
    for (let x = 0; x < lienzo.ancho; x++) {
      if (lienzo.pixeles[y * lienzo.ancho + x]) {
        const indice = y * anchoBytes + (x >> 3);
        datos[indice] |= 1 << (7 - (x % 8));
      }
    }
  }
  return { anchoBytes, datos };
}

/** Arma el/los lienzo(s) de un pedido (uno por etiqueta física, 1/2, 2/2…
 *  si hay muchos productos) — la misma composición que se manda a
 *  imprimir, pero sin empacar ni mandar nada, para poder previsualizarla. */
export function construirLienzosEtiqueta(pedido) {
  const lineas = lineasDeItems(pedido.items).flatMap((linea) => envolverTexto(linea, MAX_CARACTERES_ITEM));
  const paginas = [];
  for (let i = 0; i < lineas.length; i += MAX_LINEAS_POR_PAGINA) {
    paginas.push(lineas.slice(i, i + MAX_LINEAS_POR_PAGINA));
  }
  if (paginas.length === 0) paginas.push([]);
  const totalPaginas = paginas.length;

  const horaPickup = new Date(pedido.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const folio = pedido.folio || pedido.id.slice(0, 8);
  const nombre = nombreCorto(pedido);

  return paginas.map((lineasPagina, i) => {
    const lienzo = crearLienzo(ANCHO_DOTS, ALTO_DOTS);
    if (i === 0) dibujarQr(lienzo, 108, 16, pedido.id, 4);
    dibujarTexto(lienzo, MARGEN_X, 180, folio, 3, ANCHO_UTIL);
    dibujarTexto(lienzo, MARGEN_X, 208, nombre, 3, ANCHO_UTIL);
    if (totalPaginas > 1) dibujarTexto(lienzo, 260, 180, `${i + 1}/${totalPaginas}`, 2, 60);
    let y = 244;
    for (const linea of lineasPagina) {
      dibujarTexto(lienzo, MARGEN_X, y, linea, ESCALA_ITEM, ANCHO_UTIL);
      y += 22;
    }
    dibujarTexto(lienzo, MARGEN_X, 440, `Pickup: ${horaPickup}`, ESCALA_ITEM, ANCHO_UTIL);
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
