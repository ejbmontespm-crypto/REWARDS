// Impresión directa por Bluetooth clásico (SPP) a una impresora de
// etiquetas TSPL — Xprinter XP-365B y compatibles. Separado por completo
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
      "DIRECTION 0",
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

/** Conecta, manda los comandos, desconecta — una conexión nueva por cada
 *  impresión en vez de mantenerla abierta, para no arrastrar un socket
 *  colgado entre un pedido y el siguiente (pueden pasar minutos/horas). */
export async function imprimirEtiquetaDirecto(pedido) {
  const config = await obtenerConfigImpresora();
  if (!config.direccion) throw new Error("No hay impresora configurada.");

  const bloques = construirComandosTspl(pedido);
  const yaConectado = await RNBluetoothClassic.isDeviceConnected(config.direccion);
  if (!yaConectado) await RNBluetoothClassic.connectToDevice(config.direccion);
  try {
    for (const bloque of bloques) {
      await RNBluetoothClassic.writeToDevice(config.direccion, bloque);
    }
  } finally {
    await RNBluetoothClassic.disconnectFromDevice(config.direccion).catch(() => {});
  }
}
