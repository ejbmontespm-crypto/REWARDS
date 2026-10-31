// Modal de confirmación con vista previa real antes de imprimir — se
// arma el mismo lienzo que se manda a la impresora (lib/etiquetaBitmap.js)
// y se dibuja como SVG, para que quien imprime vea exactamente lo que va
// a salir antes de gastar la etiqueta física.
import { useMemo } from "react";
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { construirLienzosEtiqueta } from "../lib/etiquetaBitmap";
import VistaPreviaEtiqueta from "./VistaPreviaEtiqueta";

const COLORES_DEFECTO = { superficie: "#fff", texto: "#201e1a", textoMuted: "#726c60", acento: "#c0392b", borde: "#e6e2db" };

export default function ModalVistaPreviaEtiqueta({ visible, pedido, colores, imprimiendo, onConfirmar, onCancelar }) {
  const c = colores || COLORES_DEFECTO;
  const estilos = useMemo(() => crearEstilos(c), [c]);
  const lienzos = useMemo(() => (visible && pedido ? construirLienzosEtiqueta(pedido) : []), [visible, pedido]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancelar}>
      <View style={estilos.overlay}>
        <View style={estilos.hoja}>
          <Text style={estilos.titulo}>Vista previa de la etiqueta</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
            {lienzos.map((lienzo, i) => (
              <View key={i} style={estilos.marco}>
                <VistaPreviaEtiqueta lienzo={lienzo} anchoVisible={200} />
              </View>
            ))}
          </ScrollView>
          {lienzos.length > 1 ? <Text style={estilos.nota}>{lienzos.length} etiquetas — se imprimen todas en orden.</Text> : null}
          <View style={estilos.botones}>
            <Pressable style={estilos.botonCancelar} onPress={onCancelar} disabled={imprimiendo}>
              <Text style={estilos.textoCancelar}>Cancelar</Text>
            </Pressable>
            <Pressable style={estilos.botonImprimir} onPress={onConfirmar} disabled={imprimiendo}>
              {imprimiendo ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoImprimir}>Imprimir</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(32,30,26,0.45)", justifyContent: "center", padding: 24 },
    hoja: { backgroundColor: colores.superficie, borderRadius: 14, padding: 18, gap: 12 },
    titulo: { fontSize: 15, fontWeight: "700", color: colores.texto },
    marco: { borderWidth: 1, borderColor: colores.borde, borderRadius: 8, padding: 6, backgroundColor: "#fff" },
    nota: { fontSize: 11.5, color: colores.textoMuted },
    botones: { flexDirection: "row", gap: 10, marginTop: 4 },
    botonCancelar: { flex: 1, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
    textoCancelar: { color: colores.texto, fontWeight: "600", fontSize: 13.5 },
    botonImprimir: { flex: 1, backgroundColor: colores.acento, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
    textoImprimir: { color: "#fff", fontWeight: "700", fontSize: 13.5 },
  });
}
