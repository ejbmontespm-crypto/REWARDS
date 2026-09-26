import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTema } from "../lib/contextoTema";

/**
 * Placeholder para pantallas cuya UI todavía no se construye porque falta
 * un endpoint propio del cliente en el backend (ver roadmap-construccion.md,
 * bloque 4) — evita dejar una ruta que truene al navegar a ella mientras se
 * arma el resto de la app pantalla por pantalla.
 */
export default function Proximamente({ titulo, nota }) {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {nota ? <Text style={estilos.nota}>{nota}</Text> : null}
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
    titulo: { fontSize: 17, fontWeight: "600", color: colores.texto },
    nota: { fontSize: 13, color: colores.textoMuted, textAlign: "center" },
  });
}
