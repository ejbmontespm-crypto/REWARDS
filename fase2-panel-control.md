# Fase 2 — Panel de control (diseño de pantallas y flujos)

> Entregable de diseño, **pendiente de tu aprobación**. Describe qué pantallas existen, qué hace cada una y los flujos clave — sin código todavía. Se apoya en [fase1-esquema-datos.md](fase1-esquema-datos.md) (congelado) y en [plan-maestro-programa-lealtad.md](plan-maestro-programa-lealtad.md).

## Alcance y supuesto de acceso

Por diseño (§3 del plan maestro), el panel es **trabajo de escritorio**, no operativo de mostrador. **✅ Confirmado: acceso exclusivo para el rol `admin`** — el staff/cajero nunca inicia sesión aquí; todas sus tareas (escanear QR, registrar ticket, cola de pedidos, redimir) viven en la app Expo modo staff. El admin crea las cuentas de staff *desde* el panel, pero el staff no entra a él.

## Estructura de navegación

Barra lateral con 8 secciones:

1. Dashboard
2. Regla de recompensa
3. Menú
4. Promociones
5. Vigencias
6. Clientes
7. Cuentas (staff/admin)
8. Reportes

---

## 1. Login / recuperación

- **Login**: usuario + contraseña.
- **"Olvidé mi contraseña"** (pantalla pública, antes de autenticarse):
  - Staff: captura su `nombre_usuario`, se crea una `password_reset_solicitudes` pendiente. No recibe nada todavía — debe esperar a que el admin la apruebe.
  - Admin: opción separada "Soy admin y no tengo acceso" → pide el **correo de respaldo**, envía el código de un solo uso ahí.
- **Cambio de contraseña obligatorio** tras usar una temporal (`debe_cambiar_password`), antes de dejar entrar a cualquier otra pantalla.

## 2. Dashboard

Resumen del día, solo lectura: ventas registradas hoy, canjes del día, pedidos pendientes por recoger, clientes nuevos en la semana, alerta si hay una `ciclos_vigencia` por vencer en los próximos 7 días o solicitudes de reset de contraseña pendientes de aprobar.

## 3. Regla de recompensa

- **Tarjeta de estado actual**: modalidad activa (A/B/C) y sus parámetros vigentes, en lenguaje llano (ej. "Créditos: 5% del ticket, 1 cd = $1 MXN").
- **Botón "Cambiar regla"** → formulario según la modalidad elegida:
  - **A — cd = $ MXN**: % de acumulación, valor de 1 cd en MXN.
  - **B — cd = producto gratis**: % de acumulación, umbral de cd, selector multi de productos elegibles.
  - **C — visitas**: umbral de visitas, consumo mínimo en MXN, selector multi de productos elegibles.
- Al guardar: **pantalla de confirmación explícita** ("esto aplica a todo el negocio desde ahora, los saldos anteriores se conservan") antes de escribir el cambio — evita cambios accidentales de una regla que afecta a todos los clientes.
- **Historial** (tabla de solo lectura): cada configuración pasada, quién la creó, vigente_desde/hasta.

## 4. Menú

- **Pedidos en línea**: interruptor en la parte superior — "Pedidos en línea: Activos / Suspendidos". Al apagarlo, la app deja de aceptar pedidos nuevos hasta reactivarlo; el mostrador y la acumulación/redención en caja no se ven afectados. (Adición del 11 sep 2026.)
- **Tolerancia de recogida**: minutos de gracia tras la hora de pickup antes de que el staff pueda marcar un pedido como "no recogido" desde su cola (no es automático — solo habilita el botón; propuesto 30 min, configurable). (Adición del 11 sep 2026.)
- **Gasto mínimo para desbloquear pedidos en línea**: monto configurable (propuesto $100 MXN) que cada cliente debe acumular en compras reales antes de que la app le habilite pedidos en línea, aunque estén activos en general — filtro anti-abuso para cuentas sin historial. (Adición del 11 sep 2026.)
- **Categorías**: lista simple con nombre y orden; crear/editar/eliminar.
- **Productos**: tabla (nombre, categoría, precio, disponible). Acciones: editar, alternar "agotado", eliminar. El toggle "agotado" también existe en la app en modo staff (§ Fuera de esta fase) — ambos escriben el mismo campo `productos.disponible`; el resto (precio, nombre, categoría, extras) solo se edita aquí.
  - Formulario: nombre, descripción, precio, categoría, imagen (sube a Supabase Storage), extras aplicables (multi-select de la lista de extras).
- **Extras**: tabla (nombre, costo, disponible). Formulario simple crear/editar.

## 5. Promociones

- Lista de promociones: título, tipo (imagen/PDF), vigencia, estado (activa/pausada).
- **Crear/editar promoción** (una por una, como pediste): título, descripción, tipo de archivo, subir archivo (Storage), fecha inicio/fin (opcional — sin fecha = indefinida hasta desactivar a mano), segmentos de perfil (checkboxes: alumnos / docentes / otro, o "todos").
- Al **activar** una promoción nueva: aviso en pantalla de que se disparará la notificación automática (app + correo) a los clientes que apliquen, antes de confirmar.
- Alternar activa/pausada directamente desde la lista.

## 6. Vigencias

Dos bloques independientes, cada uno con el mismo patrón:

- **Vigencia de puntos/créditos/visitas**: fecha límite actual (o "sin definir"), botón "capturar nueva fecha", **días de aviso previo antes del vencimiento** (configurable, propuesto 7 — adición 13 sep 2026), historial de ciclos anteriores con su fecha de ejecución.
- **Ciclo de confirmación de cuenta**: fecha límite actual, plazo de gracia en días (opcional), mismo patrón de historial. El recordatorio a medio plazo de gracia (adición 13 sep 2026) sale solo, sin campo de configuración propio — se calcula como la mitad del plazo de gracia ya definido.

Ambos bloques dejan capturar la fecha en cualquier momento (no solo cuando el ciclo anterior ya se ejecutó), consistente con "todo configurable en cada momento".

## 7. Clientes

✅ Incluida en v1.

- **Buscador por coincidencia parcial** (no exacta) sobre nombre, apellidos, teléfono o correo — ej. buscar "gonz" encuentra "González". Se implementa con `ILIKE '%término%'` sobre esos campos.
- Ficha de cliente: datos personales, tipo de perfil (editable), saldo actual (créditos/visitas), estado de confirmación, historial de movimientos y canjes.
- Acciones: reactivar cuenta manualmente (equivalente a lo que hace el staff en caja, útil si el cliente llama o escribe en vez de ir en persona), editar tipo de perfil, **generar código de acceso asistido** (adición del 11 sep 2026 — para el cliente sin correo o a quien nunca le llega el OTP; ver [fase3-app-cliente.md](fase3-app-cliente.md) §3).

## 8. Cuentas (staff/admin)

- Lista de usuarios: nombre, rol, activo/inactivo.
- **Crear cuenta**: nombre completo, nombre de usuario, correo (+ correo de respaldo si el rol es admin), rol. Se genera una contraseña temporal y se envía por correo; `debe_cambiar_password = true`.
- Activar/desactivar cuenta.
- **Bandeja de solicitudes de reset pendientes**: lista de `password_reset_solicitudes` en estado `pendiente`, botón "aprobar" → genera y envía contraseña temporal.
- **PIN de corrección global**: campo para verlo/regenerarlo (solo admin), usado por todo el staff para autorizar ediciones/anulaciones de tickets desde la app.

## 9. Reportes

- Ventas y canjes por rango de fechas (tabla en pantalla).
- **Log de notificaciones** con exportación a **Excel** (según pediste).
- Clientes por estado de confirmación (activos/inactivos), exportable.

---

## Fuera de esta fase (a propósito)

- La **cola de pedidos en vivo (KDS)** vive en la app Expo, modo staff — no en este panel (según arquitectura de §3). Aquí solo hay un **historial de pedidos de solo lectura** dentro de Reportes, no la interacción operativa de marcarlos "listo".
- El escaneo de QR y registro de tickets — también exclusivo de la app, no del panel.
- **Marcar un producto/extra como "agotado"** también está disponible en la app modo staff, como acción rápida sobre el menú ya cargado (no pueden crear ni editar nada más del menú) — se detalla en el diseño de la Fase de app.

## Estado

Acceso admin-only y pantalla de Clientes con búsqueda parcial: **confirmados**. Boceto visual en camino para terminar de aprobar la fase.
