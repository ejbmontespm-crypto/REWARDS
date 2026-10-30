import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Animated, Vibration } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import Logo from "../../components/Logo";
import { ETIQUETA_PASO_PEDIDO } from "../../components/PedidoProgreso";
import { radios, tipografia, sombra } from "../../constants/theme";

const TAMANO_CROISSANT = 110;

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
  const { colores, logoUrl, croissantGrisUrl, croissantDoradoUrl } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [datos, setDatos] = useState(null);
  const [config, setConfig] = useState(null);
  const [precioMasBarato, setPrecioMasBarato] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [notificacionesNoLeidas, setNotificacionesNoLeidas] = useState(0);
  const escalaCelebracion = useRef(new Animated.Value(1)).current;
  const recompensaListaAnterior = useRef(false);

  const cargar = useCallback(async (esRefresh) => {
    esRefresh ? setRefrescando(true) : setCargando(true);
    setError("");
    try {
      const [me, activa, prods, notifs] = await Promise.all([
        api.get("/clientes/me"),
        api.get("/configuracion-recompensa/activa"),
        api.get("/productos"),
        api.get("/notificaciones/mias"),
      ]);
      setDatos(me);
      setConfig(activa.configuracion);
      const disponibles = prods.productos.filter((p) => p.disponible);
      setPrecioMasBarato(disponibles.length ? Math.min(...disponibles.map((p) => Number(p.precio))) : null);
      setNotificacionesNoLeidas(notifs.notificaciones.filter((n) => !n.leido_en).length);
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
      const [me, notifs] = await Promise.all([api.get("/clientes/me"), api.get("/notificaciones/mias")]);
      setDatos(me);
      setNotificacionesNoLeidas(notifs.notificaciones.filter((n) => !n.leido_en).length);
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
        <Pressable
          style={({ pressed }) => [estilos.grupoPerfil, pressed && { opacity: 0.6 }]}
          onPress={() => router.push("/perfil")}
        >
          <View style={estilos.avatar}>
            <Text style={estilos.avatarTexto}>{(datos?.cliente?.nombre || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={estilos.saludo}>Hola, {datos?.cliente?.nombre}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => pressed && { opacity: 0.6 }} onPress={() => router.push("/notificaciones")}>
          <View>
            <Ionicons name="notifications-outline" size={24} color={colores.texto} />
            {notificacionesNoLeidas > 0 ? (
              <View style={estilos.badgeCampana}>
                <Text style={estilos.textoBadgeCampana}>{notificacionesNoLeidas > 9 ? "9+" : notificacionesNoLeidas}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      <View style={estilos.contenedorLogo}>
        <Logo url={logoUrl} width={150} />
      </View>

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
            onPress={() => router.push("/carrito?tab=nuevo")}
          >
            <Text style={estilos.textoBotonRedimir}>Redimir</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {datos?.pedidos_en_curso?.length ? (
        <Pressable
          style={({ pressed }) => [estilos.resumenPedidos, pressed && estilos.resumenPedidosPresionado]}
          onPress={() => router.push("/carrito?tab=en_curso")}
        >
          <View style={estilos.resumenIcono}>
            <Ionicons name="receipt" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.resumenTitulo}>
              Tienes {datos.pedidos_en_curso.length} pedido{datos.pedidos_en_curso.length === 1 ? "" : "s"} en curso
            </Text>
            <Text style={estilos.resumenSub}>
              Más reciente: {ETIQUETA_PASO_PEDIDO[datos.pedidos_en_curso[0].estado] || datos.pedidos_en_curso[0].estado}
              {datos.pedidos_en_curso[0].folio ? ` — folio ${datos.pedidos_en_curso[0].folio}` : ""}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      ) : (
        <View style={estilos.resumenVacio}>
          <Ionicons name="cafe-outline" size={22} color={colores.textoMuted} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.resumenVacioTitulo}>Aún no tienes pedidos en curso</Text>
            <Text style={estilos.resumenVacioSub}>Arma uno desde el menú y aparecerá aquí.</Text>
          </View>
        </View>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    grupoPerfil: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colores.acento,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarTexto: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
    saludo: { fontSize: tipografia.lg, fontWeight: "700", color: colores.texto, flexShrink: 1 },
    badgeCampana: {
      position: "absolute",
      top: -4,
      right: -6,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colores.peligro,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    textoBadgeCampana: { color: "#fff", fontSize: 10, fontWeight: "700" },
    error: { color: colores.peligro, fontSize: 13 },
    contenedorLogo: { alignItems: "center", paddingVertical: 4 },
    tarjetaSaldo: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 20, alignItems: "center", gap: 4, ...sombra.suave },
    saldoTitulo: { fontSize: tipografia.xl, fontWeight: "700", color: colores.texto },
    saldoSub: { fontSize: tipografia.sm, color: colores.textoMuted },
    bannerRecompensa: { backgroundColor: "#fff7e6", borderWidth: 1, borderColor: "#f0dba9", borderRadius: radios.grande, padding: 16, gap: 10, ...sombra.suave },
    bannerTexto: { fontSize: tipografia.base, fontWeight: "600", color: colores.texto },
    botonRedimir: { backgroundColor: colores.acento, borderRadius: radios.chico, paddingVertical: 11, alignItems: "center" },
    botonPresionado: { opacity: 0.85, transform: [{ scale: 0.97 }] },
    textoBotonRedimir: { color: "#fff", fontWeight: "600" },
    resumenPedidos: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colores.acento,
      borderRadius: radios.grande,
      padding: 16,
      ...sombra.media,
    },
    resumenPedidosPresionado: { opacity: 0.92, transform: [{ scale: 0.99 }] },
    resumenIcono: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
    resumenTitulo: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
    resumenSub: { color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 2 },
    resumenVacio: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colores.superficie,
      borderRadius: radios.grande,
      padding: 16,
      borderWidth: 1,
      borderColor: colores.borde,
      borderStyle: "dashed",
    },
    resumenVacioTitulo: { fontSize: 13.5, fontWeight: "600", color: colores.texto },
    resumenVacioSub: { fontSize: 12, color: colores.textoMuted, marginTop: 2 },
  });
}
