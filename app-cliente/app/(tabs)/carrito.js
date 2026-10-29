import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useCarrito } from "../../lib/contextoCarrito";
import { useTema } from "../../lib/contextoTema";
import { radios, sombra } from "../../constants/theme";

function generarSlots(pickupInmediato) {
  const slots = [];
  if (pickupInmediato) {
    // Producto de horario limitado en el carrito (ej. happy hour): el
    // pickup debe quedar dentro de los 30 min siguientes a pedir, no en
    // los slots normales de 15 en 15 a lo largo del día.
    const inicio = new Date(Date.now() + 5 * 60_000);
    for (let i = 0; i < 6; i++) {
      const t = new Date(inicio.getTime() + i * 5 * 60_000);
      if (t.getTime() <= Date.now() + 30 * 60_000) slots.push(t);
    }
    return slots;
  }
  const inicio = new Date();
  inicio.setMinutes(Math.ceil(inicio.getMinutes() / 15) * 15 + 15, 0, 0); // primer slot util, +15 min mínimo
  for (let i = 0; i < 16; i++) {
    slots.push(new Date(inicio.getTime() + i * 15 * 60_000));
  }
  return slots;
}

export default function Carrito() {
  const router = useRouter();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const { items, quitar, cambiarCantidad, vaciar, total } = useCarrito();
  const [config, setConfig] = useState(null);
  const [saldo, setSaldo] = useState(null);
  const [promosVentana, setPromosVentana] = useState({});
  const [slotElegido, setSlotElegido] = useState(null);
  const [aplicarCreditos, setAplicarCreditos] = useState(false);
  const [aplicarMonedero, setAplicarMonedero] = useState(false);
  const [productoCanjeado, setProductoCanjeado] = useState(null);
  const [metodoPago, setMetodoPago] = useState("caja"); // "caja" | "mercadopago"
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/configuracion-recompensa/activa"), api.get("/clientes/me"), api.get("/promociones")])
      .then(([conf, me, promos]) => {
        setConfig(conf.configuracion);
        setSaldo(me.saldo);
        setPromosVentana(
          Object.fromEntries(promos.promociones.filter((p) => p.producto_id && p.hora_inicio).map((p) => [p.producto_id, p]))
        );
      })
      .catch(() => {});
  }, []);

  const promoLimitante = items.map((i) => promosVentana[i.producto_id]).find(Boolean) || null;
  const slots = useMemo(() => generarSlots(Boolean(promoLimitante)), [promoLimitante]);

  // Si el carrito pasa a tener (o dejar de tener) un producto de horario
  // limitado, los slots disponibles cambian de raíz — no tiene caso
  // conservar una selección que ya no aparece en la lista nueva.
  useEffect(() => {
    setSlotElegido(null);
  }, [slots]);

  const puedeAplicarCreditos = config?.modalidad === "credito_valor_mxn" && Number(saldo?.creditos_disponibles) > 0;
  const saldoDisponibleMxn = puedeAplicarCreditos ? Number(saldo.creditos_disponibles) * Number(config.valor_cd_mxn) : 0;
  const creditosAplicadosMxn = aplicarCreditos ? Math.min(saldoDisponibleMxn, total) : 0;

  // Saldo a favor (monedero) — independiente de la modalidad de recompensa,
  // viene de pedidos pagados en línea que luego se cancelaron.
  const puedeAplicarMonedero = Number(saldo?.saldo_monedero_mxn) > 0;
  const monederoAplicadoMxn = aplicarMonedero
    ? Math.min(Number(saldo?.saldo_monedero_mxn || 0), Math.max(0, total - creditosAplicadosMxn))
    : 0;

  // Canje de producto gratis en línea (modalidades credito_umbral/visitas) —
  // se revalida en el backend al confirmar, esto es solo para mostrar la
  // opción; nunca se confía en esto para el descuento real.
  const puedeCanjearProducto =
    (config?.modalidad === "credito_umbral" && Number(saldo?.creditos_disponibles) >= Number(config.umbral_cd)) ||
    (config?.modalidad === "visitas" && Number(saldo?.visitas_disponibles) >= Number(config.umbral_visitas));
  const productosElegibles = puedeCanjearProducto ? config.productos_elegibles || [] : [];
  const productoElegidoInfo = productosElegibles.find((p) => p.id === productoCanjeado);

  const porPagarEnCaja = Math.max(0, total - creditosAplicadosMxn - monederoAplicadoMxn);

  async function confirmar() {
    setError("");
    if (!items.length) return setError("Tu carrito está vacío.");
    if (!slotElegido) return setError("Elige una hora de recolección.");
    setEnviando(true);
    try {
      const { pedido } = await api.post("/pedidos", {
        items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, extra_ids: i.extras.map((e) => e.id) })),
        hora_pickup: slotElegido.toISOString(),
        creditos_aplicados_mxn: creditosAplicadosMxn || undefined,
        monedero_aplicado_mxn: monederoAplicadoMxn || undefined,
        metodo_pago: metodoPago === "mercadopago" ? "liga_mp" : "caja",
        canjear_producto_id: productoCanjeado || undefined,
      });
      vaciar();

      if (metodoPago === "mercadopago") {
        try {
          const { url } = await api.post(`/pagos/mercadopago/liga/${pedido.id}`, {});
          await Linking.openURL(url);
        } catch {
          // El pedido ya se creó — no se pierde. Si la liga falla aquí, el
          // botón de pago sigue disponible en el detalle del pedido para reintentar.
        }
      }

      // push (no replace): así queda "Carrito" debajo en la pila y se puede
      // volver — con replace se perdía por completo la barra de pestañas.
      router.push(`/pedido/${pedido.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={estilos.titulo}>Carrito</Text>
      {items.length === 0 ? (
        <Text style={estilos.vacio}>Tu carrito está vacío.</Text>
      ) : (
        items.map((i) => (
          <View key={i.id} style={estilos.itemFila}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.itemNombre}>{i.nombre}</Text>
              {i.extras.length ? <Text style={estilos.itemExtras}>{i.extras.map((e) => e.nombre).join(", ")}</Text> : null}
              <Text style={estilos.itemPrecio}>${(i.precio_unitario * i.cantidad).toFixed(0)}</Text>
            </View>
            <View style={estilos.controlCantidad}>
              <Pressable onPress={() => cambiarCantidad(i.id, i.cantidad - 1)}>
                <Text style={estilos.botonMini}>−</Text>
              </Pressable>
              <Text style={estilos.numeroCantidad}>{i.cantidad}</Text>
              <Pressable onPress={() => cambiarCantidad(i.id, i.cantidad + 1)}>
                <Text style={estilos.botonMini}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => quitar(i.id)}>
              <Text style={estilos.quitar}>Quitar</Text>
            </Pressable>
          </View>
        ))
      )}

      {items.length > 0 ? (
        <>
          <View style={estilos.separador} />

          <Text style={estilos.seccionTitulo}>Hora de recolección</Text>
          {promoLimitante ? (
            <Text style={estilos.notaVentana}>
              "{promoLimitante.titulo}" es de horario limitado — tu pedido debe recogerse máximo 30 min después de hacerlo.
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {slots.map((s) => {
              const activo = slotElegido?.getTime() === s.getTime();
              return (
                <Pressable key={s.getTime()} style={[estilos.chipSlot, activo && estilos.chipSlotActivo]} onPress={() => setSlotElegido(s)}>
                  <Text style={[estilos.textoChip, activo && estilos.textoChipActivo]}>
                    {s.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {puedeAplicarCreditos ? (
            <Pressable style={estilos.filaCreditos} onPress={() => setAplicarCreditos((v) => !v)}>
              <Text style={estilos.itemNombre}>
                {aplicarCreditos ? "☑" : "☐"} Aplicar créditos (tienes ${saldoDisponibleMxn.toFixed(0)} disponibles)
              </Text>
            </Pressable>
          ) : null}

          {puedeAplicarMonedero ? (
            <Pressable style={estilos.filaCreditos} onPress={() => setAplicarMonedero((v) => !v)}>
              <Text style={estilos.itemNombre}>
                {aplicarMonedero ? "☑" : "☐"} Usar tu saldo a favor (tienes ${Number(saldo.saldo_monedero_mxn).toFixed(0)})
              </Text>
            </Pressable>
          ) : null}

          {productosElegibles.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={estilos.seccionTitulo}>🎉 Tu recompensa está lista — elige tu gratis</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {productosElegibles.map((p) => {
                  const activo = productoCanjeado === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[estilos.chipSlot, activo && estilos.chipSlotActivo]}
                      onPress={() => setProductoCanjeado(activo ? null : p.id)}
                    >
                      <Text style={[estilos.textoChip, activo && estilos.textoChipActivo]}>{p.nombre}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {porPagarEnCaja > 0 ? (
            <View style={estilos.selectorPago}>
              <Text style={estilos.seccionTitulo}>¿Cómo vas a pagar?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[estilos.chipPago, metodoPago === "caja" && estilos.chipPagoActivo]}
                  onPress={() => setMetodoPago("caja")}
                >
                  <Text style={[estilos.textoChip, metodoPago === "caja" && estilos.textoChipActivo]}>Pagar en caja</Text>
                </Pressable>
                <Pressable
                  style={[estilos.chipPago, metodoPago === "mercadopago" && estilos.chipPagoActivo]}
                  onPress={() => setMetodoPago("mercadopago")}
                >
                  <Text style={[estilos.textoChip, metodoPago === "mercadopago" && estilos.textoChipActivo]}>Mercado Pago</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={estilos.resumen}>
            <FilaResumen estilos={estilos} etiqueta="Total" valor={total} />
            {creditosAplicadosMxn > 0 ? <FilaResumen estilos={estilos} etiqueta="Cubierto con créditos" valor={-creditosAplicadosMxn} /> : null}
            {monederoAplicadoMxn > 0 ? <FilaResumen estilos={estilos} etiqueta="Cubierto con tu saldo" valor={-monederoAplicadoMxn} /> : null}
            {productoElegidoInfo ? <Text style={estilos.notaVentana}>🎁 {productoElegidoInfo.nombre} — gratis con tu recompensa</Text> : null}
            <FilaResumen
              estilos={estilos}
              etiqueta={porPagarEnCaja <= 0 ? "Cubierto" : metodoPago === "mercadopago" ? "Por pagar en línea" : "Por pagar en caja"}
              valor={porPagarEnCaja}
              destacado
            />
          </View>

          <Text style={estilos.aviso}>Si no recoges tu pedido, se aplica una penalización a tu saldo/avance.</Text>

          {error ? <Text style={estilos.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [estilos.botonConfirmar, pressed && estilos.botonPresionado]}
            onPress={confirmar}
            disabled={enviando}
          >
            {enviando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={estilos.textoBoton}>{metodoPago === "mercadopago" && porPagarEnCaja > 0 ? "Confirmar y pagar" : "Confirmar pedido"}</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
    </SafeAreaView>
  );
}

function FilaResumen({ estilos, etiqueta, valor, destacado }) {
  return (
    <View style={estilos.filaResumenItem}>
      <Text style={[estilos.resumenEtiqueta, destacado && estilos.resumenDestacado]}>{etiqueta}</Text>
      <Text style={[estilos.resumenValor, destacado && estilos.resumenDestacado]}>${valor.toFixed(0)}</Text>
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    titulo: { fontSize: 18, fontWeight: "700", color: colores.texto },
    vacio: { textAlign: "center", color: colores.textoMuted, marginTop: 40 },
    itemFila: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colores.superficie, borderRadius: radios.medio, padding: 12, ...sombra.suave },
    itemNombre: { fontSize: 14, fontWeight: "600", color: colores.texto },
    itemExtras: { fontSize: 11.5, color: colores.textoMuted, marginTop: 2 },
    itemPrecio: { fontSize: 13, color: colores.texto, marginTop: 4 },
    controlCantidad: { flexDirection: "row", alignItems: "center", gap: 10 },
    botonMini: { fontSize: 18, color: colores.acento, paddingHorizontal: 6 },
    numeroCantidad: { fontSize: 14, fontWeight: "700", minWidth: 18, textAlign: "center" },
    quitar: { fontSize: 12, color: colores.peligro },
    separador: { height: 1, backgroundColor: colores.borde },
    seccionTitulo: { fontSize: 14, fontWeight: "600", color: colores.texto },
    notaVentana: { fontSize: 12, color: colores.acento, fontWeight: "500", lineHeight: 17 },
    selectorPago: { gap: 8 },
    chipPago: { flex: 1, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
    chipPagoActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
    chipSlot: { borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    chipSlotActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
    textoChip: { fontSize: 13, color: colores.texto },
    textoChipActivo: { color: "#fff", fontWeight: "600" },
    filaCreditos: { paddingVertical: 6 },
    resumen: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, padding: 14, gap: 6 },
    filaResumenItem: { flexDirection: "row", justifyContent: "space-between" },
    resumenEtiqueta: { fontSize: 13, color: colores.textoMuted },
    resumenValor: { fontSize: 13, color: colores.texto },
    resumenDestacado: { fontSize: 15, fontWeight: "700", color: colores.texto },
    aviso: { fontSize: 12, color: colores.textoMuted, fontStyle: "italic" },
    error: { color: colores.peligro, fontSize: 13 },
    botonConfirmar: { backgroundColor: colores.acento, borderRadius: radios.medio, paddingVertical: 15, alignItems: "center", ...sombra.media },
    botonPresionado: { opacity: 0.9, transform: [{ scale: 0.98 }] },
    textoBoton: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
