import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { api, ApiError } from "../lib/api";
import { useTema } from "../lib/contextoTema";
import ResultadoCliente from "../components/ResultadoCliente";

export default function BuscarCliente() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [config, setConfig] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const temporizador = useRef(null);

  useEffect(() => {
    api
      .get("/configuracion-recompensa/activa")
      .then((d) => setConfig(d.configuracion))
      .catch(() => {});
  }, []);

  const buscar = useCallback(async (texto) => {
    if (!texto.trim()) return setResultados([]);
    setBuscando(true);
    try {
      const { clientes } = await api.get("/clientes", { query: { buscar: texto } });
      setResultados(clientes);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  function onCambiaTexto(texto) {
    setTermino(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => buscar(texto), 300);
  }

  async function abrirCliente(cliente) {
    setError("");
    try {
      const r = await api.get(`/staff/escaneo/cliente/${cliente.id}`);
      setResultado(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar este cliente.");
    }
  }

  if (resultado) {
    return <ResultadoCliente resultado={resultado} config={config} onVolver={() => setResultado(null)} textoVolver="← Buscar otro" />;
  }

  return (
    <View style={estilos.contenedor}>
      <TextInput
        style={estilos.input}
        placeholder="Nombre, teléfono o correo…"
        value={termino}
        onChangeText={onCambiaTexto}
        autoCapitalize="none"
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {buscando ? <ActivityIndicator color={colores.acento} style={{ marginTop: 16 }} /> : null}

      {resultados.map((c) => (
        <Pressable key={c.id} style={estilos.tarjeta} onPress={() => abrirCliente(c)}>
          <Text style={estilos.nombre}>
            {c.nombre} {c.apellido_paterno}
          </Text>
          <Text style={estilos.contacto}>{c.correo || c.telefono}</Text>
        </Pressable>
      ))}

      {!buscando && termino.trim() && resultados.length === 0 ? <Text style={estilos.vacio}>Sin resultados.</Text> : null}
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo, padding: 20, gap: 10 },
    input: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    error: { color: colores.peligro, fontSize: 13 },
    vacio: { textAlign: "center", color: colores.textoMuted, marginTop: 20 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 10, padding: 14 },
    nombre: { fontSize: 14.5, fontWeight: "600", color: colores.texto },
    contacto: { fontSize: 12.5, color: colores.textoMuted, marginTop: 2 },
  });
}
