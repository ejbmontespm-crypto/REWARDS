import { useState, useMemo } from "react";
import { Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/contextoSesion";
import { useTema } from "../../lib/contextoTema";

export default function StaffCambiarPassword() {
  const { refrescar } = useSession();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function guardar() {
    setError("");
    if (!passwordActual || !passwordNueva) return setError("Faltan campos.");
    if (passwordNueva.length < 8) return setError("La contraseña nueva debe tener al menos 8 caracteres.");
    setCargando(true);
    try {
      await api.post("/auth/staff/cambiar-password", { password_actual: passwordActual, password_nueva: passwordNueva });
      await refrescar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      <Text style={estilos.titulo}>Cambia tu contraseña</Text>
      <Text style={estilos.subtitulo}>Entraste con una contraseña temporal — elige una nueva antes de continuar.</Text>
      <TextInput
        style={estilos.input}
        placeholder="Contraseña actual (la temporal)"
        value={passwordActual}
        onChangeText={setPasswordActual}
        secureTextEntry
      />
      <TextInput style={estilos.input} placeholder="Contraseña nueva" value={passwordNueva} onChangeText={setPasswordNueva} secureTextEntry />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      <Pressable style={estilos.boton} onPress={guardar} disabled={cargando}>
        {cargando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Guardar y continuar</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 24, justifyContent: "center", gap: 12 },
    titulo: { fontSize: 20, fontWeight: "700", color: colores.texto },
    subtitulo: { fontSize: 13, color: colores.textoMuted, marginBottom: 6, lineHeight: 18 },
    input: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colores.texto },
    error: { color: colores.peligro, fontSize: 13 },
    boton: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 4 },
    textoBoton: { color: "#fff", fontWeight: "600", fontSize: 15 },
  });
}
