import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTema } from "../../lib/contextoTema";
import { useCarrito } from "../../lib/contextoCarrito";
import { useVigilarPedidoCliente } from "../../lib/useVigilarPedidoCliente";

export default function TabsLayout() {
  const { colores } = useTema();
  const { items } = useCarrito();
  const cantidadCarrito = items.reduce((s, i) => s + i.cantidad, 0);
  useVigilarPedidoCliente();

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
      <Tabs.Screen
        name="perfil"
        options={{ title: "Perfil", tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size + 4} color={color} /> }}
      />
    </Tabs>
  );
}
