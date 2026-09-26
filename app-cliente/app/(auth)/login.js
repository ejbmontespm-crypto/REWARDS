import { useState, useRef, useMemo } from "react";
import { Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { api, ApiError } from "../../lib/api";
import { guardarTokenPropio } from "../../lib/session";
import { useSession } from "../../lib/contextoSesion";
import { useTema } from "../../lib/contextoTema";

export default function Login() {
  const router = useRouter();
  const { refrescar } = useSession();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);

  const [paso, setPaso] = useState("correo"); // "correo" | "codigo"
  const [correo, setCorreo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const entradaCodigo = useRef(null);

  async function enviarCodigo() {
    setError("");
    if (!correo.trim()) return setError("Escribe tu correo.");
    setCargando(true);
    // No condiciona el paso al resultado de Supabase a propósito, por dos
    // razones: (1) evita confirmar/negar si el correo tiene cuenta —mismo
    // criterio que /auth/staff/forgot-password en el backend—, y (2) es
    // justo el caso que cubre el acceso asistido: alguien cuyo correo no
    // funciona igual necesita llegar a la pantalla de 6 casillas para
    // capturar el código que le dio el staff en persona.
    try {
      await supabase.auth.signInWithOtp({
        email: correo.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
    } catch {
      /* seguimos igual al paso de código */
    } finally {
      setCargando(false);
      setPaso("codigo");
      setTimeout(() => entradaCodigo.current?.focus(), 100);
    }
  }

  async function verificarCodigo() {
    setError("");
    if (codigo.trim().length !== 6) return setError("El código tiene 6 dígitos.");
    setCargando(true);

    const correoNormalizado = correo.trim().toLowerCase();
    try {
      // 1. ¿es un OTP real de Supabase?
      const { error: errOtp } = await supabase.auth.verifyOtp({
        email: correoNormalizado,
        token: codigo.trim(),
        type: "email",
      });
      if (!errOtp) return refrescar(); // sesión de Supabase ya quedó guardada sola

      // 2. si no, ¿es un código de acceso asistido (dado en persona por staff)?
      const { token } = await api.post("/auth/cliente/codigo-asistido/verificar", {
        correo: correoNormalizado,
        codigo: codigo.trim(),
      });
      await guardarTokenPropio(token);
      await refrescar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código incorrecto o vencido.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
      {paso === "correo" ? (
        <>
          <Text style={estilos.titulo}>Ya tengo cuenta</Text>
          <Text style={estilos.subtitulo}>Te mandamos un código de un solo uso a tu correo.</Text>
          <TextInput
            style={estilos.input}
            placeholder="tu@correo.com"
            value={correo}
            onChangeText={setCorreo}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {error ? <Text style={estilos.error}>{error}</Text> : null}
          <Pressable style={estilos.boton} onPress={enviarCodigo} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Enviar código</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={estilos.titulo}>Revisa tu correo</Text>
          <Text style={estilos.subtitulo}>
            Te enviamos un código a {correo}. Si te lo compartió el staff en persona, también va aquí.
          </Text>
          <TextInput
            ref={entradaCodigo}
            style={[estilos.input, estilos.inputCodigo]}
            placeholder="000000"
            value={codigo}
            onChangeText={(v) => setCodigo(v.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
          {error ? <Text style={estilos.error}>{error}</Text> : null}
          <Pressable style={estilos.boton} onPress={verificarCodigo} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Entrar</Text>}
          </Pressable>
          <Pressable onPress={() => setPaso("correo")}>
            <Text style={estilos.link}>Usar otro correo</Text>
          </Pressable>
        </>
      )}

      <Pressable onPress={() => router.back()}>
        <Text style={estilos.link}>Volver</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 24, justifyContent: "center", gap: 12 },
    titulo: { fontSize: 20, fontWeight: "700", color: colores.texto },
    subtitulo: { fontSize: 13.5, color: colores.textoMuted, lineHeight: 19, marginBottom: 6 },
    input: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colores.texto },
    inputCodigo: { textAlign: "center", fontSize: 24, letterSpacing: 8, fontVariant: ["tabular-nums"] },
    error: { color: colores.peligro, fontSize: 13 },
    boton: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 4 },
    textoBoton: { color: "#fff", fontWeight: "600", fontSize: 15 },
    link: { textAlign: "center", color: colores.textoMuted, fontSize: 13, marginTop: 10 },
  });
}
