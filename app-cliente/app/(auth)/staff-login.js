import { useState, useMemo } from "react";
import { Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { guardarTokenStaff } from "../../lib/session";
import { useSession } from "../../lib/contextoSesion";
import { useTema } from "../../lib/contextoTema";
import { PANEL_URL } from "../../lib/config";

export default function StaffLogin() {
  const router = useRouter();
  const { refrescar } = useSession();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    setError("");
    if (!nombreUsuario.trim() || !password) return setError("Falta usuario o contraseña.");
    setCargando(true);
    try {
      const respuesta = await api.post("/auth/staff/login", { nombre_usuario: nombreUsuario.trim(), password });
      // Se guarda ya (para que las siguientes llamadas API traigan sesión),
      // pero refrescar() se retrasa si debe cambiar contraseña — así el
      // guard de rutas no salta a (staff) hasta que la cambie.
      await guardarTokenStaff(respuesta.token);
      if (respuesta.debe_cambiar_password) {
        router.push("/(auth)/staff-cambiar-password");
        return;
      }
      await refrescar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <Text style={estilos.titulo}>Entrar como staff</Text>
      <TextInput
        style={estilos.input}
        placeholder="Usuario"
        value={nombreUsuario}
        onChangeText={setNombreUsuario}
        autoCapitalize="none"
      />
      <TextInput style={estilos.input} placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      <Pressable style={estilos.boton} onPress={entrar} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Entrar</Text>}
      </Pressable>
      <Pressable onPress={() => Linking.openURL(`${PANEL_URL}/#/recuperar`)}>
        <Text style={estilos.link}>¿Olvidaste tu contraseña?</Text>
      </Pressable>
      <Pressable onPress={() => router.back()}>
        <Text style={estilos.link}>Volver</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 24, justifyContent: "center", gap: 12 },
    titulo: { fontSize: 20, fontWeight: "700", color: colores.texto, marginBottom: 6 },
    input: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colores.texto },
    error: { color: colores.peligro, fontSize: 13 },
    boton: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 4 },
    textoBoton: { color: "#fff", fontWeight: "600", fontSize: 15 },
    link: { textAlign: "center", color: colores.textoMuted, fontSize: 13, marginTop: 10 },
  });
}
