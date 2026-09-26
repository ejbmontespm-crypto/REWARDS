import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTema } from "../../lib/contextoTema";
import { obtenerNotificacionesStaff, marcarLeidasStaff } from "../../lib/bandejaStaff";

export default function NotificacionesStaff() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [notificaciones, setNotificaciones] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      obtenerNotificacionesStaff().then((lista) => {
        if (!vivo) return;
        setNotificaciones(lista);
        marcarLeidasStaff(); // se ven al abrir esta pestaña — se apaga el badge
      });
      return () => {
        vivo = false;
      };
    }, [])
  );

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <FlatList
        data={notificaciones}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={<Text style={estilos.vacio}>Sin notificaciones todavía — aquí aparecen los pedidos nuevos según van llegando.</Text>}
        renderItem={({ item }) => (
          <View style={estilos.tarjeta}>
            <Text style={estilos.texto}>{item.texto}</Text>
            <Text style={estilos.fecha}>{new Date(item.fecha).toLocaleString("es-MX")}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    vacio: { textAlign: "center", color: colores.textoMuted, marginTop: 30, paddingHorizontal: 20 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, padding: 14, gap: 4 },
    texto: { fontSize: 13.5, color: colores.texto, lineHeight: 19 },
    fecha: { fontSize: 11.5, color: colores.textoMuted },
  });
}
