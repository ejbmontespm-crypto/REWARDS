import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import ResultadoCliente from "../../components/ResultadoCliente";

export default function Escanear() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [permission, requestPermission] = useCameraPermissions();
  const [config, setConfig] = useState(null);
  const [escaneando, setEscaneando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/configuracion-recompensa/activa")
      .then((d) => setConfig(d.configuracion))
      .catch(() => {});
  }, []);

  const onScan = useCallback(
    async ({ data }) => {
      if (!escaneando) return;
      setEscaneando(false);
      setCargando(true);
      setError("");
      try {
        const r = await api.get(`/staff/escaneo/${encodeURIComponent(data)}`);
        setResultado(r);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo leer este código.");
      } finally {
        setCargando(false);
      }
    },
    [escaneando]
  );

  function escanearOtro() {
    setResultado(null);
    setError("");
    setEscaneando(true);
  }

  if (!permission) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.permisoTexto}>Necesitamos tu cámara para escanear el QR del cliente.</Text>
        <Pressable style={estilos.boton} onPress={requestPermission}>
          <Text style={estilos.textoBoton}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  if (resultado) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={["top"]}>
        <ResultadoCliente resultado={resultado} config={config} onVolver={escanearOtro} textoVolver="← Escanear otro" />
      </SafeAreaView>
    );
  }

  return (
    <View style={estilos.contenedor}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={escaneando && !cargando ? onScan : undefined}
      />
      <View style={estilos.marco} pointerEvents="none" />

      {cargando ? (
        <View style={estilos.overlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}

      {error ? (
        <View style={estilos.overlay}>
          <Text style={estilos.errorTexto}>{error}</Text>
          <Pressable style={estilos.boton} onPress={escanearOtro}>
            <Text style={estilos.textoBoton}>Escanear de nuevo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: "#000" },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo, padding: 24, gap: 14 },
    permisoTexto: { fontSize: 14, color: colores.texto, textAlign: "center" },
    marco: { position: "absolute", top: "30%", left: "15%", width: "70%", height: "70%", maxHeight: 280, borderWidth: 3, borderColor: "#fff", borderRadius: 16, opacity: 0.85 },
    overlay: { position: "absolute", bottom: 60, left: 20, right: 20, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 12, padding: 16, alignItems: "center", gap: 10 },
    errorTexto: { color: "#fff", fontSize: 14, textAlign: "center" },
    boton: { backgroundColor: colores.acento, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 20 },
    textoBoton: { color: "#fff", fontWeight: "600", fontSize: 14 },
  });
}
