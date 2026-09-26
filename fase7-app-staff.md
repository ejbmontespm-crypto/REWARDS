# Fase 7 — App modo staff/admin (diseño de pantallas y flujos)

> Entregable de diseño, **pendiente de tu aprobación**. Es el modo operativo de mostrador de la misma app Expo (§3 del plan) — staff y admin entran con su cuenta de `usuarios_staff` y la navegación cambia respecto al modo cliente. Se apoya en [fase1-esquema-datos.md](fase1-esquema-datos.md), [fase6-backend-api.md](fase6-backend-api.md), y el flujo unificado de §7.1 del plan maestro.

## Estructura de navegación

**3 pestañas inferiores**: Escanear · Cola de pedidos · Más.

- **Escanear** es la pantalla de entrada por default (es lo que más se usa) — cámara abierta, lista para leer el QR dinámico de un cliente.
- **Cola de pedidos** es el KDS (kitchen display) — vive aquí porque se consulta todo el turno, no solo al escanear.
- **Más** agrupa lo de uso ocasional: buscar cliente sin QR, cuentas (si es admin), cerrar sesión.

Admin ve las mismas 3 pestañas — no hay una superficie aparte para admin dentro de la app; su acceso extra (cuentas, PIN) vive dentro de "Más".

## 1. Escanear

- Visor de cámara a pantalla completa, marco de encuadre al centro.
- Al leer un QR válido: se resuelve el cliente y la pantalla pasa a **2. Resultado del escaneo**.
- QR inválido/expirado (token rotativo vencido): mensaje breve "Este código ya no es válido, pídele al cliente que lo actualice" — no bloquea, deja escanear de nuevo.

## 2. Resultado del escaneo

Todo lo que puede pasar con ese cliente en una sola pantalla, como quedó definido en §7.1:

- **Encabezado**: nombre y foto/iniciales del cliente (validación visual), tipo de perfil, saldo actual en lenguaje llano, y sus **últimos 2-3 movimientos** (fecha + monto) como referencia rápida — no el historial completo, eso queda para la ficha del cliente en el panel.
- **Pedido(s) pendientes por recoger** (si hay): tarjeta con detalle y total — botón **"Marcar como entregado"**, que registra el movimiento automáticamente con el monto del pedido.
- **Solicitud de redención pendiente** (si la hay): tarjeta con el detalle — botón **"Aplicar redención"**.
- **Registrar venta de mostrador**: campo para capturar el monto del ticket a mano + botón **"Registrar"** — para cuando no hay pedido de la app de por medio.
- Todas estas acciones son independientes entre sí; el staff puede hacer más de una en la misma visita del cliente (ej. entregar un pedido y además registrar una compra adicional de mostrador).

## 3. Cola de pedidos (KDS)

- Filtro por estado: **Recibido · Preparando · Listo · Entregados**. Las primeras tres son la cola activa; **Entregados** es un historial del día (cliente, hora, total, quién lo confirmó) — separado para no estorbar la vista operativa, pero disponible dentro de la misma pantalla sin salir a buscarlo en el panel.
- Cada tarjeta: cliente, items, hora de pickup, botón para avanzar de estado (Recibido → Preparando → Listo).
- Pedidos que ya pasaron su hora de pickup + tolerancia se resaltan visualmente (ej. borde de alerta) y muestran el botón **"Cancelar"**.
- **Cancelar** (cualquier momento, cualquier estado — como quedó definido):
  - Si no está vencido, o no tiene nada que perder: se cancela directo, sin modal.
  - Si está vencido **y** tiene créditos aplicados o un canje asociado: modal mostrando qué está en juego, con **"Cancelar y aplicar penalización"** / **"Cancelar sin penalización"** — el bocetado que ya vimos en el preview de la Fase 3.
- "Entregado" **no se marca desde aquí** — solo pasa por el flujo de escaneo (2), porque ahí es donde se confirma el cobro real y se genera el movimiento. La cola es para preparar, no para cerrar la venta.

## 4. Más

- **Buscar cliente** (sin QR): por nombre/teléfono/correo, libre para todo el staff (sin PIN) — útil si el cliente olvidó cómo mostrar su QR. Lleva a la misma pantalla de "Resultado" que un escaneo.
- **Corrección de movimiento**: buscar un movimiento reciente, editar/anular — pide el **PIN de corrección** antes de dejar continuar.
- Solo si el usuario es **admin**: acceso directo a las secciones de cuentas del panel (o un atajo que abre el panel web) — no se duplica esa pantalla dentro de la app.
- Cerrar sesión.

## Estado

✅ Todo confirmado: últimos 2-3 movimientos como referencia rápida en el escaneo, historial de "Entregados" dentro de la cola de pedidos, y búsqueda de cliente libre sin PIN. **Fase 7 congelada.**
