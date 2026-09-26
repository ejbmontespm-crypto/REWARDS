import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";

export default function Promociones() {
  const router = useRouter();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [promociones, setPromociones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      api
        .get("/clientes/me")
        .then((me) => api.get("/promociones", { query: { perfil: me.cliente.tipo_perfil } }))
        .then((d) => vivo && setPromociones(d.promociones))
        .catch((err) => vivo && setError(err instanceof ApiError ? err.message : "No se pudieron cargar las promociones."))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [])
  );

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {!error && promociones.length === 0 ? <Text style={estilos.vacio}>No hay promociones activas por ahora.</Text> : null}

      {promociones.map((p) => (
        <Pressable key={p.id} style={estilos.tarjeta} onPress={() => router.push(`/promocion/${p.id}`)}>
          {p.tipo_archivo === "imagen" ? (
            <Image source={{ uri: p.archivo_path }} style={estilos.miniatura} resizeMode="cover" />
          ) : (
            <View style={[estilos.miniatura, estilos.miniaturaPdf]}>
              <Text style={estilos.textoPdf}>PDF</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={estilos.titulo}>{p.titulo}</Text>
            {p.descripcion ? (
              <Text style={estilos.descripcion} numberOfLines={2}>
                {p.descripcion}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    error: { color: colores.peligro, fontSize: 13 },
    vacio: { textAlign: "center", color: colores.textoMuted, marginTop: 30 },
    tarjeta: { flexDirection: "row", gap: 12, backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 12, alignItems: "center" },
    miniatura: { width: 56, height: 56, borderRadius: 8, backgroundColor: colores.fondo },
    miniaturaPdf: { alignItems: "center", justifyContent: "center" },
    textoPdf: { fontSize: 11, fontWeight: "700", color: colores.acento },
    titulo: { fontSize: 14.5, fontWeight: "600", color: colores.texto },
    descripcion: { fontSize: 12, color: colores.textoMuted, marginTop: 2 },
  });
}
