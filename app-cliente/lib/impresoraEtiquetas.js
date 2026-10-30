// Impresión directa por Bluetooth clásico (SPP) a una impresora de
// etiquetas TSPL — modelo real en uso: 4BARCODE 4B-2054D (vendida con la
// etiqueta genérica "OCBP-401DT").
//
// El renderizador de texto nativo (comando TEXT) de este firmware no
// dibuja glifos legibles con NINGÚN identificador de fuente probado — se
// confirmó capturando con "Imprimir a archivo" lo que manda el driver
// oficial de Windows (certificado por Seagull Scientific) para esta
// misma impresora: NUNCA usa TEXT/QRCODE/BARCODE nativos, dibuja TODO
// (texto y QR) como imágenes y las manda con el comando BITMAP. Acá se
// hace lo mismo: el texto se dibuja con una fuente de píxeles propia
// (5×7, la clásica de Adafruit_GFX, dominio público) y el QR con la
// matriz de módulos de la librería `qrcode`, todo compuesto en un solo
// bitmap de 1 bit por píxel y mandado con BITMAP.
//
// Secuencia de inicialización tomada tal cual del archivo .prn capturado
// del driver oficial para una etiqueta de 40×60mm — no inventada:
//   SIZE 40 mm,60 mm / GAP 3 mm,0 mm / SET RIBBON OFF / DIRECTION 0,0 /
//   REFERENCE 0,0 / OFFSET 0 mm / SET PEEL OFF / SET CUTTER OFF /
//   SET TEAR ON / CLS / BITMAP ... / PRINT 1,1
import AsyncStorage from "@react-native-async-storage/async-storage";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { Buffer } from "buffer";
import QRCode from "qrcode";

const CLAVE_CONFIG = "impresora_etiquetas_config";
const MAX_LINEAS_POR_PAGINA = 7;
const ANCHO_DOTS = 320; // 40mm × 8 dots/mm (203dpi)
const ALTO_DOTS = 480; // 60mm × 8 dots/mm

export async function obtenerConfigImpresora() {
  try {
    const raw = await AsyncStorage.getItem(CLAVE_CONFIG);
    return raw ? JSON.parse(raw) : { direccion: null, nombre: null, automatica: false };
  } catch {
    return { direccion: null, nombre: null, automatica: false };
  }
}

export async function guardarConfigImpresora(config) {
  await AsyncStorage.setItem(CLAVE_CONFIG, JSON.stringify(config));
}

export async function listarDispositivosEmparejados() {
  return RNBluetoothClassic.getBondedDevices();
}

function nombreCorto(pedido) {
  const primerNombre = (pedido.nombre || "").trim().split(/\s+/)[0] || "";
  return `${primerNombre} ${pedido.apellido_paterno || ""}`.trim();
}

function lineasDeItems(items) {
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
function crearLienzo(ancho, alto) {
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
function dibujarTexto(lienzo, x, y, texto, escala, anchoMaximo) {
  const limpio = normalizarParaFuente(texto);
  const anchoGlifo = (5 + 1) * escala; // 1 columna de espacio entre letras
  let cursorX = x;
  for (const ch of limpio) {
    if (anchoMaximo != null && cursorX + anchoGlifo > x + anchoMaximo) break;
    dibujarGlifo(lienzo, cursorX, y, ch.charCodeAt(0), escala);
    cursorX += anchoGlifo;
  }
}

function dibujarQr(lienzo, x, y, contenido, escalaModulo) {
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
function empacarBitmap(lienzo) {
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

/** Un Buffer TSPL completo (comandos + bitmap binario) por cada etiqueta
 *  física (1/2, 2/2…) — mismo criterio de paginación que la vista previa
 *  en PDF. */
export function construirComandosTspl(pedido) {
  const lineas = lineasDeItems(pedido.items);
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
    dibujarTexto(lienzo, 16, 180, folio, 3, ANCHO_DOTS - 32);
    dibujarTexto(lienzo, 16, 208, nombre, 3, ANCHO_DOTS - 32);
    if (totalPaginas > 1) dibujarTexto(lienzo, 260, 180, `${i + 1}/${totalPaginas}`, 2, 60);
    let y = 244;
    for (const linea of lineasPagina) {
      dibujarTexto(lienzo, 16, y, linea, 2, ANCHO_DOTS - 32);
      y += 22;
    }
    dibujarTexto(lienzo, 16, 440, `Pickup: ${horaPickup}`, 2, ANCHO_DOTS - 32);

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

/** Mantiene la conexión abierta entre una impresión y la siguiente, en vez
 *  de conectar/desconectar cada vez — hay impresoras TSPL baratas que no
 *  toleran bien reconexiones seguidas (algunas quedan en un estado raro y
 *  necesitan hasta reiniciarse para volver a aceptar conexión). Si la
 *  escritura falla (por ejemplo, porque la conexión se cayó sola mientras
 *  no se usaba), se reintenta UNA vez forzando una reconexión limpia. */
async function escribirBloques(direccion, bloques) {
  for (const bloque of bloques) {
    await RNBluetoothClassic.writeToDevice(direccion, bloque);
  }
}

async function enviarBloques(bloques) {
  const config = await obtenerConfigImpresora();
  if (!config.direccion) throw new Error("No hay impresora configurada.");

  const yaConectado = await RNBluetoothClassic.isDeviceConnected(config.direccion);
  if (!yaConectado) await RNBluetoothClassic.connectToDevice(config.direccion);

  try {
    await escribirBloques(config.direccion, bloques);
  } catch (err) {
    await RNBluetoothClassic.disconnectFromDevice(config.direccion).catch(() => {});
    await RNBluetoothClassic.connectToDevice(config.direccion);
    await escribirBloques(config.direccion, bloques);
  }
}

export async function imprimirEtiquetaDirecto(pedido) {
  await enviarBloques(construirComandosTspl(pedido));
}
