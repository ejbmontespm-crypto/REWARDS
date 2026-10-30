import { View, Image, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTema } from "../../lib/contextoTema";
import { useCarrito } from "../../lib/contextoCarrito";
import { useVigilarPedidoCliente } from "../../lib/useVigilarPedidoCliente";
import { sombra } from "../../constants/theme";

export default function TabsLayout() {
  const { colores, logoQrUrl } = useTema();
  const { items } = useCarrito();
  const router = useRouter();
  const cantidadCarrito = items.reduce((s, i) => s + i.cantidad, 0);
  useVigilarPedidoCliente();
  const estilos = crearEstilosQr(colores);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.acento,
        tabBarInactiveTintColor: colores.textoMuted,
        tabBarStyle: { backgroundColor: colores.superficie, borderTopColor: colores.borde, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: "600" },
        tabBarIconStyle: { marginBottom: -2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size + 4} color={color} /> }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: "Menú", tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size + 4} color={color} /> }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: "Mi QR",
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={estilos.botonQrSombra}>
              <View style={[estilos.botonQr, !logoQrUrl && estilos.botonQrFondo]}>
                {logoQrUrl ? (
                  <Image source={{ uri: logoQrUrl }} style={estilos.imagenBotonQr} resizeMode="cover" />
                ) : (
                  <Ionicons name="qr-code" size={26} color="#fff" />
                )}
              </View>
            </View>
          ),
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.push("/mi-qr");
          },
        })}
      />
      <Tabs.Screen
        name="carrito"
        options={{
          title: "Carrito",
          tabBarBadge: cantidadCarrito > 0 ? cantidadCarrito : undefined,
          tabBarBadgeStyle: { backgroundColor: colores.acento, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size + 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="promociones"
        options={{ title: "Promociones", tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" size={size + 4} color={color} /> }}
      />
    </Tabs>
  );
}

// Botón circular flotante, ligeramente elevado por encima de la barra
// (como en la referencia visual que compartieron) — mismo lenguaje de
// sombra/recorte que tenía antes el botón grande de Inicio, ahora aquí.
function crearEstilosQr(colores) {
  return StyleSheet.create({
    botonQrSombra: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colores.fondo,
      marginTop: -18,
      ...sombra.media,
    },
    botonQr: { flex: 1, borderRadius: 26, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    botonQrFondo: { backgroundColor: colores.acento },
    imagenBotonQr: { width: "100%", height: "100%" },
  });
}
