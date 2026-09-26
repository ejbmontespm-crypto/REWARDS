import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { api, ApiError } from "../lib/api";
import { useTema } from "../lib/contextoTema";

const ETIQUETA_PERFIL = { alumno: "Alumno", docente: "Docente", otro: "Otro" };

function textoSaldo(cliente, config) {
  if (!config) return "";
  if (config.modalidad === "credito_valor_mxn") {
    const pesos = (Number(cliente.creditos_disponibles) * Number(config.valor_cd_mxn || 1)).toFixed(0);
    return `$${pesos} MXN en créditos`;
  }
  if (config.modalidad === "credito_umbral") return `${cliente.creditos_disponibles} de ${config.umbral_cd} créditos`;
  if (config.modalidad === "visitas") return `${cliente.visitas_disponibles} de ${config.umbral_visitas} visitas`;
  return "";
}

/**
 * Todo lo que el staff puede hacer con un cliente, en una sola pantalla
 * (plan §7.1) — se llega aquí igual desde el escaneo de QR que desde la
 * búsqueda manual sin QR (fase7 §4), por eso vive como componente
 * compartido en vez de duplicarse en cada pantalla que lo usa.
 */
export default function ResultadoCliente({ resultado, config, onVolver, textoVolver = "← Volver" }) {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [cliente] = useState(resultado.cliente);
  const [pedidos, setPedidos] = useState(resultado.pedidos_pendientes);
  const [solicitudes, setSolicitudes] = useState(resultado.solicitudes_canje_pendientes);
  const [movimientos, setMovimientos] = useState(resultado.ultimos_movimientos);
  const [montoVenta, setMontoVenta] = useState("");
  const [accionando, setAccionando] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [productos, setProductos] = useState([]);
  const [productoElegido, setProductoElegido] = useState(null);
  const [solicitudActiva, setSolicitudActiva] = useState(null);
  const [movimientoCorrigiendo, setMovimientoCorrigiendo] = useState(null);

  async function marcarEntregado(pedido) {
    setAccionando(`pedido-${pedido.id}`);
    setError("");
    try {
      await api.post("/movimientos", { cliente_id: cliente.id, pedido_id: pedido.id });
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
      setMensaje("Pedido marcado como entregado.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el pedido.");
    } finally {
      setAccionando(null);
    }
  }

  async function abrirRedencion(solicitud) {
    setSolicitudActiva(solicitud);
    setError("");
    if (config?.modalidad === "credito_valor_mxn") {
      try {
        const { productos: todos } = await api.get("/productos");
        setProductos(todos.filter((p) => !p.agotado));
      } catch {
        setProductos([]);
      }
    } else {
      setProductos(config?.productos_elegibles || []);
    }
  }

  async function confirmarRedencion() {
    if (!productoElegido) return setError("Elige un producto.");
    setAccionando(`solicitud-${solicitudActiva.id}`);
    setError("");
    try {
      await api.post("/canjes", { solicitud_id: solicitudActiva.id, producto_id: productoElegido });
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudActiva.id));
      setSolicitudActiva(null);
      setProductoElegido(null);
      setMensaje("Redención aplicada.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar la redención.");
    } finally {
      setAccionando(null);
    }
  }

  async function registrarVenta() {
    const monto = Number(montoVenta);
    if (!monto || monto <= 0) return setError("Escribe un monto válido.");
    setAccionando("venta");
    setError("");
    try {
      await api.post("/movimientos", { cliente_id: cliente.id, monto });
      setMontoVenta("");
      setMensaje(`Venta de $${monto} registrada.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la venta.");
    } finally {
      setAccionando(null);
    }
  }

  return (
    <ScrollView style={estilos.resultadoContenedor} contentContainerStyle={{ padding: 20, gap: 16 }}>
      {onVolver ? (
        <Pressable style={estilos.botonVolver} onPress={onVolver}>
          <Text style={estilos.textoVolver}>{textoVolver}</Text>
        </Pressable>
      ) : null}

      <View style={estilos.tarjeta}>
        <View style={estilos.encabezadoCliente}>
          <View style={estilos.avatar}>
            <Text style={estilos.avatarTexto}>{(cliente.nombre[0] || "") + (cliente.apellido_paterno[0] || "")}</Text>
          </View>
          <View>
            <Text style={estilos.nombreCliente}>
              {cliente.nombre} {cliente.apellido_paterno}
            </Text>
            <Text style={estilos.perfilCliente}>{ETIQUETA_PERFIL[cliente.tipo_perfil] || cliente.tipo_perfil}</Text>
          </View>
        </View>
        <Text style={estilos.saldoTexto}>{textoSaldo(cliente, config)}</Text>
        {movimientos?.length ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            {movimientos.map((m) =>
              movimientoCorrigiendo?.id === m.id ? (
                <CorreccionMovimiento
                  key={m.id}
                  estilos={estilos}
                  movimiento={m}
                  onCancelar={() => setMovimientoCorrigiendo(null)}
                  onListo={(actualizado, mensajeExito) => {
                    setMovimientos((prev) => prev.map((mm) => (mm.id === m.id ? { ...mm, ...actualizado } : mm)));
                    setMovimientoCorrigiendo(null);
                    setMensaje(mensajeExito);
                  }}
                />
              ) : (
                <Pressable key={m.id} style={estilos.filaMovimiento} onPress={() => setMovimientoCorrigiendo(m)}>
                  <Text style={estilos.movimientoTexto}>
                    {new Date(m.created_at).toLocaleDateString("es-MX")} — ${Number(m.monto).toFixed(0)}
                  </Text>
                  <Text style={estilos.linkCorregir}>Corregir</Text>
                </Pressable>
              )
            )}
          </View>
        ) : null}
      </View>

      {mensaje ? <Text style={estilos.exito}>{mensaje}</Text> : null}
      {error ? <Text style={estilos.error}>{error}</Text> : null}

      {pedidos.map((p) => (
        <View key={p.id} style={estilos.tarjeta}>
          <Text style={estilos.tituloTarjeta}>Pedido pendiente</Text>
          <Text style={estilos.detalleTarjeta}>
            Total ${Number(p.total_mxn).toFixed(0)} — pickup {new Date(p.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Pressable style={estilos.botonAccion} onPress={() => marcarEntregado(p)} disabled={accionando === `pedido-${p.id}`}>
            {accionando === `pedido-${p.id}` ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Marcar como entregado</Text>}
          </Pressable>
        </View>
      ))}

      {solicitudes.map((s) => (
        <View key={s.id} style={estilos.tarjeta}>
          <Text style={estilos.tituloTarjeta}>Solicitud de redención pendiente</Text>
          <Text style={estilos.detalleTarjeta}>Tipo: {s.tipo}</Text>
          {solicitudActiva?.id === s.id ? (
            <>
              <View style={estilos.filaProductos}>
                {productos.map((prod) => (
                  <Pressable
                    key={prod.id}
                    style={[estilos.chipProducto, productoElegido === prod.id && estilos.chipProductoActivo]}
                    onPress={() => setProductoElegido(prod.id)}
                  >
                    <Text style={[estilos.textoChip, productoElegido === prod.id && estilos.textoChipActivo]}>{prod.nombre}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={estilos.botonAccion} onPress={confirmarRedencion} disabled={accionando === `solicitud-${s.id}`}>
                {accionando === `solicitud-${s.id}` ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Confirmar redención</Text>}
              </Pressable>
            </>
          ) : (
            <Pressable style={estilos.botonAccion} onPress={() => abrirRedencion(s)}>
              <Text style={estilos.textoBoton}>Aplicar redención</Text>
            </Pressable>
          )}
        </View>
      ))}

      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloTarjeta}>Registrar venta de mostrador</Text>
        <TextInput
          style={estilos.inputMonto}
          placeholder="Monto (MXN)"
          keyboardType="decimal-pad"
          value={montoVenta}
          onChangeText={setMontoVenta}
        />
        <Pressable style={estilos.botonAccion} onPress={registrarVenta} disabled={accionando === "venta"}>
          {accionando === "venta" ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Registrar</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function CorreccionMovimiento({ estilos, movimiento, onCancelar, onListo }) {
  const [accion, setAccion] = useState("editar"); // "editar" | "anular"
  const [montoNuevo, setMontoNuevo] = useState(String(movimiento.monto));
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!pin.trim()) return setError("Falta el PIN de corrección.");
    setEnviando(true);
    setError("");
    try {
      const body = { accion, pin: pin.trim() };
      if (accion === "editar") body.monto_nuevo = Number(montoNuevo);
      const { movimiento: actualizado } = await api.post(`/movimientos/${movimiento.id}/correccion`, body);
      onListo(actualizado, accion === "anular" ? "Movimiento anulado." : "Movimiento corregido.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo corregir.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.tarjetaCorreccion}>
      <View style={estilos.filaAccionCorreccion}>
        <Pressable style={[estilos.chipAccion, accion === "editar" && estilos.chipAccionActivo]} onPress={() => setAccion("editar")}>
          <Text style={[estilos.textoChip, accion === "editar" && estilos.textoChipActivo]}>Editar monto</Text>
        </Pressable>
        <Pressable style={[estilos.chipAccion, accion === "anular" && estilos.chipAccionActivo]} onPress={() => setAccion("anular")}>
          <Text style={[estilos.textoChip, accion === "anular" && estilos.textoChipActivo]}>Anular</Text>
        </Pressable>
      </View>
      {accion === "editar" ? (
        <TextInput style={estilos.inputMonto} keyboardType="decimal-pad" value={montoNuevo} onChangeText={setMontoNuevo} />
      ) : null}
      <TextInput style={estilos.inputMonto} placeholder="PIN de corrección" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable style={[estilos.botonAccion, { flex: 1 }]} onPress={confirmar} disabled={enviando}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Confirmar</Text>}
        </Pressable>
        <Pressable style={estilos.botonCancelarCorreccion} onPress={onCancelar}>
          <Text style={estilos.textoVolver}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    resultadoContenedor: { flex: 1, backgroundColor: colores.fondo },
    botonVolver: { alignSelf: "flex-start" },
    textoVolver: { color: colores.acento, fontWeight: "600", fontSize: 14 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16, gap: 8 },
    encabezadoCliente: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colores.acento, alignItems: "center", justifyContent: "center" },
    avatarTexto: { color: "#fff", fontWeight: "700", fontSize: 15 },
    nombreCliente: { fontSize: 16, fontWeight: "700", color: colores.texto },
    perfilCliente: { fontSize: 12.5, color: colores.textoMuted },
    saldoTexto: { fontSize: 15, fontWeight: "600", color: colores.texto, marginTop: 4 },
    filaMovimiento: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
    movimientoTexto: { fontSize: 12, color: colores.textoMuted },
    linkCorregir: { fontSize: 11.5, color: colores.acento, fontWeight: "600" },
    tituloTarjeta: { fontSize: 14, fontWeight: "600", color: colores.texto },
    detalleTarjeta: { fontSize: 13, color: colores.textoMuted },
    botonAccion: { backgroundColor: colores.acento, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 4 },
    inputMonto: { backgroundColor: colores.fondo, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    filaProductos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chipProducto: { borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    chipProductoActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
    textoChip: { fontSize: 12.5, color: colores.texto },
    textoChipActivo: { color: "#fff", fontWeight: "600" },
    exito: { color: colores.exito, fontSize: 13, fontWeight: "600" },
    error: { color: colores.peligro, fontSize: 13 },
    tarjetaCorreccion: { backgroundColor: colores.fondo, borderRadius: 8, padding: 10, gap: 8 },
    filaAccionCorreccion: { flexDirection: "row", gap: 8 },
    chipAccion: { borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    chipAccionActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
    botonCancelarCorreccion: { justifyContent: "center", paddingHorizontal: 14 },
  });
}
