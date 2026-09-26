import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useCarrito } from "../../lib/contextoCarrito";
import { useTema } from "../../lib/contextoTema";

const DIAS_SEMANA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function textoVentanaPromo(promo) {
  if (!promo?.hora_inicio) return null;
  const dias = promo.dias_semana?.length ? promo.dias_semana.map((d) => DIAS_SEMANA_CORTO[d]).join(" ") : "Todos los días";
  return `⏱ ${dias} · ${promo.hora_inicio}–${promo.hora_fin} · recoger antes de 30 min`;
}

export default function Menu() {
  const router = useRouter();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const { items, agregar } = useCarrito();
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ventanaPorProducto, setVentanaPorProducto] = useState({});
  const [elegibilidad, setElegibilidad] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [productoAbierto, setProductoAbierto] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      setCargando(true);
      Promise.all([api.get("/categorias-producto"), api.get("/productos"), api.get("/clientes/me"), api.get("/promociones")])
        .then(([cats, prods, me, promos]) => {
          if (!vivo) return;
          setCategorias(cats.categorias);
          setProductos(prods.productos);
          setElegibilidad(me.elegibilidad_pedidos);
          setVentanaPorProducto(
            Object.fromEntries(promos.promociones.filter((p) => p.producto_id && p.hora_inicio).map((p) => [p.producto_id, p]))
          );
          setError("");
        })
        .catch((err) => vivo && setError(err instanceof ApiError ? err.message : "No se pudo cargar el menú."))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [])
  );

  const puedeOrdenar = elegibilidad?.pedidos_en_linea_activos_global && elegibilidad?.dentro_de_horario && elegibilidad?.elegible;

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      {error ? (
        <Text style={estilos.error}>{error}</Text>
      ) : !elegibilidad?.pedidos_en_linea_activos_global ? (
        <View style={estilos.banner}>
          <Text style={estilos.bannerTexto}>Pedidos en línea no disponibles por el momento — pásate al mostrador.</Text>
        </View>
      ) : !elegibilidad?.dentro_de_horario ? (
        <View style={estilos.banner}>
          <Text style={estilos.bannerTexto}>
            Fuera de horario de servicio — abrimos de {elegibilidad.horario_servicio.apertura} a {elegibilidad.horario_servicio.cierre}.
          </Text>
        </View>
      ) : !elegibilidad?.elegible ? (
        <View style={estilos.banner}>
          <Text style={estilos.bannerTexto}>
            Los pedidos en línea se habilitan después de tu primera compra en caja (llevas $
            {elegibilidad.gasto_acumulado_periodo_mxn} de ${elegibilidad.gasto_minimo_mxn}).
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 90 }}>
        {categorias.map((cat) => {
          const productosCategoria = productos.filter((p) => p.categoria_id === cat.id);
          if (!productosCategoria.length) return null;
          return (
            <View key={cat.id} style={{ gap: 10 }}>
              <Text style={estilos.tituloCategoria}>{cat.nombre}</Text>
              {productosCategoria.map((p) => (
                <Pressable
                  key={p.id}
                  style={[estilos.tarjetaProducto, !p.disponible && estilos.tarjetaAgotada]}
                  onPress={() => puedeOrdenar && p.disponible && setProductoAbierto(p)}
                  disabled={!puedeOrdenar || !p.disponible}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.nombreProducto}>{p.nombre}</Text>
                    {p.descripcion ? <Text style={estilos.descripcionProducto}>{p.descripcion}</Text> : null}
                    {ventanaPorProducto[p.id] ? <Text style={estilos.ventanaTexto}>{textoVentanaPromo(ventanaPorProducto[p.id])}</Text> : null}
                    {!p.disponible ? <Text style={estilos.agotadoTexto}>Agotado</Text> : null}
                  </View>
                  <Text style={estilos.precioProducto}>${Number(p.precio).toFixed(0)}</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {items.length > 0 ? (
        <Pressable style={estilos.botonCarrito} onPress={() => router.push("/carrito")}>
          <Text style={estilos.textoBotonCarrito}>Ver carrito ({items.reduce((s, i) => s + i.cantidad, 0)})</Text>
        </Pressable>
      ) : null}

      {productoAbierto ? (
        <ModalProducto
          producto={productoAbierto}
          onCerrar={() => setProductoAbierto(null)}
          onAgregar={agregar}
          colores={colores}
          estilos={estilos}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ModalProducto({ producto, onCerrar, onAgregar, colores, estilos }) {
  const [cantidad, setCantidad] = useState(1);
  const [extras, setExtras] = useState([]);
  const [extrasSeleccionados, setExtrasSeleccionados] = useState([]);
  const [cargandoExtras, setCargandoExtras] = useState(true);

  useEffect(() => {
    api
      .get(`/productos/${producto.id}`)
      .then((d) => setExtras(d.extras.filter((e) => e.disponible)))
      .catch(() => {})
      .finally(() => setCargandoExtras(false));
  }, [producto.id]);

  function alternarExtra(extra) {
    setExtrasSeleccionados((prev) =>
      prev.some((e) => e.id === extra.id) ? prev.filter((e) => e.id !== extra.id) : [...prev, extra]
    );
  }

  const precioUnitario = Number(producto.precio) + extrasSeleccionados.reduce((s, e) => s + Number(e.costo), 0);

  function confirmar() {
    onAgregar({
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_unitario: precioUnitario,
      cantidad,
      extras: extrasSeleccionados.map((e) => ({ id: e.id, nombre: e.nombre, costo: Number(e.costo) })),
    });
    onCerrar();
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.overlayModal}>
        <View style={estilos.hojaModal}>
          <Text style={estilos.tituloModal}>{producto.nombre}</Text>

          {cargandoExtras ? (
            <ActivityIndicator color={colores.acento} />
          ) : extras.length ? (
            <View style={{ gap: 8 }}>
              <Text style={estilos.subtituloModal}>Extras</Text>
              {extras.map((e) => {
                const activo = extrasSeleccionados.some((s) => s.id === e.id);
                return (
                  <Pressable key={e.id} style={estilos.filaExtra} onPress={() => alternarExtra(e)}>
                    <Text style={estilos.textoExtra}>
                      {activo ? "☑" : "☐"} {e.nombre}
                    </Text>
                    <Text style={estilos.textoExtra}>+${Number(e.costo).toFixed(0)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={estilos.filaCantidad}>
            <Pressable style={estilos.botonCantidad} onPress={() => setCantidad((c) => Math.max(1, c - 1))}>
              <Text style={estilos.textoCantidad}>−</Text>
            </Pressable>
            <Text style={estilos.numeroCantidad}>{cantidad}</Text>
            <Pressable style={estilos.botonCantidad} onPress={() => setCantidad((c) => c + 1)}>
              <Text style={estilos.textoCantidad}>+</Text>
            </Pressable>
          </View>

          <Pressable style={estilos.botonAgregar} onPress={confirmar}>
            <Text style={estilos.textoBotonCarrito}>Agregar — ${(precioUnitario * cantidad).toFixed(0)}</Text>
          </Pressable>
          <Pressable onPress={onCerrar}>
            <Text style={estilos.linkCancelar}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    error: { color: colores.peligro, fontSize: 13, padding: 16 },
    banner: { backgroundColor: "#fff7e6", borderBottomWidth: 1, borderColor: "#f0dba9", padding: 14 },
    bannerTexto: { fontSize: 12.5, color: colores.texto },
    tituloCategoria: { fontSize: 15, fontWeight: "700", color: colores.texto },
    tarjetaProducto: { flexDirection: "row", backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, padding: 14, alignItems: "center" },
    tarjetaAgotada: { opacity: 0.5 },
    nombreProducto: { fontSize: 14.5, fontWeight: "600", color: colores.texto },
    descripcionProducto: { fontSize: 12, color: colores.textoMuted, marginTop: 2 },
    ventanaTexto: { fontSize: 11, color: colores.acento, fontWeight: "600", marginTop: 3 },
    agotadoTexto: { fontSize: 11.5, color: colores.peligro, marginTop: 3, fontWeight: "600" },
    precioProducto: { fontSize: 14.5, fontWeight: "700", color: colores.texto },
    botonCarrito: { position: "absolute", bottom: 20, left: 20, right: 20, backgroundColor: colores.acento, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
    textoBotonCarrito: { color: "#fff", fontWeight: "700", fontSize: 15 },

    overlayModal: { flex: 1, backgroundColor: "rgba(32,30,26,0.4)", justifyContent: "flex-end" },
    hojaModal: { backgroundColor: colores.superficie, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, gap: 16 },
    tituloModal: { fontSize: 17, fontWeight: "700", color: colores.texto },
    subtituloModal: { fontSize: 12.5, color: colores.textoMuted, fontWeight: "600" },
    filaExtra: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    textoExtra: { fontSize: 14, color: colores.texto },
    filaCantidad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
    botonCantidad: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colores.borde, alignItems: "center", justifyContent: "center" },
    textoCantidad: { fontSize: 18, color: colores.texto },
    numeroCantidad: { fontSize: 16, fontWeight: "700", color: colores.texto, minWidth: 24, textAlign: "center" },
    botonAgregar: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
    linkCancelar: { textAlign: "center", color: colores.textoMuted, fontSize: 13 },
  });
}
