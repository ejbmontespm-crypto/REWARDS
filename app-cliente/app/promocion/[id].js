import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import { useCarrito } from "../../lib/contextoCarrito";
import { mostrarToast } from "../../lib/toast";

export default function DetallePromocion() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colores } = useTema();
  const { agregar } = useCarrito();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [promo, setPromo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/clientes/me")
      .then((me) => api.get("/promociones", { query: { perfil: me.cliente.tipo_perfil } }))
      .then((d) => {
        const encontrada = d.promociones.find((p) => p.id === id);
        if (!encontrada) throw new ApiError("Esta promoción ya no está disponible.", "no_encontrada", 404);
        setPromo(encontrada);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la promoción."))
      .finally(() => setCargando(false));
  }, [id]);

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <Pressable style={estilos.cerrar} onPress={() => router.back()}>
        <Text style={estilos.textoCerrar}>Cerrar</Text>
      </Pressable>

      {cargando ? (
        <View style={estilos.centro}>
          <ActivityIndicator color={colores.acento} />
        </View>
      ) : error ? (
        <View style={estilos.centro}>
          <Text style={estilos.error}>{error}</Text>
        </View>
      ) : (
        <View style={estilos.centro}>
          <Text style={estilos.titulo}>{promo.titulo}</Text>
          {promo.descripcion ? <Text style={estilos.descripcion}>{promo.descripcion}</Text> : null}
          {promo.tipo_archivo === "imagen" ? (
            <Image source={{ uri: promo.archivo_path }} style={estilos.imagen} resizeMode="contain" />
          ) : (
            <Pressable style={estilos.botonPdf} onPress={() => Linking.openURL(promo.archivo_path)}>
              <Text style={estilos.textoBotonPdf}>Ver PDF</Text>
            </Pressable>
          )}

          {promo.producto_id && promo.producto_disponible ? (
            <Pressable
              style={estilos.botonPedir}
              onPress={() => {
                agregar({
                  producto_id: promo.producto_id,
                  nombre: promo.titulo,
                  precio_unitario: Number(promo.producto_precio),
                  cantidad: 1,
                  extras: [],
                });
                mostrarToast(`✓ ${promo.titulo} agregado al carrito`);
                router.push("/carrito");
              }}
            >
              <Text style={estilos.textoBotonPdf}>Pedir esta promo — ${Number(promo.producto_precio).toFixed(0)}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 20 },
    cerrar: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
    textoCerrar: { color: colores.textoMuted, fontSize: 14, fontWeight: "500" },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
    error: { color: colores.peligro, fontSize: 14, textAlign: "center" },
    titulo: { fontSize: 19, fontWeight: "700", color: colores.texto, textAlign: "center" },
    descripcion: { fontSize: 13.5, color: colores.textoMuted, textAlign: "center", paddingHorizontal: 12 },
    imagen: { width: "100%", height: 320, borderRadius: 12 },
    botonPdf: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 30 },
    botonPedir: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 30, marginTop: 4 },
    textoBotonPdf: { color: "#fff", fontWeight: "600", fontSize: 14 },
  });
}
