# Fase 3 — App cliente (diseño de pantallas y flujos)

> Entregable de diseño, **pendiente de tu aprobación**. Cubre solo el **modo cliente** de la app Expo — el modo staff/admin (escaneo, cola de pedidos) es la Fase 5, por separado, ya que depende de que este modo exista primero. Se apoya en [fase1-esquema-datos.md](fase1-esquema-datos.md) y [plan-maestro-programa-lealtad.md](plan-maestro-programa-lealtad.md).

## Estructura de navegación

**4 pestañas inferiores**: Inicio · Menú · Promociones · Perfil.

El **QR personal no es una pestaña aparte** — vive como un botón grande y prominente en Inicio (es lo que el cliente abre en caja, así que debe estar a un toque desde donde cae la app al abrirla). **✅ Confirmado.**

Pila previa a iniciar sesión (Bienvenida → Registro / Login) y pantallas que se abren sobre las pestañas (Mi QR a pantalla completa, Carrito/Checkout, Detalle de promoción, Historial, Editar perfil).

---

## Antes de iniciar sesión

### 1. Bienvenida
Se llega aquí desde el QR fijo del mostrador o al abrir la app por primera vez. Mensaje breve de qué es el programa + dos botones: **Crear cuenta** / **Ya tengo cuenta**.

### 2. Registro
Campos: nombre, apellido paterno (obligatorios), apellido materno (opcional), **teléfono y correo — ambos obligatorios** (adición 11 sep 2026; el cliente puede capturar el que prefiera primero, pero se piden los dos antes de terminar), tipo de perfil (alumno / docente / otro). Al enviar, se crea el cliente y se genera su QR personal — pasa directo a la app ya autenticado (primer login implícito).

### 3. Login (OTP por correo + respaldo presencial)
Captura de correo → pantalla "Te enviamos un código a tu correo" con 6 casillas para el código → entra. Sin contraseña.

**✅ Resuelto — quién no tiene correo o nunca le llega el OTP**: pasa a caja, el staff (o admin desde el panel) genera un **código de acceso asistido** desde la ficha del cliente (de un solo uso, expira pronto) y lo comparte en persona. El cliente lo captura en la **misma pantalla de 6 casillas** — el backend simplemente valida contra ese código en vez del de Supabase Auth. No se toca correo ni SMS.

---

## Después de iniciar sesión

### 4. Inicio
**Los dos protagonistas visuales de la pantalla son el botón del QR y el saldo** — todo lo demás (pedido en curso, promos destacadas) va debajo, en segundo plano. Nada de ponerlos como una tarjeta más entre otras.

- **Ícono de campana** en la esquina superior (junto al saludo/avatar), con contador de no leídas → abre la **bandeja de notificaciones** (pantalla 4.1, adición 11 sep 2026).
- **Botón grande "Mi QR"**, arriba, el elemento más prominente de la pantalla → abre la pantalla de QR a pantalla completa.
- **Tarjeta de saldo**, igual de protagonista, en lenguaje llano según la modalidad activa (ej. "Tienes 320 créditos ($320 MXN en bebidas)" o "Llevas 6 de 8 visitas").
- **Banner de recompensa disponible** (si aplica): "¡Tienes una bebida gratis lista para redimir!" + botón **Redimir** — al tocarlo, crea la `solicitud_canje` que el staff verá al escanear en caja. Confirmación breve tipo "Listo, muéstrale esto al staff en caja" (no hace falta un paso de confirmación adicional, el botón ya es la intención).
- Más abajo, en segundo plano: **pedido en curso** (si hay uno activo, tarjeta con estado y hora de pickup) y accesos rápidos a 1-2 promociones destacadas + Historial.

### 4.1 Bandeja de notificaciones (adición 11 sep 2026)
Lista del historial de avisos recibidos (nueva promoción, pedido listo, recompensa disponible, vencimientos...), cada uno con ícono según tipo, texto, tiempo relativo ("hace 2 h") y un punto de no leído. Tocar uno lo marca como leído y navega a la pantalla relacionada (la promoción, el pedido, etc.). Es el mismo contenido que ya se manda por correo — aquí queda también como historial dentro de la app, no solo como notificación push que desaparece.

### 5. Mi QR (pantalla completa)
QR dinámico grande, centrado, con el **nombre del cliente** debajo (para que el staff valide visualmente). Se regenera cada 30-60 segundos mientras la pantalla está abierta. Protección de captura: bloqueada en Android; en iOS, si se detecta una captura, el QR se refresca de inmediato para invalidar lo capturado.

### 6. Menú
Catálogo por categoría (Bebidas calientes, Bebidas frías, Panadería…). Tap en un producto → modal de configuración (cantidad, extras) → **Agregar al carrito**. Ícono de carrito con contador, siempre visible.

Si el admin **suspendió temporalmente los pedidos en línea**: banner fijo arriba del catálogo ("Pedidos en línea no disponibles por el momento — pásate al mostrador") y el flujo de armar carrito/checkout queda deshabilitado; el catálogo sigue siendo visible para consulta.

Si el admin los tiene activos pero **este cliente aún no junta el gasto mínimo** (propuesto $100 MXN en compras reales): mismo tipo de banner, con barra de progreso — "Los pedidos en línea se habilitan después de tu primera compra en caja (llevas $40 de $100)." No afecta su saldo de créditos ni sus redenciones, solo el acceso a pedir por la app.

### 7. Carrito / Checkout
Resumen de items (editable: cantidad, quitar), selector de **hora de pickup en slots de 15 minutos**, y si la modalidad de recompensa lo permite, opción de **aplicar créditos** al total (muestra cuánto cubre y cuánto queda por pagar en caja). Aviso siempre visible, aplique o no una redención a este pedido en particular: *"Si no recoges tu pedido, se aplica una penalización a tu saldo/avance."* (el detalle exacto según la modalidad vive en §6 del plan maestro — créditos, visitas o premio, no es exclusivo de pedidos con canje). Botón **Confirmar pedido** — el total completo se paga en caja al recoger, esto solo envía el pedido a la cola del staff.

### 8. Detalle de pedido en curso
Estado con línea de tiempo (Recibido → Preparando → Listo → Entregado) y hora de pickup. **✅ Cancelación resuelta**: botón **Cancelar pedido** visible solo mientras el estado es "Recibido" — desaparece en cuanto el staff empieza a prepararlo. Si el pedido traía créditos aplicados o un producto por canje, cancelarlo a tiempo (antes de "Preparando") no genera penalización — la penalización es específicamente por **no recogerlo**, no por cancelarlo con anticipación.

### 9. Promociones
Galería/lista de promociones activas que aplican a su tipo de perfil. Tap → vista de la promoción embebida a pantalla completa (imagen o PDF, según cómo la haya cargado el admin).

### 10. Perfil
- Datos personales (nombre, teléfono, correo) — editables por el cliente, salvo el tipo de perfil (eso lo cambia el staff/admin).
- Estado de confirmación de cuenta: si está pendiente o inactiva, banner explicando por qué y cómo reactivarse (liga de confirmación o pasar a caja).
- **Historial de compras**: lista de fecha + monto de cada movimiento.
- **Preferencias de notificaciones** (renombrado 11 sep 2026, antes solo "Notificaciones" — se distingue de la bandeja de mensajes de §4.1): activar/desactivar, no el historial en sí.
- Cerrar sesión.

---

## Notificaciones (push + in-app)

Reflejan los disparadores ya definidos en el plan (§10): nueva promoción, pedido listo, recompensa disponible (solo en modalidad visitas, ya que en créditos el cliente ve su saldo y decide cuándo redimir), vencimiento de puntos/ciclo. Se muestran como notificación del sistema y, si la app está abierta, como banner in-app.

## Estado

✅ Todo confirmado: QR como botón protagonista en Inicio, cancelación en "Recibido" sin penalización, tolerancia de 30 min (configurable) antes de que el **staff** — no un proceso automático — pueda marcar un pedido como no recogido, y el filtro de gasto mínimo ($100 MXN propuesto) para desbloquear pedidos en línea por cliente.

**Fase 3 congelada.** El botón "Cancelar por no recogido" en sí vive en la cola de pedidos del staff, que se diseña en la Fase 5 (app modo staff) — aquí solo quedó registrado que existe y por qué.

¿Preparo un boceto visual como el del panel antes de pasar a construir, o seguimos directo a la Fase 4 (integración de correo)?
