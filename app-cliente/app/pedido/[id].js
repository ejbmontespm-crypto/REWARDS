import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import { mostrarToast } from "../../lib/toast";
import PedidoProgreso, { PASOS_PEDIDO } from "../../components/PedidoProgreso";

const ESTADOS_FINALES = ["entregado", "cancelado", "no_recogido"];

export default function DetallePedido() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [pedidos, setPedidos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Todos los pedidos activos del cliente (no solo el que se tocó desde
  // Inicio) — se listan verticalmente, con el que se tocó siempre primero,
  // para poder ver todos sin perder de vista de cuál se entró a ver.
  const cargar = useCallback(async () => {
    try {
      const d = await api.get("/clientes/me");
      const activos = d.pedidos_en_curso || [];
      const detalles = await Promise.all(activos.map((p) => api.get(`/pedidos/${p.id}`).then((r) => r.pedido)));
      detalles.sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
      setPedidos(detalles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar tu pedido.");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  // Sin esto, esta pantalla solo se refrescaba al entrar (useFocusEffect)
  // — si el staff avanzaba el pedido (preparando/listo/entregado) o
  // confirmaba un pago mientras el cliente seguía viendo esta pantalla sin
  // cambiar de pestaña, se quedaba pegada hasta salir y volver a entrar.
  // Revisa cada 5s en silencio mientras algún pedido siga activo, y para
  // sola en cuanto todos quedan en un estado final.
  const hayActivo = (pedidos || []).some((p) => !ESTADOS_FINALES.includes(p.estado));
  useEffect(() => {
    if (!hayActivo) return;
    const intervalo = setInterval(cargar, 5000);
    return () => clearInterval(intervalo);
  }, [hayActivo, cargar]);

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  if (!pedidos || pedidos.length === 0) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.error}>{error || "No tienes pedidos activos por ahora."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={estilos.contenedor} contentContainerStyle={{ padding: 20, gap: 14 }}>
      {pedidos.length > 1 ? <Text style={estilos.contador}>Tienes {pedidos.length} pedidos activos</Text> : null}
      {pedidos.map((pedido, i) => (
        <View key={pedido.id}>
          {i > 0 ? <View style={estilos.separadorPedidos} /> : null}
          <TarjetaPedido pedido={pedido} colores={colores} estilos={estilos} router={router} onCambio={cargar} />
        </View>
      ))}
    </ScrollView>
  );
}

function TarjetaPedido({ pedido, colores, estilos, router, onCambio }) {
  const [cancelando, setCancelando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState("");

  const esPendientePago = pedido.estado === "pendiente_pago";
  const esEstadoFinalDistinto = !esPendientePago && !PASOS_PEDIDO.includes(pedido.estado);
  const porPagar = Number(pedido.total_mxn) - Number(pedido.creditos_aplicados_mxn || 0) - Number(pedido.monedero_aplicado_mxn || 0);
  const cantidadProductos = pedido.items?.reduce((s, i) => s + i.cantidad, 0) || 0;

  async function cancelar() {
    setCancelando(true);
    setError("");
    try {
      const { saldo_generado_mxn } = await api.post(`/pedidos/${pedido.id}/cancelar`, {});
      if (saldo_generado_mxn) {
        mostrarToast(`✓ Pedido cancelado — $${Number(saldo_generado_mxn).toFixed(0)} de saldo a favor para tu siguiente compra`);
      }
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar el pedido.");
    } finally {
      setCancelando(false);
    }
  }

  async function pagarConMercadoPago() {
    setPagando(true);
    setError("");
    try {
      const { url } = await api.post(`/pagos/mercadopago/liga/${pedido.id}`, {});
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la liga de pago.");
    } finally {
      setPagando(false);
    }
  }

  const [cambiandoACaja, setCambiandoACaja] = useState(false);
  async function pagarEnCaja() {
    setCambiandoACaja(true);
    setError("");
    try {
      await api.post(`/pedidos/${pedido.id}/pagar-en-caja`, {});
      await onCambio?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la forma de pago.");
    } finally {
      setCambiandoACaja(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Resumen — para diferenciar de un vistazo cuál pedido es cuál al
          tener varios activos, sin tener que leer todos los items. */}
      <Text style={estilos.resumenPedido}>
        {cantidadProductos} producto{cantidadProductos === 1 ? "" : "s"} — ${Number(pedido.total_mxn).toFixed(0)}
      </Text>

      {esPendientePago ? (
        <View style={estilos.bannerPendientePago}>
          <Text style={estilos.textoPendientePago}>⏳ Esperando confirmación de tu pago</Text>
          <Text style={estilos.detalle}>Tu pedido entra a cocina en cuanto Mercado Pago confirme el pago.</Text>
        </View>
      ) : esEstadoFinalDistinto ? (
        <Text style={estilos.estadoFinal}>{pedido.estado === "cancelado" ? "Pedido cancelado" : "No se recogió a tiempo"}</Text>
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
            {item.extras?.length ? <Text style={estilos.itemExtras}>{item.extras.map((e) => e.extra_nombre).join(", ")}</Text> : null}
          </View>
        ))}
        <View style={estilos.separador} />
        <Text style={estilos.total}>Total: ${Number(pedido.total_mxn).toFixed(0)}</Text>
        {Number(pedido.creditos_aplicados_mxn) > 0 ? (
          <Text style={estilos.detalle}>Créditos aplicados: ${Number(pedido.creditos_aplicados_mxn).toFixed(0)}</Text>
        ) : null}
        {Number(pedido.monedero_aplicado_mxn) > 0 ? (
          <Text style={estilos.detalle}>Saldo a favor aplicado: ${Number(pedido.monedero_aplicado_mxn).toFixed(0)}</Text>
        ) : null}
        <Text style={estilos.detalle}>{pedido.metodo_pago === "liga_mp" ? "Forma de pago: en línea (Mercado Pago)" : "Forma de pago: en caja"}</Text>
        {pedido.pago_confirmado ? <Text style={estilos.pagado}>✓ Pagado en línea</Text> : null}
      </View>

      {/* La forma de pago se elige en el Carrito y queda fija — aquí solo se
          ofrece reintentar si eligió Mercado Pago y todavía no se confirma. */}
      {pedido.metodo_pago === "liga_mp" && !pedido.pago_confirmado && porPagar > 0 && !ESTADOS_FINALES.includes(pedido.estado) ? (
        <Pressable style={estilos.botonPagar} onPress={pagarConMercadoPago} disabled={pagando}>
          {pagando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoPagar}>Pagar en línea con Mercado Pago</Text>}
        </Pressable>
      ) : null}

      {esPendientePago ? (
        <Pressable style={estilos.botonSecundario} onPress={pagarEnCaja} disabled={cambiandoACaja}>
          {cambiandoACaja ? (
            <ActivityIndicator color={colores.acento} />
          ) : (
            <Text style={estilos.textoBotonSecundario}>Prefiero pagar en caja al recoger</Text>
          )}
        </Pressable>
      ) : null}

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      {["recibido", "pendiente_pago"].includes(pedido.estado) ? (
        <Pressable style={estilos.botonCancelar} onPress={cancelar} disabled={cancelando}>
          {cancelando ? <ActivityIndicator color={colores.peligro} /> : <Text style={estilos.textoCancelar}>Cancelar pedido</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo, padding: 24 },
    error: { color: colores.peligro, fontSize: 13, textAlign: "center" },
    contador: { fontSize: 12.5, color: colores.textoMuted, textAlign: "center" },
    separadorPedidos: { height: 1, backgroundColor: colores.borde, marginVertical: 18 },
    resumenPedido: { fontSize: 15, fontWeight: "700", color: colores.texto, textAlign: "center" },
    estadoFinal: { fontSize: 16, fontWeight: "700", color: colores.texto, textAlign: "center" },
    bannerPendientePago: { backgroundColor: "#fff7e6", borderWidth: 1, borderColor: "#f0dba9", borderRadius: 10, padding: 12, gap: 4 },
    textoPendientePago: { fontSize: 14, fontWeight: "700", color: colores.texto },
    botonSecundario: { borderWidth: 1, borderColor: colores.borde, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    textoBotonSecundario: { color: colores.texto, fontWeight: "600", fontSize: 13.5 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16 },
    detalle: { fontSize: 13, color: colores.textoMuted, marginTop: 6 },
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
