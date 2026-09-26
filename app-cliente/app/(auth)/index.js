import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTema } from "../../lib/contextoTema";
import Logo from "../../components/Logo";

export default function Bienvenida() {
  const router = useRouter();
  const { colores, logoUrl } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <View style={estilos.centro}>
        <Logo url={logoUrl} width={220} style={estilos.logo} />
        <Text style={estilos.titulo}>Lealtad Café</Text>
        <Text style={estilos.subtitulo}>
          Acumula con cada compra en la cafetería y canjea recompensas — todo desde tu celular.
        </Text>
      </View>

      <View style={estilos.botones}>
        <Pressable style={estilos.botonPrimario} onPress={() => router.push("/(auth)/registro")}>
          <Text style={estilos.textoBotonPrimario}>Crear cuenta</Text>
        </Pressable>
        <Pressable style={estilos.botonSecundario} onPress={() => router.push("/(auth)/login")}>
          <Text style={estilos.textoBotonSecundario}>Ya tengo cuenta</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(auth)/staff-login")}>
          <Text style={estilos.linkStaff}>¿Eres staff? Entra aquí</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 24, justifyContent: "space-between" },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    logo: { marginBottom: 6 },
    titulo: { fontSize: 26, fontWeight: "700", color: colores.texto },
    subtitulo: { fontSize: 14, color: colores.textoMuted, textAlign: "center", lineHeight: 20, paddingHorizontal: 12 },
    botones: { gap: 10, paddingBottom: 12 },
    botonPrimario: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 15, alignItems: "center" },
    textoBotonPrimario: { color: "#fff", fontWeight: "600", fontSize: 15 },
    botonSecundario: { borderWidth: 1, borderColor: colores.borde, borderRadius: 10, paddingVertical: 15, alignItems: "center" },
    textoBotonSecundario: { color: colores.texto, fontWeight: "600", fontSize: 15 },
    linkStaff: { textAlign: "center", color: colores.textoMuted, fontSize: 12.5, marginTop: 14 },
  });
}
