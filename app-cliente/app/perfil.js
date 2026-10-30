import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/contextoSesion";
import { useTema } from "../lib/contextoTema";

const ETIQUETA_PERFIL = { alumno: "Alumno", docente: "Docente", otro: "Otro" };
const ETIQUETA_TIPO_MONEDERO = {
  uso_pedido: "Usado en un pedido",
  devolucion_cancelacion: "Devolución",
  recompensa: "Recompensa canjeada",
  promo: "Promoción",
};

export default function Perfil() {
  const { cerrarSesion } = useSession();
  const { colores, recargar: recargarTema } = useTema();
  const estilos = useMemo(() => crearEstilos(colores), [colores]);
  const [actualizandoTema, setActualizandoTema] = useState(false);
  const [temaActualizado, setTemaActualizado] = useState(false);
  const [cliente, setCliente] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [saldoMonedero, setSaldoMonedero] = useState(0);
  const [movimientosMonedero, setMovimientosMonedero] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nombre: "", apellido_paterno: "", apellido_materno: "", telefono: "", correo: "", fecha_nacimiento: "" });
  const [guardando, setGuardando] = useState(false);
  const [cambiandoNotif, setCambiandoNotif] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      Promise.all([api.get("/clientes/me"), api.get("/movimientos/mios"), api.get("/clientes/me/monedero")])
        .then(([me, mov, monedero]) => {
          if (!vivo) return;
          setCliente(me.cliente);
          setForm({
            nombre: me.cliente.nombre,
            apellido_paterno: me.cliente.apellido_paterno,
            apellido_materno: me.cliente.apellido_materno || "",
            telefono: me.cliente.telefono,
            correo: me.cliente.correo,
            fecha_nacimiento: me.cliente.fecha_nacimiento || "",
          });
          setMovimientos(mov.movimientos);
          setSaldoMonedero(monedero.saldo_mxn);
          setMovimientosMonedero(monedero.movimientos);
        })
        .catch((err) => vivo && setError(err instanceof ApiError ? err.message : "No se pudo cargar tu perfil."))
        .finally(() => vivo && setCargando(false));
      return () => {
        vivo = false;
      };
    }, [])
  );

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const { cliente: actualizado } = await api.patch("/clientes/me", form);
      setCliente((c) => ({ ...c, ...actualizado }));
      setEditando(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarNotificaciones(valor) {
    setCambiandoNotif(true);
    try {
      const { cliente: actualizado } = await api.patch("/clientes/me", { notificaciones_activas: valor });
      setCliente((c) => ({ ...c, ...actualizado }));
    } catch {
      /* se queda como estaba si falla */
    } finally {
      setCambiandoNotif(false);
    }
  }

  async function actualizarTema() {
    setActualizandoTema(true);
    setTemaActualizado(false);
    await recargarTema();
    setActualizandoTema(false);
    setTemaActualizado(true);
    setTimeout(() => setTemaActualizado(false), 2500);
  }

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={["bottom"]}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {!cliente?.confirmado_en_ciclo_actual ? (
        <View style={estilos.banner}>
          <Text style={estilos.bannerTexto}>
            Tienes un ciclo de confirmación pendiente — pásate a caja o espera el próximo aviso por correo.
          </Text>
        </View>
      ) : null}

      <View style={estilos.tarjeta}>
        <View style={estilos.filaTitulo}>
          <Text style={estilos.tituloTarjeta}>Datos personales</Text>
          {!editando ? (
            <Pressable onPress={() => setEditando(true)}>
              <Text style={estilos.link}>Editar</Text>
            </Pressable>
          ) : null}
        </View>

        {editando ? (
          <View style={{ gap: 10 }}>
            <Campo estilos={estilos} etiqueta="Nombre" valor={form.nombre} onCambia={(v) => setForm((f) => ({ ...f, nombre: v }))} />
            <Campo estilos={estilos} etiqueta="Apellido paterno" valor={form.apellido_paterno} onCambia={(v) => setForm((f) => ({ ...f, apellido_paterno: v }))} />
            <Campo estilos={estilos} etiqueta="Apellido materno" valor={form.apellido_materno} onCambia={(v) => setForm((f) => ({ ...f, apellido_materno: v }))} />
            <Campo estilos={estilos} etiqueta="Teléfono" valor={form.telefono} onCambia={(v) => setForm((f) => ({ ...f, telefono: v }))} teclado="phone-pad" />
            <Campo estilos={estilos} etiqueta="Correo" valor={form.correo} onCambia={(v) => setForm((f) => ({ ...f, correo: v }))} teclado="email-address" />
            <Campo
              estilos={estilos}
              etiqueta="Fecha de nacimiento (AAAA-MM-DD)"
              valor={form.fecha_nacimiento}
              onCambia={(v) => setForm((f) => ({ ...f, fecha_nacimiento: v }))}
              teclado="numbers-and-punctuation"
            />
            {error ? <Text style={estilos.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable style={estilos.botonGuardar} onPress={guardar} disabled={guardando}>
                {guardando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.textoBotonGuardar}>Guardar</Text>}
              </Pressable>
              <Pressable style={estilos.botonCancelar} onPress={() => setEditando(false)}>
                <Text style={estilos.textoBotonCancelar}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Dato estilos={estilos} etiqueta="Nombre" valor={`${cliente.nombre} ${cliente.apellido_paterno} ${cliente.apellido_materno || ""}`.trim()} />
            <Dato estilos={estilos} etiqueta="Teléfono" valor={cliente.telefono} />
            <Dato estilos={estilos} etiqueta="Correo" valor={cliente.correo} />
            <Dato estilos={estilos} etiqueta="Perfil" valor={ETIQUETA_PERFIL[cliente.tipo_perfil] || cliente.tipo_perfil} />
            <Dato estilos={estilos} etiqueta="Nacimiento" valor={cliente.fecha_nacimiento || "Sin registrar — agrégala para la promo de cumpleaños"} />
          </View>
        )}
      </View>

      <View style={estilos.tarjeta}>
        <View style={estilos.filaTitulo}>
          <Text style={estilos.tituloTarjeta}>Preferencias de notificaciones</Text>
          <Switch value={cliente.notificaciones_activas} onValueChange={alternarNotificaciones} disabled={cambiandoNotif} />
        </View>
      </View>

      <View style={estilos.tarjeta}>
        <View style={estilos.filaTitulo}>
          <Text style={estilos.tituloTarjeta}>Saldo a favor</Text>
          <Text style={estilos.saldoMonederoMonto}>${Number(saldoMonedero).toFixed(0)}</Text>
        </View>
        {movimientosMonedero.length ? (
          movimientosMonedero.map((m) => (
            <View key={m.id} style={estilos.filaMovimiento}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.detalleMonedero}>{m.detalle || ETIQUETA_TIPO_MONEDERO[m.tipo] || m.tipo}</Text>
                <Text style={estilos.movimientoFecha}>{new Date(m.created_at).toLocaleDateString("es-MX")}</Text>
              </View>
              <Text style={[estilos.montoMonedero, Number(m.monto) < 0 && estilos.montoMonederoNegativo]}>
                {Number(m.monto) >= 0 ? "+" : ""}
                {Number(m.monto).toFixed(0)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={estilos.vacio}>Sin movimientos todavía.</Text>
        )}
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloTarjeta}>Historial de compras</Text>
        {movimientos.length ? (
          movimientos.map((m) => (
            <View key={m.id} style={estilos.filaMovimiento}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.movimientoFecha}>{new Date(m.created_at).toLocaleDateString("es-MX")}</Text>
                {m.items?.length ? (
                  <Text style={estilos.movimientoItems} numberOfLines={2}>
                    {m.items.map((i) => `${i.cantidad}× ${i.producto_nombre}`).join(", ")}
                  </Text>
                ) : null}
              </View>
              <Text style={estilos.movimientoMonto}>${Number(m.monto).toFixed(0)}</Text>
            </View>
          ))
        ) : (
          <Text style={estilos.vacio}>Sin compras todavía.</Text>
        )}
      </View>

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
    </ScrollView>
    </SafeAreaView>
  );
}

function Campo({ estilos, etiqueta, valor, onCambia, teclado }) {
  return (
    <View>
      <Text style={estilos.etiquetaCampo}>{etiqueta}</Text>
      <TextInput style={estilos.input} value={valor} onChangeText={onCambia} keyboardType={teclado} />
    </View>
  );
}

function Dato({ estilos, etiqueta, valor }) {
  return (
    <View style={estilos.filaDato}>
      <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

function crearEstilos(colores) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colores.fondo },
    centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo },
    banner: { backgroundColor: "#fff7e6", borderWidth: 1, borderColor: "#f0dba9", borderRadius: 10, padding: 12 },
    bannerTexto: { fontSize: 12.5, color: colores.texto },
    tarjeta: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, padding: 16, gap: 10 },
    filaTitulo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    tituloTarjeta: { fontSize: 14.5, fontWeight: "700", color: colores.texto },
    link: { color: colores.acento, fontSize: 13, fontWeight: "600" },
    filaDato: { flexDirection: "row", justifyContent: "space-between" },
    datoEtiqueta: { fontSize: 12.5, color: colores.textoMuted },
    datoValor: { fontSize: 13, color: colores.texto, fontWeight: "500" },
    etiquetaCampo: { fontSize: 11.5, color: colores.textoMuted, marginBottom: 4 },
    input: { backgroundColor: colores.fondo, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14 },
    error: { color: colores.peligro, fontSize: 12.5 },
    botonGuardar: { flex: 1, backgroundColor: colores.acento, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
    textoBotonGuardar: { color: "#fff", fontWeight: "600", fontSize: 13.5 },
    botonCancelar: { flex: 1, borderWidth: 1, borderColor: colores.borde, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
    textoBotonCancelar: { color: colores.texto, fontWeight: "600", fontSize: 13.5 },
    filaMovimiento: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 10 },
    movimientoFecha: { fontSize: 13, color: colores.textoMuted },
    movimientoItems: { fontSize: 11.5, color: colores.texto, marginTop: 2 },
    movimientoMonto: { fontSize: 13, color: colores.texto, fontWeight: "600" },
    vacio: { fontSize: 12.5, color: colores.textoMuted },
    saldoMonederoMonto: { fontSize: 17, fontWeight: "700", color: colores.acento },
    detalleMonedero: { fontSize: 13, color: colores.texto, fontWeight: "500" },
    montoMonedero: { fontSize: 13.5, fontWeight: "700", color: colores.exito },
    montoMonederoNegativo: { color: colores.textoMuted },
    botonActualizarTema: { paddingVertical: 10, alignItems: "center" },
    textoActualizarTema: { color: colores.acento, fontWeight: "600", fontSize: 13 },
    botonCerrarSesion: { borderWidth: 1, borderColor: colores.peligro, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
    textoCerrarSesion: { color: colores.peligro, fontWeight: "600", fontSize: 14 },
  });
}
