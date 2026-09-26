import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import PedidoProgreso, { PASOS_PEDIDO } from "../../components/PedidoProgreso";

export default function DetallePedido() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [pedido, setPedido] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cancelando, setCancelando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState("");

  async function pagarConMercadoPago() {
    setPagando(true);
    setError("");
    try {
      const { url } = await api.post(`/pagos/mercadopago/liga/${id}`, {});
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la liga de pago.");
    } finally {
      setPagando(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      api
        .get(`/pedidos/${id}`)
        .then((d) => vivo && setPedido(d.pedido))
        .catch((err) => vivo && setError(err instanceof ApiError ? err.message : "No se pudo cargar el pedido."))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [id])
  );

  async function cancelar() {
    setCancelando(true);
    setError("");
    try {
      await api.post(`/pedidos/${id}/cancelar`, {});
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar el pedido.");
    } finally {
      setCancelando(false);
    }
  }

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  if (!pedido) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.error}>{error || "Pedido no encontrado."}</Text>
      </View>
    );
  }

  const esEstadoFinalDistinto = !PASOS_PEDIDO.includes(pedido.estado); // cancelado / no_recogido

  return (
    <ScrollView style={estilos.contenedor} contentContainerStyle={{ padding: 20, gap: 18 }}>
      {esEstadoFinalDistinto ? (
        <Text style={estilos.estadoFinal}>
          {pedido.estado === "cancelado" ? "Pedido cancelado" : "No se recogió a tiempo"}
        </Text>
      ) : (
        <PedidoProgreso estado={pedido.estado} />
      )}

      <View style={estilos.tarjeta}>
        <Text style={estilos.detalle}>
          Pickup: {new Date(pedido.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
        </Text>
        {pedido.items?.map((item) => (
          <View key={item.id} style={{ marginTop: 8 }}>
            <Text style={estilos.itemTexto}>
              {item.cantidad}× {item.producto_nombre} — ${(item.precio_unitario * item.cantidad).toFixed(0)}
            </Text>
            {item.extras?.length ? (
              <Text style={estilos.itemExtras}>{item.extras.map((e) => e.extra_nombre).join(", ")}</Text>
            ) : null}
          </View>
        ))}
        <View style={estilos.separador} />
        <Text style={estilos.total}>Total: ${Number(pedido.total_mxn).toFixed(0)}</Text>
        {Number(pedido.creditos_aplicados_mxn) > 0 ? (
          <Text style={estilos.detalle}>Créditos aplicados: ${Number(pedido.creditos_aplicados_mxn).toFixed(0)}</Text>
        ) : null}
        {pedido.pago_confirmado ? <Text style={estilos.pagado}>✓ Pagado en línea</Text> : null}
      </View>

      {!esEstadoFinalDistinto && !pedido.pago_confirmado && Number(pedido.total_mxn) - Number(pedido.creditos_aplicados_mxn || 0) > 0 ? (
        <Pressable style={estilos.botonPagar} onPress={pagarConMercadoPago} disabled={pagando}>
          {pagando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoPagar}>Pagar en línea con Mercado Pago</Text>}
        </Pressable>
      ) : null}

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      {pedido.estado === "recibido" ? (
        <Pressable style={estilos.botonCancelar} onPress={cancelar} disabled={cancelando}>
          {cancelando ? <ActivityIndicator color={colores.peligro} /> : <Text style={estilos.textoCancelar}>Cancelar pedido</Text>}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    error: { color: colores.peligro, fontSize: 13 },
    estadoFinal: { fontSize: 16, fontWeight: "700", color: colores.texto, textAlign: "center" },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16 },
    detalle: { fontSize: 13, color: colores.textoMuted },
    itemTexto: { fontSize: 14, color: colores.texto },
    itemExtras: { fontSize: 12, color: colores.textoMuted },
    separador: { height: 1, backgroundColor: colores.borde, marginVertical: 10 },
    total: { fontSize: 16, fontWeight: "700", color: colores.texto },
    pagado: { fontSize: 12.5, color: colores.exito, fontWeight: "600", marginTop: 6 },
    botonPagar: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
    textoPagar: { color: "#fff", fontWeight: "700", fontSize: 14 },
    botonCancelar: { borderWidth: 1, borderColor: colores.peligro, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    textoCancelar: { color: colores.peligro, fontWeight: "600", fontSize: 14 },
  });
}
