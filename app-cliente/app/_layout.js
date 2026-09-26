import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SessionProvider, useSession } from "../lib/contextoSesion";
import { CarritoProvider } from "../lib/contextoCarrito";
import { TemaProvider, useTema } from "../lib/contextoTema";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TemaProvider>
        <SessionProvider>
          <CarritoProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </CarritoProvider>
        </SessionProvider>
      </TemaProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { sesion, cargando } = useSession();
  const { colores } = useTema();

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colores.fondo }}>
        <ActivityIndicator color={colores.acento} />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Protected guard={sesion?.tipo === "cliente"}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="mi-qr" options={{ presentation: "fullScreenModal", headerShown: false }} />
        <Stack.Screen name="notificaciones" options={{ presentation: "modal", title: "Notificaciones" }} />
        <Stack.Screen name="pedido/[id]" options={{ title: "Tu pedido" }} />
        <Stack.Screen name="promocion/[id]" options={{ presentation: "modal", headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={sesion?.tipo === "staff"}>
        <Stack.Screen name="(staff)" options={{ headerShown: false }} />
        <Stack.Screen name="staff-buscar" options={{ title: "Buscar cliente" }} />
      </Stack.Protected>
      <Stack.Protected guard={!sesion}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
