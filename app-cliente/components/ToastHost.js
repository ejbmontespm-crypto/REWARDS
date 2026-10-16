import { useEffect, useRef, useState } from "react";
import { Animated, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTema } from "../lib/contextoTema";
import { suscribirseToast } from "../lib/toast";
import { radios, tipografia, sombra } from "../constants/theme";

const DURACION_MS = 1800;

/** Un solo host montado en la raíz de la app (ver app/_layout.js) — recibe
 *  toasts de cualquier pantalla vía mostrarToast() sin prop drilling. */
export default function ToastHost() {
  const { colores } = useTema();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const opacidad = useRef(new Animated.Value(0)).current;
  const traslado = useRef(new Animated.Value(-12)).current;
  const temporizador = useRef(null);

  useEffect(() => {
    return suscribirseToast(({ id, mensaje }) => {
      clearTimeout(temporizador.current);
      setToast({ id, mensaje });
      opacidad.setValue(0);
      traslado.setValue(-12);
      Animated.parallel([
        Animated.timing(opacidad, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(traslado, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start();
      temporizador.current = setTimeout(() => {
        Animated.timing(opacidad, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, DURACION_MS);
    });
  }, [opacidad, traslado]);

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        estilos.contenedor,
        sombra.media,
        { top: insets.top + 12, backgroundColor: colores.texto, opacity: opacidad, transform: [{ translateY: traslado }] },
      ]}
    >
      <Text style={[estilos.texto, { color: colores.superficie }]}>{toast.mensaje}</Text>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: radios.medio,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  texto: { fontSize: tipografia.sm, fontWeight: "600", textAlign: "center" },
});
