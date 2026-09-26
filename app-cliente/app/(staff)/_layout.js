import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTema } from "../../lib/contextoTema";
import { useVigilarPedidosNuevos } from "../../lib/useVigilarPedidosNuevos";
import { obtenerNotificacionesStaff, suscribirseNotificacionesStaff } from "../../lib/bandejaStaff";

export default function StaffTabsLayout() {
  const { colores } = useTema();
  const [sinLeer, setSinLeer] = useState(0);
  useVigilarPedidosNuevos();

  useEffect(() => {
    const actualizar = (lista) => setSinLeer(lista.filter((n) => !n.leida).length);
    obtenerNotificacionesStaff().then(actualizar);
    return suscribirseNotificacionesStaff(actualizar);
  }, []);

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
        options={{ title: "Escanear", tabBarIcon: ({ color, size }) => <Ionicons name="qr-code" size={size + 4} color={color} /> }}
      />
      <Tabs.Screen
        name="cola"
        options={{ title: "Cola de pedidos", tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size + 4} color={color} /> }}
      />
      <Tabs.Screen
        name="notificaciones"
        options={{
          title: "Notificaciones",
          tabBarBadge: sinLeer > 0 ? sinLeer : undefined,
          tabBarBadgeStyle: { backgroundColor: colores.acento, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size + 4} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mas"
        options={{ title: "Más", tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle" size={size + 4} color={color} /> }}
      />
    </Tabs>
  );
}
