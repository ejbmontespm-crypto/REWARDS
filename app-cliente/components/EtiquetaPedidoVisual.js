// Etiqueta armada con componentes nativos de React Native (fuentes del
// sistema, con antialiasing real) — pensada para "fotografiarse" con
// react-native-view-shot y mandarse como imagen, en vez de dibujarse
// píxel por píxel (ver lib/etiquetaBitmap.js, el camino que ya funciona
// pero se ve más tosco). Mismo orden que el diseño original: logo, QR,
// folio, nombre, productos, hora de recolección.
import { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";

// 40×60mm a una densidad cómoda para capturar (2 dots por "pixel" de
// diseño) — captureRef reescala al pedir 320×480 de salida real.
export const ANCHO_DP = 160;
export const ALTO_DP = 240;

function nombreCorto(pedido) {
  const primerNombre = (pedido.nombre || "").trim().split(/\s+/)[0] || "";
  return `${primerNombre} ${pedido.apellido_paterno || ""}`.trim();
}

function lineasDeItems(items) {
  return (items || []).flatMap((item) => {
    const base = `${item.cantidad}× ${item.producto_nombre}`;
    const extras = item.extras?.length ? item.extras.map((e) => e.extra_nombre).join(", ") : null;
    return extras ? [base, `  + ${extras}`] : [base];
  });
}

const EtiquetaPedidoVisual = forwardRef(function EtiquetaPedidoVisual({ pedido, logoUrl }, ref) {
  const horaPickup = new Date(pedido.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const folio = pedido.folio || pedido.id.slice(0, 8);
  const nombre = nombreCorto(pedido);
  const lineas = lineasDeItems(pedido.items);

  return (
    <View ref={ref} collapsable={false} style={estilos.contenedor}>
      {logoUrl ? <Image source={{ uri: logoUrl }} style={estilos.logo} resizeMode="contain" /> : null}
      <QRCode value={pedido.id} size={60} />
      <Text style={estilos.folio}>{folio}</Text>
      <Text style={estilos.nombre}>{nombre}</Text>
      <View style={estilos.items}>
        {lineas.map((linea, i) => (
          <Text key={i} style={estilos.item}>
            {linea}
          </Text>
        ))}
      </View>
      <Text style={estilos.hora}>Pickup: {horaPickup}</Text>
    </View>
  );
});

const estilos = StyleSheet.create({
  contenedor: {
    width: ANCHO_DP,
    height: ALTO_DP,
    backgroundColor: "#ffffff",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 3,
  },
  logo: { width: 90, height: 30, marginBottom: 2 },
  folio: { fontSize: 11, fontWeight: "700", color: "#000" },
  nombre: { fontSize: 12, fontWeight: "700", color: "#000", textAlign: "center" },
  items: { width: "100%", marginTop: 3 },
  item: { fontSize: 8.5, lineHeight: 10.5, color: "#000" },
  hora: { fontSize: 8.5, color: "#444", marginTop: "auto" },
});

export default EtiquetaPedidoVisual;
