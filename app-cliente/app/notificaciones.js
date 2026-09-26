import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "../lib/api";
import { useTema } from "../lib/contextoTema";

// notificaciones_log es un log de entrega (canal/tipo/estado), no guarda el
// asunto/texto real que se mandó — se traduce el tipo a algo legible aquí.
const TEXTO_TIPO = {
  promocion_nueva: "Hay una nueva promoción disponible.",
  recompensa_disponible: "¡Tienes una recompensa lista para redimir!",
  pedido_listo: "Tu pedido está listo para recoger.",
  vencimiento_puntos: "Tus créditos están por vencer.",
  vencimiento_ciclo: "Tu ciclo de confirmación está por vencer.",
  confirmacion_cuenta: "Confirma tu cuenta para seguir acumulando.",
  otro: "Tienes un aviso nuevo.",
};

export default function Notificaciones() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      api
        .get("/notificaciones/mias")
        .then((d) => vivo && setNotificaciones(d.notificaciones))
        .catch((err) => vivo && setError(err instanceof ApiError ? err.message : "No se pudieron cargar tus notificaciones."))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [])
  );

  async function marcarLeida(n) {
    if (n.leido_en) return;
    setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leido_en: new Date().toISOString() } : x)));
    try {
      await api.patch(`/notificaciones/${n.id}/leido`);
    } catch {
      /* si falla, se queda marcada como leída en pantalla — no vale la pena molestar por esto */
    }
  }

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  return (
    <View style={estilos.contenedor}>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      <FlatList
        data={notificaciones}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        ListEmptyComponent={!error ? <Text style={estilos.vacio}>Sin notificaciones todavía.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={[estilos.tarjeta, !item.leido_en && estilos.tarjetaNoLeida]} onPress={() => marcarLeida(item)}>
            {!item.leido_en ? <View style={estilos.puntoNuevo} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={estilos.texto}>{TEXTO_TIPO[item.tipo] || TEXTO_TIPO.otro}</Text>
              <Text style={estilos.fecha}>{new Date(item.created_at).toLocaleString("es-MX")}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    error: { color: colores.peligro, fontSize: 13, padding: 16 },
    vacio: { textAlign: "center", color: colores.textoMuted, marginTop: 30 },
    tarjeta: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colores.superficie,
      borderWidth: 1,
      borderColor: colores.borde,
      borderRadius: 10,
      padding: 14,
    },
    tarjetaNoLeida: { borderColor: colores.acento },
    puntoNuevo: { width: 8, height: 8, borderRadius: 4, backgroundColor: colores.acento, marginTop: 5 },
    texto: { fontSize: 13.5, color: colores.texto, lineHeight: 19 },
    fecha: { fontSize: 11.5, color: colores.textoMuted, marginTop: 4 },
  });
}
