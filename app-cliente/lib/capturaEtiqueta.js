// Camino alterno (experimental) para imprimir con nitidez real: en vez
// de dibujar cada letra con una fuente de píxeles propia (ver
// etiquetaBitmap.js), se renderiza la etiqueta con componentes nativos de
// React Native (fuentes del sistema, con antialiasing real), se
// "fotografía" ese render con react-native-view-shot, y esa imagen ya
// capturada se decodifica, se convierte a 1 bit por píxel y se manda por
// el mismo camino de siempre (BITMAP por TSPL). Nada de esto toca el
// transporte Bluetooth — ver impresoraEtiquetas.js.
import { Buffer } from "buffer";
import UPNG from "upng-js";
import { captureRef } from "react-native-view-shot";
import { crearLienzo, empacarBitmap, envolverBitmapEnTspl } from "./etiquetaBitmap";

const UMBRAL = 150; // luminancia < umbral = negro (tinta), >= umbral = blanco

/** Decodifica un PNG en base64 (lo que regresa captureRef) a un lienzo de
 *  1 bit por píxel — compone la transparencia sobre blanco antes de
 *  binarizar, para que un logo con fondo transparente no salga negro. */
export function lienzoDesdeBase64Png(base64Png) {
  const bytes = Buffer.from(base64Png, "base64");
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const img = UPNG.decode(arrayBuffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const { width, height } = img;

  const lienzo = crearLienzo(width, height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3] / 255;
    const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
    lienzo.pixeles[i] = luminancia < UMBRAL ? 1 : 0;
  }
  return lienzo;
}

/** Captura el componente apuntado por `ref` (ya montado y con layout
 *  listo) a `anchoDots`×`altoDots` de salida, y regresa el Buffer TSPL
 *  completo, listo para mandar por Bluetooth. */
export async function capturarYEmpacarEtiqueta(ref, anchoDots, altoDots) {
  const base64Png = await captureRef(ref, { result: "base64", format: "png", width: anchoDots, height: altoDots });
  const lienzo = lienzoDesdeBase64Png(base64Png);
  const { anchoBytes, datos } = empacarBitmap(lienzo);
  return envolverBitmapEnTspl(anchoBytes, lienzo.alto, datos);
}
