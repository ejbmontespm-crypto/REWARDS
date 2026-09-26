# App cliente/staff — Programa de lealtad

Una sola app Expo con dos modos (fase3-app-cliente.md y fase7-app-staff.md): el cliente entra por OTP/registro, el staff por usuario y contraseña — nunca las dos sesiones a la vez en el mismo dispositivo (`lib/contextoSesion.js`).

## Arranque

```bash
npm install
npx expo start          # imprime un QR — ábrelo con Expo Go en tu celular
npx expo start --web    # preview en el navegador, para desarrollo rápido sin celular
```

Necesita el [backend](../backend) corriendo en paralelo.

## Configuración — `lib/config.js`

No usa `.env` (es una app compilada/empaquetada — esos valores igual terminan visibles en el bundle, así que no hay nada que ocultar aquí). Todo vive en `lib/config.js`:

- **`API_BASE_URL`** — a dónde le habla la app. **`localhost` NO funciona para el celular** (es otro dispositivo en la red) — tiene que ser la IP local de la compu donde corre el backend, ej. `http://192.168.1.50:3000/api`. Se obtiene con `ipconfig` (busca "Dirección IPv4" del adaptador que sí tiene internet).

  ⚠️ **Esta IP puede cambiar** — routers caseros a veces reasignan direcciones (nos pasó una vez durante la construcción: la IP cambió a media sesión y el celular dejó de conectar sin aviso). Si el celular deja de conectar de la nada, lo primero a revisar es correr `ipconfig` otra vez y comparar contra lo que dice aquí.

- **`ASSET_BASE_URL`** — se calcula solo (quita `/api`); ahí vive el logo que sirve el backend.
- **`PANEL_URL`** — a dónde abre el atajo "Cuentas" de un admin en modo staff (`Más`).

## `lib/supabase.js` — anon key

El login por OTP real habla directo con Supabase (no pasa por el backend) — necesita la **anon key** del proyecto (Project Settings → API; a diferencia de la service role key del backend, esta sí es pública/segura de embeber en una app). Ya está puesta; si alguna vez rotas las keys del proyecto de Supabase, esta es la que hay que actualizar aquí.

## Estructura

```
app/
  _layout.js        guard de 3 estados: sin sesión / cliente / staff (Stack.Protected)
  (auth)/            Bienvenida, Registro, Login (OTP + acceso asistido), login de staff
  (tabs)/            modo cliente: Inicio, Menú, Promociones, Perfil
  (staff)/           modo staff: Escanear, Cola de pedidos, Más
  mi-qr.js, carrito.js, pedido/[id].js, promocion/[id].js, notificaciones.js, staff-buscar.js
    — pantallas que se abren sobre las pestañas, no son tabs en sí
lib/
  api.js             fetch con token (cliente o staff, el que esté activo), normaliza errores
  session.js         guarda el token según el tipo de sesión (SecureStore en nativo, AsyncStorage en web)
  contextoSesion.js  React Context de la sesión activa
  contextoCarrito.js React Context del carrito (compartido entre Menú y Carrito)
  supabase.js        cliente de Supabase Auth (anon key) — solo para el login OTP del cliente
  config.js          URLs (ver arriba)
components/
  ResultadoCliente.js  pantalla compartida "Resultado" (escaneo QR y búsqueda manual)
  Logo.js              logo configurable — resuelve SVG con react-native-svg (Image de RN no pinta SVG en nativo)
constants/theme.js   paleta de colores — configurable desde el panel (Apariencia), esto es solo el default
```

## Estado

Ver [roadmap-construccion.md](../roadmap-construccion.md), bloques 4 y 5 — ambos completos y probados, incluido en dispositivos reales (dos celulares, cliente y staff, probando el ciclo completo QR→escaneo→venta/redención).
