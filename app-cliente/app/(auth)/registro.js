import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { guardarTokenPropio } from "../../lib/session";
import { useSession } from "../../lib/contextoSesion";
import { useTema } from "../../lib/contextoTema";

const PERFILES = [
  { valor: "alumno", etiqueta: "Alumno" },
  { valor: "docente", etiqueta: "Docente" },
  { valor: "otro", etiqueta: "Otro" },
];

export default function Registro() {
  const router = useRouter();
  const { refrescar } = useSession();
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);

  const [nombre, setNombre] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [tipoPerfil, setTipoPerfil] = useState("alumno");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setError("");
    if (!nombre.trim() || !apellidoPaterno.trim()) return setError("Falta nombre o apellido paterno.");
    if (!telefono.trim() || !correo.trim()) return setError("Teléfono y correo son obligatorios los dos.");

    setEnviando(true);
    try {
      const { token } = await api.post("/clientes", {
        nombre: nombre.trim(),
        apellido_paterno: apellidoPaterno.trim(),
        apellido_materno: apellidoMaterno.trim() || undefined,
        telefono: telefono.trim(),
        correo: correo.trim(),
        tipo_perfil: tipoPerfil,
      });
      await guardarTokenPropio(token);
      await refrescar(); // el guard de (tabs) reacciona solo al cambiar el token
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["top"]}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
      <Text style={estilos.titulo}>Crear cuenta</Text>

      <Campo estilos={estilos} label="Nombre" valor={nombre} onCambia={setNombre} />
      <Campo estilos={estilos} label="Apellido paterno" valor={apellidoPaterno} onCambia={setApellidoPaterno} />
      <Campo estilos={estilos} label="Apellido materno (opcional)" valor={apellidoMaterno} onCambia={setApellidoMaterno} />
      <Campo estilos={estilos} label="Teléfono" valor={telefono} onCambia={setTelefono} teclado="phone-pad" />
      <Campo estilos={estilos} label="Correo" valor={correo} onCambia={setCorreo} teclado="email-address" autoCapitalizar="none" />

      <View>
        <Text style={estilos.label}>Tipo de perfil</Text>
        <View style={estilos.filaPerfiles}>
          {PERFILES.map((p) => (
            <Pressable
              key={p.valor}
              onPress={() => setTipoPerfil(p.valor)}
              style={[estilos.chipPerfil, tipoPerfil === p.valor && estilos.chipPerfilActivo]}
            >
              <Text style={[estilos.textoChip, tipoPerfil === p.valor && estilos.textoChipActivo]}>{p.etiqueta}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      <Pressable style={estilos.boton} onPress={enviar} disabled={enviando}>
        {enviando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Crear cuenta</Text>}
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={estilos.link}>Volver</Text>
      </Pressable>
    </ScrollView>
    </SafeAreaView>
  );
}

function Campo({ estilos, label, valor, onCambia, teclado, autoCapitalizar }) {
  return (
    <View>
      <Text style={estilos.label}>{label}</Text>
      <TextInput
        style={estilos.input}
        value={valor}
        onChangeText={onCambia}
        keyboardType={teclado}
        autoCapitalize={autoCapitalizar}
      />
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    titulo: { fontSize: 20, fontWeight: "700", color: colores.texto, marginBottom: 4 },
    label: { fontSize: 12.5, color: colores.textoMuted, marginBottom: 5, fontWeight: "500" },
    input: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colores.texto },
    filaPerfiles: { flexDirection: "row", gap: 8 },
    chipPerfil: { borderWidth: 1, borderColor: colores.borde, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
    chipPerfilActivo: { backgroundColor: colores.acento, borderColor: colores.acento },
    textoChip: { fontSize: 13, color: colores.texto },
    textoChipActivo: { color: "#fff", fontWeight: "600" },
    error: { color: colores.peligro, fontSize: 13 },
    boton: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 6 },
    textoBoton: { color: "#fff", fontWeight: "600", fontSize: 15 },
    link: { textAlign: "center", color: colores.textoMuted, fontSize: 13, marginTop: 4, marginBottom: 20 },
  });
}
