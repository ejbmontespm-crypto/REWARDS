import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";

const SIGUIENTE_ESTADO = { recibido: "preparando", preparando: "listo" };
const ETIQUETA_ESTADO = { recibido: "Recibido", preparando: "Preparando", listo: "Listo", entregado: "Entregado" };
const ETIQUETA_AVANZAR = { recibido: "Empezar a preparar", preparando: "Marcar listo" };

export default function ColaPedidos() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [tab, setTab] = useState("activos"); // "activos" | "entregados"
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pedidoCancelar, setPedidoCancelar] = useState(null);
  const [pedidoCancelarPrep, setPedidoCancelarPrep] = useState(null);
  const [pinPrep, setPinPrep] = useState("");
  const [motivoPrep, setMotivoPrep] = useState("");
  const [errorPrep, setErrorPrep] = useState("");
  const [accionando, setAccionando] = useState(null);

  const cargar = useCallback(async (tabActual) => {
    setCargando(true);
    setError("");
    try {
      const query = tabActual === "entregados" ? { estado: "entregado" } : {};
      const { pedidos: rows } = await api.get("/pedidos/cola", { query });
      setPedidos(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la cola.");
    } finally {
      setCargando(false);
    }
  }, []);

  // Sin spinner ni bloquear la vista — para el refresco automático de
  // fondo. Antes solo se recargaba al entrar a la pestaña (useFocusEffect),
  // así que un pedido nuevo, o uno que cambió de estado, no se veía hasta
  // salir y volver a entrar a Cola.
  const cargarSilencioso = useCallback(async (tabActual) => {
    try {
      const query = tabActual === "entregados" ? { estado: "entregado" } : {};
      const { pedidos: rows } = await api.get("/pedidos/cola", { query });
      setPedidos(rows);
    } catch {
      /* se reintenta en el siguiente ciclo, sin interrumpir lo que ya se ve */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(tab);
      const intervalo = setInterval(() => cargarSilencioso(tab), 8000);
      return () => clearInterval(intervalo);
    }, [cargar, cargarSilencioso, tab])
  );

  async function avanzar(pedido) {
    setAccionando(pedido.id);
    try {
      const nuevoEstado = SIGUIENTE_ESTADO[pedido.estado];
      await api.patch(`/pedidos/${pedido.id}/estado`, { estado: nuevoEstado });
      // Sigue en la cola activa (preparando/listo también lo son) — solo se
      // actualiza su estado, no desaparece la tarjeta como si ya se hubiera
      // entregado (eso solo pasa de verdad en el escaneo, no aquí).
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, estado: nuevoEstado } : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo avanzar el pedido.");
    } finally {
      setAccionando(null);
    }
  }

  async function entregar(pedido) {
    setAccionando(pedido.id);
    try {
      // Mismo endpoint que usa el escaneo/búsqueda de cliente para
      // confirmar la entrega: genera la acumulación (y el canje, si el
      // pedido traía créditos aplicados) en la misma llamada.
      await api.post("/movimientos", { cliente_id: pedido.cliente_id, pedido_id: pedido.id });
      // Mismo criterio visual que avanzar(): primero se ve la etiqueta
      // cambiar a "Entregado" en su lugar (consistente con los otros 3
      // pasos), y hasta después de un momento sale de "Activos" — antes
      // desaparecía de golpe, rompiendo la sensación de flujo continuo.
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, estado: "entregado" } : p)));
      setTimeout(() => setPedidos((prev) => prev.filter((p) => p.id !== pedido.id)), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la entrega.");
    } finally {
      setAccionando(null);
    }
  }

  async function cancelar(pedido, conPenalizacion, pin, motivo) {
    setAccionando(pedido.id);
    try {
      await api.post(`/pedidos/${pedido.id}/cancelar`, { con_penalizacion: conPenalizacion, pin, motivo });
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
      setPedidoCancelar(null);
      setPedidoCancelarPrep(null);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo cancelar.";
      if (pedidoCancelarPrep) setErrorPrep(mensaje);
      else setError(mensaje);
    } finally {
      setAccionando(null);
    }
  }

  function tocarCancelar(pedido) {
    // "Preparando" ya gastó ingredientes/tiempo — exige PIN de admin y el
    // motivo, sin importar si además está vencido.
    if (pedido.estado === "preparando") {
      setPedidoCancelarPrep(pedido);
      setPinPrep("");
      setMotivoPrep("");
      setErrorPrep("");
    } else if (pedido.vencido && Number(pedido.creditos_aplicados_mxn) > 0) {
      setPedidoCancelar(pedido);
    } else {
      cancelar(pedido, false);
    }
  }

  function confirmarCancelarPrep() {
    if (!pinPrep.trim()) return setErrorPrep("Falta el PIN de admin.");
    if (!motivoPrep.trim()) return setErrorPrep("Falta especificar el motivo.");
    cancelar(pedidoCancelarPrep, false, pinPrep.trim(), motivoPrep.trim());
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <View style={estilos.tabs}>
        <Pressable style={[estilos.tab, tab === "activos" && estilos.tabActivo]} onPress={() => setTab("activos")}>
          <Text style={[estilos.textoTab, tab === "activos" && estilos.textoTabActivo]}>Activos</Text>
        </Pressable>
        <Pressable style={[estilos.tab, tab === "entregados" && estilos.tabActivo]} onPress={() => setTab("entregados")}>
          <Text style={[estilos.textoTab, tab === "entregados" && estilos.textoTabActivo]}>Entregados hoy</Text>
        </Pressable>
      </View>

      {cargando ? (
        <View style={estilos.centro}>
          <ActivityIndicator color={colores.acento} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {error ? <Text style={estilos.error}>{error}</Text> : null}
          {!error && pedidos.length === 0 ? <Text style={estilos.vacio}>Sin pedidos por aquí.</Text> : null}

          {pedidos.map((p) => (
            <View key={p.id} style={[estilos.tarjeta, p.vencido && tab === "activos" && estilos.tarjetaVencida]}>
              <View style={estilos.filaEncabezado}>
                <Text style={estilos.nombreCliente}>
                  {p.nombre} {p.apellido_paterno}
                </Text>
                <Text style={[estilos.estadoTexto, p.estado === "entregado" && estilos.estadoTextoEntregado]}>
                  {ETIQUETA_ESTADO[p.estado]}
                </Text>
              </View>
              <Text style={estilos.hora}>
                Pickup: {new Date(p.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                {p.vencido && tab === "activos" ? " — vencido" : ""}
              </Text>
              {p.items?.length ? (
                <Text style={estilos.items}>{p.items.map((i) => `${i.cantidad}× ${i.producto_nombre}`).join(", ")}</Text>
              ) : null}
              <Text style={estilos.total}>Total: ${Number(p.total_mxn).toFixed(0)}</Text>

              {tab === "activos" && p.estado !== "entregado" ? (
                <View style={estilos.filaBotones}>
                  {SIGUIENTE_ESTADO[p.estado] ? (
                    <Pressable testID={`avanzar-${p.id}`} style={estilos.botonAvanzar} onPress={() => avanzar(p)} disabled={accionando === p.id}>
                      {accionando === p.id ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>{ETIQUETA_AVANZAR[p.estado]}</Text>}
                    </Pressable>
                  ) : null}
                  {p.estado === "listo" ? (
                    <Pressable testID={`entregar-${p.id}`} style={estilos.botonAvanzar} onPress={() => entregar(p)} disabled={accionando === p.id}>
                      {accionando === p.id ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Marcar como entregado</Text>}
                    </Pressable>
                  ) : null}
                  {p.vencido || p.estado === "preparando" ? (
                    <Pressable testID={`cancelar-${p.id}`} style={estilos.botonCancelar} onPress={() => tocarCancelar(p)} disabled={accionando === p.id}>
                      <Text style={estilos.textoBotonCancelar}>Cancelar</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal transparent visible={Boolean(pedidoCancelar)} animationType="fade" onRequestClose={() => setPedidoCancelar(null)}>
        <View style={estilos.overlayModal}>
          <View style={estilos.hojaModal}>
            <Text style={estilos.tituloModal}>Cancelar pedido vencido</Text>
            <Text style={estilos.textoModal}>
              Este pedido traía ${Number(pedidoCancelar?.creditos_aplicados_mxn || 0).toFixed(0)} en créditos aplicados. ¿Aplicas la
              penalización por no recogerlo, o lo cancelas sin penalizar?
            </Text>
            <Pressable style={estilos.botonModalPenalizar} onPress={() => cancelar(pedidoCancelar, true)}>
              <Text style={estilos.textoBoton}>Cancelar y aplicar penalización</Text>
            </Pressable>
            <Pressable style={estilos.botonModalSinPenalizar} onPress={() => cancelar(pedidoCancelar, false)}>
              <Text style={estilos.textoBotonSinPenalizar}>Cancelar sin penalización</Text>
            </Pressable>
            <Pressable onPress={() => setPedidoCancelar(null)}>
              <Text style={estilos.linkVolver}>Volver</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={Boolean(pedidoCancelarPrep)} animationType="fade" onRequestClose={() => setPedidoCancelarPrep(null)}>
        <View style={estilos.overlayModal}>
          <View style={estilos.hojaModal}>
            <Text style={estilos.tituloModal}>Cancelar pedido en preparación</Text>
            <Text style={estilos.textoModal}>Ya se empezó a preparar — se necesita autorización de admin y el motivo.</Text>
            <TextInput
              style={estilos.input}
              placeholder="PIN de admin"
              value={pinPrep}
              onChangeText={setPinPrep}
              keyboardType="number-pad"
              secureTextEntry
            />
            <TextInput style={estilos.input} placeholder="Motivo de la cancelación" value={motivoPrep} onChangeText={setMotivoPrep} />
            {errorPrep ? <Text style={estilos.error}>{errorPrep}</Text> : null}
            <Pressable style={estilos.botonModalPenalizar} onPress={confirmarCancelarPrep} disabled={accionando === pedidoCancelarPrep?.id}>
              {accionando === pedidoCancelarPrep?.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={estilos.textoBoton}>Confirmar cancelación</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setPedidoCancelarPrep(null)}>
              <Text style={estilos.linkVolver}>Volver</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center" },
    tabs: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
    tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: colores.borde },
    tabActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
    textoTab: { fontSize: 13, color: colores.texto },
    textoTabActivo: { color: "#fff", fontWeight: "600" },
    error: { color: colores.peligro, fontSize: 13 },
    vacio: { textAlign: "center", color: colores.textoMuted, marginTop: 30 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 14, gap: 4 },
    tarjetaVencida: { borderColor: colores.peligro, borderWidth: 1.5 },
    filaEncabezado: { flexDirection: "row", justifyContent: "space-between" },
    nombreCliente: { fontSize: 14.5, fontWeight: "700", color: colores.texto },
    estadoTexto: { fontSize: 12, color: colores.acento, fontWeight: "600" },
    estadoTextoEntregado: { color: colores.exito },
    hora: { fontSize: 12.5, color: colores.textoMuted },
    items: { fontSize: 13, color: colores.texto },
    total: { fontSize: 13, fontWeight: "600", color: colores.texto },
    filaBotones: { flexDirection: "row", gap: 8, marginTop: 6 },
    botonAvanzar: { flex: 1, backgroundColor: colores.acento, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
    textoBoton: { color: "#fff", fontWeight: "600", fontSize: 13 },
    botonCancelar: { borderWidth: 1, borderColor: colores.peligro, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" },
    textoBotonCancelar: { color: colores.peligro, fontWeight: "600", fontSize: 13 },
    overlayModal: { flex: 1, backgroundColor: "rgba(32,30,26,0.4)", justifyContent: "center", padding: 24 },
    hojaModal: { backgroundColor: colores.superficie, borderRadius: 16, padding: 22, gap: 12 },
    tituloModal: { fontSize: 16, fontWeight: "700", color: colores.texto },
    textoModal: { fontSize: 13, color: colores.textoMuted, lineHeight: 19 },
    input: { backgroundColor: colores.fondo, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colores.texto },
    botonModalPenalizar: { backgroundColor: colores.peligro, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    botonModalSinPenalizar: { borderWidth: 1, borderColor: colores.borde, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    textoBotonSinPenalizar: { color: colores.texto, fontWeight: "600", fontSize: 14 },
    linkVolver: { textAlign: "center", color: colores.textoMuted, fontSize: 13, marginTop: 4 },
  });
}
