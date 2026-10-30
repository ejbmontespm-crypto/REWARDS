// Impresión directa por Bluetooth clásico (SPP) a una impresora de
// etiquetas TSPL — modelo real en uso: 4BARCODE 4B-2054D (vendida con la
// etiqueta genérica "OCBP-401DT").
//
// El renderizador de texto nativo (comando TEXT) de este firmware no
// dibuja glifos legibles con NINGÚN identificador de fuente probado — se
// confirmó capturando con "Imprimir a archivo" lo que manda el driver
// oficial de Windows (certificado por Seagull Scientific) para esta
// misma impresora: NUNCA usa TEXT/QRCODE/BARCODE nativos, dibuja TODO
// (texto y QR) como imágenes y las manda con el comando BITMAP. Por eso
// el dibujo del bitmap vive aparte, en etiquetaBitmap.js (sin
// dependencias nativas, para poder previsualizarlo en web/Node) — acá
// solo se resuelve CÓMO mandarlo por Bluetooth.
import AsyncStorage from "@react-native-async-storage/async-storage";
import RNBluetoothClassic from "react-native-bluetooth-classic";
import { construirComandosTspl } from "./etiquetaBitmap";

const CLAVE_CONFIG = "impresora_etiquetas_config";

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
