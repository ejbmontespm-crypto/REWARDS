import { useCallback, useMemo, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useTema } from "../../lib/contextoTema";
import Logo from "../../components/Logo";
import PedidoProgreso, { ETIQUETA_PASO_PEDIDO } from "../../components/PedidoProgreso";

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
  const { colores, logoUrl, logoQrUrl, croissantGrisUrl, croissantDoradoUrl } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [datos, setDatos] = useState(null);
  const [config, setConfig] = useState(null);
  const [precioMasBarato, setPrecioMasBarato] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState("");
  const [redimiendo, setRedimiendo] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      cargar(false);
    }, [cargar])
  );

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
        <Pressable onPress={() => router.push("/notificaciones")}>
          <Text style={estilos.campana}>🔔</Text>
        </Pressable>
      </View>

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      <Pressable style={estilos.botonQr} onPress={() => router.push("/mi-qr")}>
        {logoQrUrl ? (
          <Image source={{ uri: logoQrUrl }} style={estilos.imagenBotonQr} resizeMode="cover" />
        ) : (
          <>
            <Logo url={logoUrl} width={48} />
            <Text style={estilos.textoBotonQr}>Mi QR</Text>
          </>
        )}
      </Pressable>

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
        <View style={estilos.bannerRecompensa}>
          <Text style={estilos.bannerTexto}>¡Tienes una recompensa lista para redimir!</Text>
          <Pressable style={estilos.botonRedimir} onPress={redimir} disabled={redimiendo}>
            {redimiendo ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBotonRedimir}>Redimir</Text>}
          </Pressable>
        </View>
      ) : null}

      {datos?.pedido_en_curso ? (
        <Pressable style={estilos.tarjetaPedido} onPress={() => router.push(`/pedido/${datos.pedido_en_curso.id}`)}>
          <Text style={estilos.pedidoTitulo}>Pedido en curso</Text>
          <PedidoProgreso estado={datos.pedido_en_curso.estado} tamanoTaza={26} />
          <Text style={estilos.pedidoEstado}>Estado: {ETIQUETA_PASO_PEDIDO[datos.pedido_en_curso.estado] || datos.pedido_en_curso.estado}</Text>
          <Text style={estilos.pedidoSub}>Toca para ver el detalle</Text>
        </Pressable>
      ) : null}
    </ScrollView>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    saludo: { fontSize: 18, fontWeight: "700", color: colores.texto },
    campana: { fontSize: 20 },
    error: { color: colores.peligro, fontSize: 13 },
    botonQr: {
      backgroundColor: colores.acento,
      borderRadius: 20,
      width: "48%",
      alignSelf: "center",
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      elevation: 3,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    imagenBotonQr: { width: "100%", height: "100%", borderRadius: 20 },
    textoBotonQr: { color: "#fff", fontSize: 16, fontWeight: "700" },
    tarjetaSaldo: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 14, padding: 20, alignItems: "center", gap: 4 },
    saldoTitulo: { fontSize: 26, fontWeight: "700", color: colores.texto },
    saldoSub: { fontSize: 13, color: colores.textoMuted },
    bannerRecompensa: { backgroundColor: "#fff7e6", borderWidth: 1, borderColor: "#f0dba9", borderRadius: 12, padding: 16, gap: 10 },
    bannerTexto: { fontSize: 14, fontWeight: "600", color: colores.texto },
    botonRedimir: { backgroundColor: colores.acento, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
    textoBotonRedimir: { color: "#fff", fontWeight: "600" },
    tarjetaPedido: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16, gap: 10 },
    pedidoTitulo: { fontSize: 14, fontWeight: "700", color: colores.texto },
    pedidoEstado: { fontSize: 13, fontWeight: "600", color: colores.texto, textAlign: "center" },
    pedidoSub: { fontSize: 12, color: colores.textoMuted, marginTop: 2, textAlign: "center" },
  });
}
