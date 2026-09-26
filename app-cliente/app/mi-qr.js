import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import * as ScreenCapture from "expo-screen-capture";
import { api, ApiError } from "../lib/api";
import { useTema } from "../lib/contextoTema";
import Logo from "../components/Logo";

const REFRESCO_MS = 40000; // TTL real del token en el backend es 45s (lib/qrToken.js)

export default function MiQr() {
  const router = useRouter();
  const { colores, logoUrl } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [token, setToken] = useState(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const temporizador = useRef(null);

  const pedirToken = useCallback(async () => {
    try {
      const { token: nuevo } = await api.get("/clientes/me/qr-token");
      setToken(nuevo);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar tu QR.");
    }
  }, []);

  // expo-screen-capture no existe en web (solo nativo) — todo este bloque
  // se salta ahí. Android: bloquea capturas/grabación mientras la pantalla
  // está montada. iOS no permite bloquear screenshots a nivel de
  // plataforma — por eso se detecta y se refresca el token de inmediato
  // en cuanto se toma una (fase3 §5).
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenCapture.preventScreenCaptureAsync();
    const suscripcion = ScreenCapture.addScreenshotListener(() => pedirToken());
    return () => {
      ScreenCapture.allowScreenCaptureAsync();
      suscripcion.remove();
    };
  }, [pedirToken]);

  useEffect(() => {
    api
      .get("/clientes/me")
      .then((d) => setNombre(`${d.cliente.nombre} ${d.cliente.apellido_paterno}`))
      .catch(() => {});

    pedirToken();
    temporizador.current = setInterval(pedirToken, REFRESCO_MS);
    return () => clearInterval(temporizador.current);
  }, [pedirToken]);

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <Pressable style={estilos.cerrar} onPress={() => router.back()}>
        <Text style={estilos.textoCerrar}>Cerrar</Text>
      </Pressable>

      <View style={estilos.centro}>
        <Logo url={logoUrl} width={220} style={estilos.logoArriba} />
        {error ? (
          <Text style={estilos.error}>{error}</Text>
        ) : token ? (
          <View style={estilos.tarjetaQr}>
            <QRCode value={token} size={240} />
          </View>
        ) : (
          <ActivityIndicator color={colores.acento} size="large" />
        )}
        {nombre ? <Text style={estilos.nombre}>{nombre}</Text> : null}
        <Text style={estilos.nota}>Muéstrale esta pantalla al staff en caja.</Text>
      </View>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 20 },
    cerrar: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
    textoCerrar: { color: colores.textoMuted, fontSize: 14, fontWeight: "500" },
    centro: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: 20, gap: 18 },
    logoArriba: { marginBottom: 0 },
    tarjetaQr: { backgroundColor: "#fff", padding: 20, borderRadius: 16, elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10 },
    nombre: { fontSize: 17, fontWeight: "600", color: colores.texto },
    nota: { fontSize: 12.5, color: colores.textoMuted },
    error: { color: colores.peligro, fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  });
}
