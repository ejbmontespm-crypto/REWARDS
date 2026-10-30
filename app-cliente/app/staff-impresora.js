import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTema } from "../lib/contextoTema";
import { mostrarToast } from "../lib/toast";
import {
  obtenerConfigImpresora,
  guardarConfigImpresora,
  listarDispositivosEmparejados,
  imprimirEtiquetaDirecto,
} from "../lib/impresoraEtiquetas";

// Pedido de prueba — no necesita existir de verdad, solo sirve para
// confirmar que la impresora conectada imprime texto/QR legibles antes
// de calibrar posiciones en impresoraEtiquetas.js con datos reales.
const PEDIDO_PRUEBA = {
  id: "00000000-0000-0000-0000-000000000000",
  folio: "20261029-000",
  nombre: "Prueba",
  apellido_paterno: "Impresora",
  hora_pickup: new Date().toISOString(),
  items: [
    { cantidad: 1, producto_nombre: "Café Americano" },
    { cantidad: 2, producto_nombre: "Croissant" },
  ],
};

export default function ConfigurarImpresora() {
  const { colores } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [config, setConfig] = useState({ direccion: null, nombre: null, automatica: false });
  const [dispositivos, setDispositivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      Promise.all([obtenerConfigImpresora(), listarDispositivosEmparejados()])
        .then(([cfg, disp]) => {
          if (!vivo) return;
          setConfig(cfg);
          setDispositivos(disp);
        })
        .catch((err) => vivo && setError(err.message || "No se pudieron listar los dispositivos Bluetooth."))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [])
  );

  async function elegirDispositivo(d) {
    const nuevaConfig = { ...config, direccion: d.address, nombre: d.name || d.address };
    setConfig(nuevaConfig);
    await guardarConfigImpresora(nuevaConfig);
    mostrarToast(`✓ Impresora vinculada: ${nuevaConfig.nombre}`);
  }

  async function alternarAutomatica(valor) {
    const nuevaConfig = { ...config, automatica: valor };
    setConfig(nuevaConfig);
    await guardarConfigImpresora(nuevaConfig);
  }

  async function probarImpresion() {
    setProbando(true);
    setError("");
    try {
      await imprimirEtiquetaDirecto(PEDIDO_PRUEBA);
      mostrarToast("✓ Etiqueta de prueba enviada");
    } catch (err) {
      setError(err.message || "No se pudo imprimir la etiqueta de prueba.");
    } finally {
      setProbando(false);
    }
  }

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  return (
    <ScrollView style={estilos.contenedor} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={estilos.parrafo}>
        Empareja primero el dispositivo desde los ajustes de Bluetooth del celular (Android) — aquí solo eliges cuál de los
        ya emparejados es la impresora de etiquetas.
      </Text>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloSeccion}>Dispositivos emparejados</Text>
        {dispositivos.length === 0 ? (
          <Text style={estilos.vacio}>Ninguno — empareja la impresora desde Ajustes del sistema primero.</Text>
        ) : (
          dispositivos.map((d) => {
            const activo = config.direccion === d.address;
            return (
              <Pressable key={d.address} style={[estilos.filaDispositivo, activo && estilos.filaDispositivoActiva]} onPress={() => elegirDispositivo(d)}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nombreDispositivo}>{d.name || "(sin nombre)"}</Text>
                  <Text style={estilos.direccionDispositivo}>{d.address}</Text>
                </View>
                {activo ? <Text style={estilos.check}>✓</Text> : null}
              </Pressable>
            );
          })
        )}
      </View>

      {config.direccion ? (
        <>
          <View style={estilos.tarjeta}>
            <View style={estilos.filaSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.tituloSeccion}>Impresión automática</Text>
                <Text style={estilos.parrafoChico}>Al pasar un pedido a "Preparando", se imprime la etiqueta sola.</Text>
              </View>
              <Switch value={config.automatica} onValueChange={alternarAutomatica} />
            </View>
          </View>

          <Pressable style={estilos.botonProbar} onPress={probarImpresion} disabled={probando}>
            {probando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBoton}>Imprimir etiqueta de prueba</Text>}
          </Pressable>
        </>
      ) : null}

      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    parrafo: { fontSize: 13, color: colores.textoMuted, lineHeight: 19 },
    parrafoChico: { fontSize: 11.5, color: colores.textoMuted, marginTop: 2, lineHeight: 16 },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16, gap: 10 },
    tituloSeccion: { fontSize: 14, fontWeight: "700", color: colores.texto },
    vacio: { fontSize: 12.5, color: colores.textoMuted },
    filaDispositivo: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colores.borde },
    filaDispositivoActiva: { opacity: 1 },
    nombreDispositivo: { fontSize: 13.5, fontWeight: "600", color: colores.texto },
    direccionDispositivo: { fontSize: 11, color: colores.textoMuted, marginTop: 1 },
    check: { fontSize: 16, color: colores.acento, fontWeight: "700" },
    filaSwitch: { flexDirection: "row", alignItems: "center", gap: 10 },
    botonProbar: { backgroundColor: colores.acento, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
    textoBoton: { color: "#fff", fontWeight: "700", fontSize: 14 },
    error: { color: colores.peligro, fontSize: 13 },
  });
}
