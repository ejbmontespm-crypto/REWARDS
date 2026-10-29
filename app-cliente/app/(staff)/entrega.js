import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";

// El QR de la etiqueta del pedido es simplemente su UUID — a diferencia del
// QR del cliente (que rota cada 45s por seguridad), este vive desde que el
// pedido pasa a "listo" hasta que se entrega, así que no necesita expirar:
// conocer el id de un pedido no permite hacer nada por sí solo, todas las
// acciones reales siguen pasando por rutas con su propia autenticación.
export default function EscanearEntrega() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [permission, requestPermission] = useCameraPermissions();
  const [escaneando, setEscaneando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");

  const onScan = useCallback(
    async ({ data }) => {
      if (!escaneando) return;
      setEscaneando(false);
      setCargando(true);
      setError("");
      try {
        const { pedido: p } = await api.get(`/pedidos/${encodeURIComponent(data)}`);
        if (p.estado === "entregado") throw new ApiError("Este pedido ya fue entregado.", "ya_entregado", 409);
        if (p.estado !== "listo") {
          throw new ApiError(`Este pedido todavía está "${p.estado}" — no se puede entregar hasta que esté listo.`, "no_listo", 409);
        }
        setPedido(p);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo leer esta etiqueta.");
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
        <Text style={estilos.permisoTexto}>Necesitamos tu cámara para escanear la etiqueta del pedido.</Text>
        <Pressable style={estilos.boton} onPress={requestPermission}>
          <Text style={estilos.textoBoton}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  if (pedido) {
    const cantidadProductos = pedido.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
    return (
      <SafeAreaView style={estilos.contenedorResultado} edges={["top"]}>
        <View style={estilos.tarjeta}>
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
    contenedorResultado: { flex: 1, backgroundColor: colores.fondo, padding: 20, gap: 14 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16 },
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
