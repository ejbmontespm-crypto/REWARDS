import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Dimensions, Animated, Vibration } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import Logo from "../../components/Logo";
import PedidoProgreso, { ETIQUETA_PASO_PEDIDO } from "../../components/PedidoProgreso";
import { radios, tipografia, sombra } from "../../constants/theme";

const TAMANO_CROISSANT = 110;
const ANCHO_TARJETA_PEDIDO = Dimensions.get("window").width - 40; // 40 = padding de 20 a cada lado del ScrollView de Inicio

/** Croissant que se va llenando — progreso de la RECOMPENSA de lealtad (las
 *  3 modalidades), independiente de las tazas (esas son del PEDIDO). Mismo
 *  truco de recorte por altura; si no se han subido los croissants desde
 *  Apariencia, no se pinta nada y el llamador cae al texto plano. */
function CroissantProgreso({ vacioUrl, llenoUrl, proporcion }) {
  if (!vacioUrl || !llenoUrl) return null;
  return (
    <View style={{ width: TAMANO_CROISSANT, height: TAMANO_CROISSANT }}>
      <Image source={{ uri: vacioUrl }} style={{ position: "absolute", width: TAMANO_CROISSANT, height: TAMANO_CROISSANT }} resizeMode="contain" />
      <View
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: TAMANO_CROISSANT * Math.min(1, Math.max(0, proporcion)), overflow: "hidden" }}
      >
        <Image
          source={{ uri: llenoUrl }}
          style={{ position: "absolute", bottom: 0, width: TAMANO_CROISSANT, height: TAMANO_CROISSANT }}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

/** Progreso hacia la recompensa según la modalidad activa — cada una tiene
 *  su propio "cuánto le falta" (plan-maestro §5): visitas y créditos por
 *  umbral son fracción de un número entero; créditos por valor en pesos no
 *  tiene un umbral fijo, así que se usa el precio del producto más barato
 *  del menú como referencia ("cuánto te falta para poder comprar algo"). */
function progresoRecompensa(saldo, config, precioMasBarato) {
  if (!config) return null;
  if (config.modalidad === "visitas") {
    const actual = saldo.visitas_disponibles;
    const meta = config.umbral_visitas;
    return {
      proporcion: actual / meta,
      titulo: `${actual} de ${meta}`,
      sub: actual >= meta ? "¡Ya tienes tu recompensa lista!" : `Te faltan ${meta - actual} visitas para tu recompensa`,
    };
  }
  if (config.modalidad === "credito_umbral") {
    const actual = saldo.creditos_disponibles;
    const meta = config.umbral_cd;
    return {
      proporcion: actual / meta,
      titulo: `${actual} de ${meta}`,
      sub: actual >= meta ? "¡Ya tienes tu recompensa lista!" : `Te faltan ${meta - actual} créditos para tu recompensa`,
    };
  }
  if (config.modalidad === "credito_valor_mxn") {
    const pesos = saldo.creditos_disponibles * Number(config.valor_cd_mxn || 1);
    if (!precioMasBarato) return { proporcion: 0, titulo: `$${pesos.toFixed(0)} MXN`, sub: `${saldo.creditos_disponibles} créditos disponibles` };
    return {
      proporcion: pesos / precioMasBarato,
      titulo: `$${pesos.toFixed(0)} MXN`,
      sub:
        pesos >= precioMasBarato
          ? `Ya te alcanza para tu producto más barato ($${precioMasBarato.toFixed(0)})`
          : `Te faltan $${(precioMasBarato - pesos).toFixed(0)} para tu producto más barato`,
    };
  }
  return null;
}

export default function Inicio() {
  const router = useRouter();
  const { colores, logoUrl, logoQrUrl, croissantGrisUrl, croissantDoradoUrl } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [datos, setDatos] = useState(null);
  const [config, setConfig] = useState(null);
  const [precioMasBarato, setPrecioMasBarato] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [redimiendo, setRedimiendo] = useState(false);
  const [paginaPedido, setPaginaPedido] = useState(0);
  const escalaQr = useRef(new Animated.Value(1)).current;
  const escalaCelebracion = useRef(new Animated.Value(1)).current;
  const recompensaListaAnterior = useRef(false);

  const cargar = useCallback(async (esRefresh) => {
    esRefresh ? setRefrescando(true) : setCargando(true);
    setError("");
    try {
      const [me, activa, prods] = await Promise.all([
        api.get("/clientes/me"),
        api.get("/configuracion-recompensa/activa"),
        api.get("/productos"),
      ]);
      setDatos(me);
      setConfig(activa.configuracion);
      const disponibles = prods.productos.filter((p) => p.disponible);
      setPrecioMasBarato(disponibles.length ? Math.min(...disponibles.map((p) => Number(p.precio))) : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar tu información.");
    } finally {
      esRefresh ? setRefrescando(false) : setCargando(false);
    }
  }, []);

  // Refresco silencioso de fondo — sin esto, el estatus de "Tus pedidos en
  // curso" solo se veía actualizado al salir y volver a entrar a Inicio
  // (useFocusEffect solo corre al enfocar la pestaña, no mientras ya está
  // abierta). No toca cargando/refrescando para no parpadear la pantalla.
  const revisarPedidosSilencioso = useCallback(async () => {
    try {
      const me = await api.get("/clientes/me");
      setDatos(me);
    } catch {
      /* se reintenta en el siguiente ciclo */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar(false);
      const intervalo = setInterval(revisarPedidosSilencioso, 10000);
      return () => clearInterval(intervalo);
    }, [cargar, revisarPedidosSilencioso])
  );

  // Auditoría UX punto 4: el momento en que la recompensa se pone lista es
  // EL momento emocional del programa de lealtad — antes solo cambiaba un
  // texto, sin ningún aviso. Un pop + vibración corta, una sola vez (no en
  // cada refresco mientras siga lista), para no ser molesto.
  useEffect(() => {
    if (datos?.recompensa_lista && !recompensaListaAnterior.current) {
      Vibration.vibrate([0, 60, 60, 60]);
      escalaCelebracion.setValue(0.85);
      Animated.spring(escalaCelebracion, { toValue: 1, useNativeDriver: true, friction: 4, tension: 60 }).start();
    }
    recompensaListaAnterior.current = Boolean(datos?.recompensa_lista);
  }, [datos?.recompensa_lista, escalaCelebracion]);

  function presionarQr(hacia) {
    Animated.spring(escalaQr, { toValue: hacia, useNativeDriver: true, friction: 5 }).start();
  }

  async function redimir() {
    setRedimiendo(true);
    try {
      await api.post("/solicitudes-canje", {});
      await cargar(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar la redención.");
    } finally {
      setRedimiendo(false);
    }
  }

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  const progreso = datos?.saldo ? progresoRecompensa(datos.saldo, config, precioMasBarato) : null;

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor={colores.acento} />}
    >
      <View style={estilos.encabezado}>
        <Text style={estilos.saludo}>Hola, {datos?.cliente?.nombre}</Text>
        <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }} onPress={() => router.push("/notificaciones")}>
          <Ionicons name="notifications-outline" size={24} color={colores.texto} />
        </Pressable>
      </View>

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      <Animated.View style={[estilos.botonQrSombra, { transform: [{ scale: escalaQr }] }]}>
        <Pressable
          style={[estilos.botonQr, !logoQrUrl && estilos.botonQrFondo]}
          onPressIn={() => presionarQr(0.95)}
          onPressOut={() => presionarQr(1)}
          onPress={() => router.push("/mi-qr")}
        >
          {logoQrUrl ? (
            <Image source={{ uri: logoQrUrl }} style={estilos.imagenBotonQr} resizeMode="cover" />
          ) : (
            <>
              <Logo url={logoUrl} width={48} />
              <Text style={estilos.textoBotonQr}>Mi QR</Text>
            </>
          )}
        </Pressable>
      </Animated.View>

      <View style={estilos.tarjetaSaldo}>
        {progreso && croissantGrisUrl && croissantDoradoUrl ? (
          <>
            <CroissantProgreso vacioUrl={croissantGrisUrl} llenoUrl={croissantDoradoUrl} proporcion={progreso.proporcion} />
            <Text style={estilos.saldoTitulo}>{progreso.titulo}</Text>
            <Text style={estilos.saldoSub}>{progreso.sub}</Text>
          </>
        ) : progreso ? (
          <>
            <Text style={estilos.saldoTitulo}>{progreso.titulo}</Text>
            <Text style={estilos.saldoSub}>{progreso.sub}</Text>
          </>
        ) : (
          <Text style={estilos.saldoSub}>Todavía no hay una regla de recompensa activa.</Text>
        )}
      </View>

      {datos?.solicitud_canje_pendiente ? (
        <View style={estilos.bannerRecompensa}>
          <Text style={estilos.bannerTexto}>Listo — muéstrale esto al staff en caja para recoger tu recompensa.</Text>
        </View>
      ) : datos?.recompensa_lista ? (
        <Animated.View style={[estilos.bannerRecompensa, { transform: [{ scale: escalaCelebracion }] }]}>
          <Text style={estilos.bannerTexto}>🎉 ¡Tienes una recompensa lista para redimir!</Text>
          <Pressable
            style={({ pressed }) => [estilos.botonRedimir, pressed && estilos.botonPresionado]}
            onPress={redimir}
            disabled={redimiendo}
          >
            {redimiendo ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBotonRedimir}>Redimir</Text>}
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={estilos.seccionTitulo}>Tus pedidos en curso</Text>

        {datos?.pedidos_en_curso?.length ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(ev) => setPaginaPedido(Math.round(ev.nativeEvent.contentOffset.x / ANCHO_TARJETA_PEDIDO))}
            >
              {datos.pedidos_en_curso.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [estilos.tarjetaPedido, { width: ANCHO_TARJETA_PEDIDO }, pressed && estilos.tarjetaPresionada]}
                  onPress={() => router.push(`/pedido/${p.id}`)}
                >
                  {p.items?.length ? (
                    <Text style={estilos.pedidoItems}>{p.items.map((i) => `${i.cantidad}× ${i.producto_nombre}`).join(", ")}</Text>
                  ) : null}
                  <Text style={estilos.pedidoResumen}>Total: ${Number(p.total_mxn).toFixed(0)}</Text>
                  <PedidoProgreso estado={p.estado} tamanoTaza={26} />
                  <Text style={estilos.pedidoEstado}>Estado: {ETIQUETA_PASO_PEDIDO[p.estado] || p.estado}</Text>
                  <Text style={estilos.pedidoSub}>Toca para ver el detalle</Text>
                </Pressable>
              ))}
            </ScrollView>

            {datos.pedidos_en_curso.length > 1 ? (
              <View style={estilos.pistaDeslizar}>
                <Text style={estilos.pistaTexto}>‹ desliza para ver tus otros pedidos ›</Text>
                <View style={estilos.puntosPedido}>
                  {datos.pedidos_en_curso.map((_, i) => (
                    <View key={i} style={[estilos.puntoPedido, i === paginaPedido && estilos.puntoPedidoActivo]} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View style={estilos.tarjetaPedidoVacia}>
            <Text style={estilos.pedidoSub}>No tienes pedidos activos por ahora.</Text>
          </View>
        )}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    saludo: { fontSize: tipografia.lg, fontWeight: "700", color: colores.texto },
    error: { color: colores.peligro, fontSize: 13 },
    // La sombra vive en un View aparte del Pressable — el Pressable necesita
    // overflow:hidden para recortar la imagen a las esquinas redondeadas, y
    // overflow:hidden recorta también la sombra si están en el mismo nodo.
    botonQrSombra: {
      width: "48%",
      alignSelf: "center",
      aspectRatio: 1,
      borderRadius: radios.grande,
      backgroundColor: colores.fondo,
      ...sombra.media,
    },
    botonQr: {
      flex: 1,
      borderRadius: radios.grande,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      overflow: "hidden",
    },
    // Solo para el diseño de respaldo (sin imagen subida) — el color de
    // fondo va aquí (no en el contenedor de la sombra), para que cuando SÍ
    // hay imagen (que ya trae su propio fondo dibujado) no se asome un
    // borde de otro color alrededor.
    botonQrFondo: { backgroundColor: colores.acento },
    imagenBotonQr: { width: "100%", height: "100%" },
    textoBotonQr: { color: "#fff", fontSize: tipografia.md, fontWeight: "700" },
    tarjetaSaldo: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 20, alignItems: "center", gap: 4, ...sombra.suave },
    saldoTitulo: { fontSize: tipografia.xl, fontWeight: "700", color: colores.texto },
    saldoSub: { fontSize: tipografia.sm, color: colores.textoMuted },
    bannerRecompensa: { backgroundColor: "#fff7e6", borderWidth: 1, borderColor: "#f0dba9", borderRadius: radios.grande, padding: 16, gap: 10, ...sombra.suave },
    bannerTexto: { fontSize: tipografia.base, fontWeight: "600", color: colores.texto },
    botonRedimir: { backgroundColor: colores.acento, borderRadius: radios.chico, paddingVertical: 11, alignItems: "center" },
    botonPresionado: { opacity: 0.85, transform: [{ scale: 0.97 }] },
    textoBotonRedimir: { color: "#fff", fontWeight: "600" },
    seccionTitulo: { fontSize: tipografia.base, fontWeight: "700", color: colores.texto },
    tarjetaPedido: { backgroundColor: colores.superficie, borderRadius: radios.medio, padding: 16, gap: 10, ...sombra.suave },
    tarjetaPresionada: { opacity: 0.9, transform: [{ scale: 0.98 }] },
    tarjetaPedidoVacia: { backgroundColor: colores.superficie, borderRadius: radios.medio, padding: 20, alignItems: "center", ...sombra.suave },
    pedidoTitulo: { fontSize: 14, fontWeight: "700", color: colores.texto },
    pedidoItems: { fontSize: 12, color: colores.textoMuted, textAlign: "center" },
    pedidoResumen: { fontSize: 13, fontWeight: "700", color: colores.texto, textAlign: "center" },
    pedidoEstado: { fontSize: 13, fontWeight: "600", color: colores.texto, textAlign: "center" },
    pedidoSub: { fontSize: 12, color: colores.textoMuted, marginTop: 2, textAlign: "center" },
    pistaDeslizar: { alignItems: "center", gap: 6 },
    pistaTexto: { fontSize: 11, color: colores.textoMuted },
    puntosPedido: { flexDirection: "row", gap: 5 },
    puntoPedido: { width: 6, height: 6, borderRadius: 3, backgroundColor: colores.borde },
    puntoPedidoActivo: { backgroundColor: colores.acento, width: 14 },
  });
}
