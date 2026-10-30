import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTema } from "../../lib/contextoTema";
import { useVigilarPedidosNuevos } from "../../lib/useVigilarPedidosNuevos";
import { obtenerNotificacionesStaff, suscribirseNotificacionesStaff } from "../../lib/bandejaStaff";
import { sombra } from "../../constants/theme";

export default function StaffTabsLayout() {
  const { colores } = useTema();
  const router = useRouter();
  const [sinLeer, setSinLeer] = useState(0);
  useVigilarPedidosNuevos();
  const estilos = crearEstilosEscanear(colores);

  useEffect(() => {
    const actualizar = (lista) => setSinLeer(lista.filter((n) => !n.leida).length);
    obtenerNotificacionesStaff().then(actualizar);
    return suscribirseNotificacionesStaff(actualizar);
  }, []);

  return (
    <Tabs
      initialRouteName="inicio"
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
        name="inicio"
        options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size + 4} color={color} /> }}
      />
      <Tabs.Screen
        name="cola"
        options={{ title: "Cola de pedidos", tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size + 4} color={color} /> }}
      />
      <Tabs.Screen
        name="escanear"
        options={{
          title: "Escanear",
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={estilos.botonEscanearSombra}>
              <View style={estilos.botonEscanear}>
                <Ionicons name="scan" size={26} color="#fff" />
              </View>
            </View>
          ),
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.push("/staff-escanear");
          },
        })}
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

// Mismo botón circular flotante que el QR de la app de cliente.
function crearEstilosEscanear(colores) {
  return StyleSheet.create({
    botonEscanearSombra: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colores.fondo,
      marginTop: -18,
      ...sombra.media,
    },
    botonEscanear: { flex: 1, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colores.acento },
  });
}
