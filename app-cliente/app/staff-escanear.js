import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api, ApiError } from "../lib/api";
import { useTema } from "../lib/contextoTema";
import ResultadoCliente from "../components/ResultadoCliente";

// Un solo escáner para los dos tipos de QR — se distinguen por su propio
// formato, no hace falta que el staff elija pestaña:
//  - QR del cliente (recompensa): un JWT que rota cada 45s, formato
//    "xxx.yyy.zzz" (tres segmentos separados por punto).
//  - QR del pedido (entrega): el UUID del pedido tal cual, sin expirar —
//    conocerlo no habilita nada por sí solo, toda acción real pasa por
//    rutas con su propia autenticación de staff.
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Escanear() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [permission, requestPermission] = useCameraPermissions();
  const [config, setConfig] = useState(null);
  const [escaneando, setEscaneando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultadoCliente, setResultadoCliente] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");

  // La cámara se queda "congelada" (último frame, sin imagen nueva) si se
  // cambia a otra pestaña y se regresa — forzar un remount completo al
  // recuperar el foco es lo único que la reinicia de forma confiable.
  const [enfocado, setEnfocado] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setEnfocado(true);
      return () => setEnfocado(false);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      api
        .get("/configuracion-recompensa/activa")
        .then((d) => setConfig(d.configuracion))
        .catch(() => {});
    }, [])
  );

  const onScan = useCallback(
    async ({ data }) => {
      if (!escaneando) return;
      setEscaneando(false);
      setCargando(true);
      setError("");
      try {
        if (REGEX_UUID.test(data)) {
          const { pedido: p } = await api.get(`/pedidos/${encodeURIComponent(data)}`);
          if (p.estado === "entregado") throw new ApiError("Este pedido ya fue entregado.", "ya_entregado", 409);
          if (p.estado !== "listo") {
            throw new ApiError(`Este pedido todavía está "${p.estado}" — no se puede entregar hasta que esté listo.`, "no_listo", 409);
          }
          setPedido(p);
        } else {
          const r = await api.get(`/staff/escaneo/${encodeURIComponent(data)}`);
          setResultadoCliente(r);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo leer este código.");
      } finally {
        setCargando(false);
      }
    },
    [escaneando]
  );

  async function confirmarEntrega() {
    setConfirmando(true);
    setError("");
    try {
      await api.post("/movimientos", { cliente_id: pedido.cliente_id, pedido_id: pedido.id });
      escanearOtro();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
    } finally {
      setConfirmando(false);
    }
  }

  function escanearOtro() {
    setPedido(null);
    setResultadoCliente(null);
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
        <Text style={estilos.permisoTexto}>Necesitamos tu cámara para escanear códigos QR.</Text>
        <Pressable style={estilos.boton} onPress={requestPermission}>
          <Text style={estilos.textoBoton}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  if (resultadoCliente) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colores.fondo }} edges={["top"]}>
        <ResultadoCliente resultado={resultadoCliente} config={config} onVolver={escanearOtro} textoVolver="← Escanear otro" />
      </SafeAreaView>
    );
  }

  if (pedido) {
    const cantidadProductos = pedido.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
    return (
      <SafeAreaView style={estilos.contenedorResultado} edges={["top"]}>
        <View style={estilos.tarjeta}>
          {pedido.folio ? <Text style={estilos.folio}>{pedido.folio}</Text> : null}
          <Text style={estilos.nombreCliente}>
            {pedido.nombre} {pedido.apellido_paterno}
          </Text>
          <Text style={estilos.resumen}>
            {cantidadProductos} producto{cantidadProductos === 1 ? "" : "s"} — ${Number(pedido.total_mxn).toFixed(0)}
          </Text>
          <View style={estilos.separador} />
          {pedido.items?.map((item) => (
            <View key={item.id} style={{ marginTop: 6 }}>
              <Text style={estilos.itemTexto}>
                {item.cantidad}× {item.producto_nombre}
              </Text>
              {item.extras?.length ? <Text style={estilos.itemExtras}>{item.extras.map((e) => e.extra_nombre).join(", ")}</Text> : null}
            </View>
          ))}
          <View style={estilos.separador} />
          <Text style={estilos.metodoPago}>
            {pedido.metodo_pago === "liga_mp"
              ? pedido.pago_confirmado
                ? "✓ Ya pagado en línea"
                : "⚠ Marcado como pago en línea, pero no se confirmó"
              : "Forma de pago: en caja"}
          </Text>
        </View>

        {error ? <Text style={estilos.error}>{error}</Text> : null}

        <Pressable style={estilos.botonConfirmar} onPress={confirmarEntrega} disabled={confirmando}>
          {confirmando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Confirmar entrega</Text>}
        </Pressable>
        <Pressable onPress={escanearOtro}>
          <Text style={estilos.link}>← Escanear otro</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={estilos.contenedor}>
      {enfocado ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={escaneando && !cargando ? onScan : undefined}
        />
      ) : null}
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
    contenedorResultado: { flex: 1, backgroundColor: colores.fondo, padding: 20, gap: 14 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16 },
    folio: { fontSize: 11, color: colores.textoMuted, fontWeight: "700", marginBottom: 4 },
    nombreCliente: { fontSize: 16, fontWeight: "700", color: colores.texto },
    resumen: { fontSize: 13, color: colores.textoMuted, marginTop: 2 },
    separador: { height: 1, backgroundColor: colores.borde, marginVertical: 10 },
    itemTexto: { fontSize: 14, color: colores.texto },
    itemExtras: { fontSize: 12, color: colores.textoMuted },
    metodoPago: { fontSize: 13, color: colores.texto, fontWeight: "600" },
    error: { color: colores.peligro, fontSize: 13, textAlign: "center" },
    botonConfirmar: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
    link: { textAlign: "center", color: colores.textoMuted, fontSize: 13 },
  });
}
