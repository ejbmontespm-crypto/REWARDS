import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSession } from "../../lib/contextoSesion";
import { PANEL_URL } from "../../lib/config";
import { useTema } from "../../lib/contextoTema";

export default function Mas() {
  const router = useRouter();
  const { sesion, cerrarSesion } = useSession();
  const { colores, recargar: recargarTema } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const esAdmin = sesion?.rol === "admin";
  const [actualizandoTema, setActualizandoTema] = useState(false);
  const [temaActualizado, setTemaActualizado] = useState(false);

  async function actualizarTema() {
    setActualizandoTema(true);
    setTemaActualizado(false);
    await recargarTema();
    setActualizandoTema(false);
    setTemaActualizado(true);
    setTimeout(() => setTemaActualizado(false), 2500);
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <View style={estilos.tarjetaUsuario}>
        <Text style={estilos.nombreUsuario}>{sesion?.nombreUsuario}</Text>
        <Text style={estilos.rolUsuario}>{esAdmin ? "Admin" : "Staff"}</Text>
      </View>

      <Pressable style={estilos.opcion} onPress={() => router.push("/staff-buscar")}>
        <Text style={estilos.textoOpcion}>Buscar cliente (sin QR)</Text>
        <Text style={estilos.flecha}>›</Text>
      </Pressable>

      <Pressable style={estilos.opcion} onPress={() => router.push("/staff-impresora")}>
        <Text style={estilos.textoOpcion}>Impresora de etiquetas</Text>
        <Text style={estilos.flecha}>›</Text>
      </Pressable>

      {esAdmin ? (
        <Pressable style={estilos.opcion} onPress={() => Linking.openURL(`${PANEL_URL}/#/cuentas`)}>
          <Text style={estilos.textoOpcion}>Cuentas (abre el panel)</Text>
          <Text style={estilos.flecha}>↗</Text>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }} />

      <Pressable style={estilos.botonActualizarTema} onPress={actualizarTema} disabled={actualizandoTema}>
        {actualizandoTema ? (
          <ActivityIndicator color={colores.acento} size="small" />
        ) : (
          <Text style={estilos.textoActualizarTema}>{temaActualizado ? "✓ Colores actualizados" : "Actualizar apariencia"}</Text>
        )}
      </Pressable>

      <Pressable style={estilos.botonCerrarSesion} onPress={cerrarSesion}>
        <Text style={estilos.textoCerrarSesion}>Cerrar sesión</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 20, gap: 10 },
    tarjetaUsuario: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, padding: 16, marginBottom: 6 },
    nombreUsuario: { fontSize: 15, fontWeight: "700", color: colores.texto },
    rolUsuario: { fontSize: 12, color: colores.textoMuted, marginTop: 2, textTransform: "capitalize" },
    opcion: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, padding: 16 },
    textoOpcion: { fontSize: 14.5, fontWeight: "600", color: colores.texto },
    flecha: { fontSize: 16, color: colores.textoMuted },
    botonActualizarTema: { paddingVertical: 10, alignItems: "center" },
    textoActualizarTema: { color: colores.acento, fontWeight: "600", fontSize: 13 },
    botonCerrarSesion: { borderWidth: 1, borderColor: colores.peligro, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    textoCerrarSesion: { color: colores.peligro, fontWeight: "600", fontSize: 14 },
  });
}
