import { useEffect, useState } from "react";
import { View, Image } from "react-native";
import { SvgXml } from "react-native-svg";

function aspectoDesdeSvg(xml) {
  const m = xml.match(/viewBox=["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+([\d.\-]+)/);
  return m ? Number(m[1]) / Number(m[2]) : 1;
}

/**
 * <Image> de React Native no sabe pintar SVG en nativo (solo en web, vía
 * <img> del navegador) — se detecta y se resuelve con SvgXml (react-native-svg)
 * en vez de Image cuando aplica.
 *
 * El logo real (`lealtad_cafe_logo.png`, subido desde Apariencia) es un
 * PNG ANCHO (ícono + wordmark, no 1:1) — a diferencia de la versión
 * anterior, este componente ya NO fuerza un recorte cuadrado/circular:
 * mide el tamaño real de la imagen (`Image.getSize`) y arma un contenedor
 * con el mismo aspecto, para mostrarla completa sin distorsión ni recorte.
 */
export default function Logo({ url, width = 160, style }) {
  const [aspecto, setAspecto] = useState(1);
  const [xml, setXml] = useState(null);
  const esSvg = /\.svg(\?|$)/i.test(url || "");

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    if (esSvg) {
      fetch(url)
        .then((r) => r.text())
        .then((texto) => {
          if (!vivo) return;
          setXml(texto);
          setAspecto(aspectoDesdeSvg(texto));
        })
        .catch(() => {});
    } else {
      Image.getSize(
        url,
        (w, h) => vivo && setAspecto(w / h),
        () => {}
      );
    }
    return () => {
      vivo = false;
    };
  }, [url, esSvg]);

  if (!url) return null;
  if (esSvg && !xml) return null;

  const height = width / aspecto;
  return (
    <View style={[{ width, height }, style]}>
      {esSvg ? <SvgXml xml={xml} width={width} height={height} /> : <Image source={{ uri: url }} style={{ width, height }} resizeMode="contain" />}
    </View>
  );
}
