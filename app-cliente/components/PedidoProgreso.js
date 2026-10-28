import { View, Text, Image, StyleSheet } from "react-native";
import { useTema } from "../lib/contextoTema";

export const PASOS_PEDIDO = ["recibido", "preparando", "listo", "entregado"];
export const ETIQUETA_PASO_PEDIDO = {
  pendiente_pago: "Esperando pago",
  recibido: "Recibido",
  preparando: "Preparando",
  listo: "Listo",
  entregado: "Entregado",
};

/**
 * Línea de tiempo del pedido con tazas (vacía = paso pendiente, llena = paso
 * cumplido) — compartida entre Inicio (tarjeta de "Pedido en curso") y el
 * detalle del pedido, para no duplicar la lógica en dos pantallas. Si no
 * hay tazas subidas en Apariencia, cae a puntos de color (mismo criterio
 * que el resto de la app cuando falta un asset configurable).
 */
export default function PedidoProgreso({ estado, tamanoTaza = 34 }) {
  const { colores, tazaVaciaUrl, tazaLlenaUrl } = useTema();
  const estilos = crearEstilos(colores);
  const pasoActual = PASOS_PEDIDO.indexOf(estado);
  if (pasoActual === -1) return null; // cancelado / no_recogido — el llamador decide qué mostrar en su lugar

  return (
    <View style={estilos.linea}>
      {PASOS_PEDIDO.map((paso, i) => (
        <View key={paso} style={estilos.pasoContenedor}>
          {tazaVaciaUrl && tazaLlenaUrl ? (
            <Image
              source={{ uri: i <= pasoActual ? tazaLlenaUrl : tazaVaciaUrl }}
              style={{ width: tamanoTaza, height: tamanoTaza }}
              resizeMode="contain"
            />
          ) : (
            <View style={[estilos.punto, i <= pasoActual && estilos.puntoActivo]} />
          )}
          <Text style={[estilos.etiquetaPaso, i <= pasoActual && estilos.etiquetaPasoActiva]}>{ETIQUETA_PASO_PEDIDO[paso]}</Text>
        </View>
      ))}
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    linea: { flexDirection: "row", justifyContent: "space-between" },
    pasoContenedor: { alignItems: "center", flex: 1, gap: 6 },
    punto: { width: 14, height: 14, borderRadius: 7, backgroundColor: colores.borde },
    puntoActivo: { backgroundColor: colores.acento },
    etiquetaPaso: { fontSize: 11, color: colores.textoMuted, textAlign: "center" },
    etiquetaPasoActiva: { color: colores.texto, fontWeight: "600" },
  });
}
