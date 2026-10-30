// Impresión directa por Bluetooth clásico (SPP) a una impresora de
// etiquetas TSPL — modelo real en uso: OCBP-401DT (viene con código de
// páginas chino PC936/GB18030 de fábrica, ver CODEPAGE UTF-8 más abajo).
// Separado por completo
// de etiquetaPedido.js (que genera el PDF de vista previa/respaldo): acá
// se arman los comandos TSPL crudos, en texto plano, que se mandan tal
// cual al puerto serie del dispositivo ya emparejado.
//
// Posiciones en DOTS (203dpi ≈ 8 dots/mm, etiqueta 40×60mm ≈ 320×480 dots)
// — son un punto de partida razonable, pero CASI SEGURO van a necesitar
// ajuste fino una vez que se vea en la impresora real (ver Configurar
// impresora → Imprimir etiqueta de prueba). El logo no se incluye aquí
// todavía: TSPL solo imprime imágenes como bitmap monocromo (comando
// BITMAP), que requiere convertir el logo a 1-bit en el momento — se deja
// pendiente para cuando ya esté calibrado lo demás.
import AsyncStorage from "@react-native-async-storage/async-storage";
import RNBluetoothClassic from "react-native-bluetooth-classic";

const CLAVE_CONFIG = "impresora_etiquetas_config";
const MAX_LINEAS_POR_PAGINA = 7;

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

function tsplEscape(texto) {
  return String(texto).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

/** Un bloque de comandos TSPL por cada etiqueta física (1/2, 2/2…) —
 *  mismo criterio de paginación que la vista previa en PDF. */
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
    const comandos = [
      "SIZE 40 mm,60 mm",
      "GAP 2 mm,0 mm",
      // El QR salía nítido pero el texto se veía como barras negras sólidas
      // — con el cabezal sin velocidad/densidad fijas corría con el default
      // de fábrica. Velocidad y densidad tomadas de la etiqueta del
      // fabricante (OCBP-401DT: speed 5, density 8).
      "SPEED 5",
      "DENSITY 8",
      "DIRECTION 0",
      // Esta impresora trae de fábrica la página de códigos china PC936
      // (GB18030) — sin forzar UTF-8, el texto latino puede caer en la
      // tabla de fuente equivocada y salir como bloques negros en vez de
      // caracteres legibles (se ve el QR bien porque ese comando no pasa
      // por la tabla de fuentes de texto).
      "CODEPAGE UTF-8",
      "CLS",
    ];
    if (i === 0) comandos.push(`QRCODE 108,16,"M",4,"A",0,"${pedido.id}"`);
    comandos.push(`TEXT 16,180,"3",0,1,1,"${tsplEscape(folio)}"`);
    comandos.push(`TEXT 16,208,"3",0,1,1,"${tsplEscape(nombre)}"`);
    if (totalPaginas > 1) comandos.push(`TEXT 260,180,"2",0,1,1,"${i + 1}/${totalPaginas}"`);
    let y = 244;
    for (const linea of lineasPagina) {
      comandos.push(`TEXT 16,${y},"2",0,1,1,"${tsplEscape(linea)}"`);
      y += 22;
    }
    comandos.push(`TEXT 16,440,"2",0,1,1,"Pickup: ${tsplEscape(horaPickup)}"`);
    comandos.push("PRINT 1");
    return comandos.join("\r\n") + "\r\n";
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

/** SOLO diagnóstico: el texto real sale como bloques negros sólidos sin
 *  que cambie con CODEPAGE ni con SPEED/DENSITY — eso apunta a que el
 *  identificador de fuente ("2"/"3", el numérico estándar de TSC) no
 *  existe en este firmware clon y la impresora rellena la caja completa
 *  en vez de no dibujar nada. Esta etiqueta prueba varios identificadores
 *  de fuente a la vez (numéricos y nombres de fuente residente comunes en
 *  clones chinos) para ver cuál — si alguno — se imprime legible, en una
 *  sola pasada en vez de un build por cada intento. Bórrese cuando ya se
 *  sepa cuál fuente usar de verdad. */
export function construirComandosDiagnosticoFuentes() {
  const fuentes = ["1", "2", "3", "4", "TSS24.BF2", "ROMAN.TTF", "SIMPLIFIED.TTF"];
  const comandos = ["SIZE 40 mm,60 mm", "GAP 2 mm,0 mm", "SPEED 5", "DENSITY 8", "DIRECTION 0", "CODEPAGE UTF-8", "CLS"];
  let y = 16;
  for (const fuente of fuentes) {
    comandos.push(`TEXT 16,${y},"${fuente}",0,1,1,"${fuente}: ABC123"`);
    y += 40;
  }
  comandos.push("PRINT 1");
  return [comandos.join("\r\n") + "\r\n"];
}

export async function imprimirDiagnosticoFuentes() {
  await enviarBloques(construirComandosDiagnosticoFuentes());
}
