// Dibuja el lienzo de 1 bit por píxel de una etiqueta (ver
// lib/etiquetaBitmap.js) como SVG — un <Rect> por cada corrida horizontal
// de píxeles encendidos en vez de uno por píxel (320×480 = 153,600 sería
// demasiado), así se ve exactamente lo que se va a imprimir sin tener que
// decodificar ninguna imagen ni agregar una librería nueva.
import { Svg, Rect } from "react-native-svg";

function filasARects(lienzo) {
  const rects = [];
  for (let y = 0; y < lienzo.alto; y++) {
    let inicioRun = -1;
    for (let x = 0; x <= lienzo.ancho; x++) {
      const encendido = x < lienzo.ancho && lienzo.pixeles[y * lienzo.ancho + x];
      if (encendido && inicioRun === -1) {
        inicioRun = x;
      } else if (!encendido && inicioRun !== -1) {
        rects.push({ x: inicioRun, y, ancho: x - inicioRun });
        inicioRun = -1;
      }
    }
  }
  return rects;
}

export default function VistaPreviaEtiqueta({ lienzo, anchoVisible = 200 }) {
  const escala = anchoVisible / lienzo.ancho;
  const altoVisible = Math.round(lienzo.alto * escala);
  const rects = filasARects(lienzo);

  return (
    <Svg width={anchoVisible} height={altoVisible} viewBox={`0 0 ${lienzo.ancho} ${lienzo.alto}`}>
      <Rect x={0} y={0} width={lienzo.ancho} height={lienzo.alto} fill="#ffffff" />
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.ancho} height={1} fill="#000000" />
      ))}
    </Svg>
  );
}
