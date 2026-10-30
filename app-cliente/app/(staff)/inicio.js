import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../lib/contextoSesion";
import { useTema } from "../../lib/contextoTema";

export default function Inicio() {
  const router = useRouter();
  const { sesion } = useSession();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const esAdmin = sesion?.rol === "admin";

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <Text style={estilos.saludo}>Hola, {sesion?.nombreUsuario}</Text>
      <Text style={estilos.rol}>{esAdmin ? "Admin" : "Staff"}</Text>

      <Pressable style={estilos.tarjeta} onPress={() => router.push("/staff-escanear")}>
        <Ionicons name="scan" size={22} color={colores.acento} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.tituloTarjeta}>Escanear</Text>
          <Text style={estilos.subTarjeta}>QR de cliente o de pedido</Text>
        </View>
        <Text style={estilos.flecha}>›</Text>
      </Pressable>

      <Pressable style={estilos.tarjeta} onPress={() => router.push("/cola")}>
        <Ionicons name="receipt" size={22} color={colores.acento} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.tituloTarjeta}>Cola de pedidos</Text>
          <Text style={estilos.subTarjeta}>Ver y avanzar pedidos activos</Text>
        </View>
        <Text style={estilos.flecha}>›</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 20, gap: 10 },
    saludo: { fontSize: 20, fontWeight: "700", color: colores.texto },
    rol: { fontSize: 13, color: colores.textoMuted, marginBottom: 14, textTransform: "capitalize" },
    tarjeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colores.superficie,
      borderWidth: 1,
      borderColor: colores.borde,
      borderRadius: 12,
      padding: 16,
    },
    tituloTarjeta: { fontSize: 14.5, fontWeight: "700", color: colores.texto },
    subTarjeta: { fontSize: 12, color: colores.textoMuted, marginTop: 2 },
    flecha: { fontSize: 18, color: colores.textoMuted },
  });
}
