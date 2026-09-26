# Plan maestro — Programa de lealtad para cafetería universitaria

> Este documento consolida todas las decisiones tomadas a partir de [master-prompt-programa-lealtad.md](master-prompt-programa-lealtad.md) y de la ronda de preguntas/respuestas posterior. Es la referencia viva del proyecto — se actualiza según avancemos de fase, no se reemplaza.

**Estado:** ✅ **Diseño completo — las 8 fases congeladas.** Fase 1 [esquema de datos](fase1-esquema-datos.md), Fase 2 [panel de control](fase2-panel-control.md), Fase 3 [app cliente](fase3-app-cliente.md), Fase 4 [correo](fase4-correo.md), Fase 5 [ciclos de vigencia](fase5-ciclos-vigencia.md), Fase 6 [backend/API](fase6-backend-api.md), Fase 7 [app modo staff/admin](fase7-app-staff.md), Fase 8 [reportes y pulido](fase8-reportes-pulido.md). **En construcción** — progreso y siguiente paso en [roadmap-construccion.md](roadmap-construccion.md).
**Metodología:** diseño-primero por fases, con aprobación explícita antes de programar cada una. Entregas de código completas (no diffs), ediciones programáticas sobre manuales, JS validado con `node -e` antes de entregar.

---

## 1. Contexto del negocio

Cafetería dentro de una universidad. Cobro real en **TPV Clip** (sin integración por API). El programa de lealtad es un sistema **paralelo e independiente**: el cliente paga en Clip como siempre, y el staff registra la venta/visita en este sistema escaneando el QR personal del cliente.

## 2. Stack técnico

| Componente | Tecnología |
|---|---|
| App cliente + staff/admin | React Native (Expo), un solo código, Android + iOS |
| Panel admin (config y reportes) | Node + Express + SPA vanilla JS, hospedado en Hostinger |
| Backend / API | Node.js + Express |
| Base de datos | Supabase (Postgres) |
| Almacenamiento de medios (promos) | Supabase Storage — archivo subido directo, embebido en la app |
| Correo | Resend |
| SMS | Diferido a fase futura (LabsMobile / 402T si se retoma) |
| WhatsApp | En pausa |
| Entorno dev | Windows, VS Code, Git/GitHub, pnpm/nodemon |
| Vista previa | Expo Go (sin cuentas de desarrollador aún) |
| Zona horaria | `America/Mexico_City` |
| Idioma | Español, sin i18n |

## 3. Arquitectura de superficies (decisión clave)

Se simplifica a **2 superficies**, no 3:

1. **App Expo — dual-rol.**
   - **Modo cliente**: registro, QR personal (dinámico), menú/carrito/pickup, saldo de puntos/créditos/visitas, historial de compras, promociones, notificaciones push.
   - **Modo staff/admin** (misma app, cambia la navegación tras login según rol): escanear QR, registrar ticket, cola de pedidos (KDS), redimir recompensas, corregir/anular registro con PIN de admin. Se instala en la tablet del mostrador con una cuenta de staff o admin.
   - Justificación: Expo da cámara (`expo-camera`) y push (`expo-notifications`) nativos, evita mantener una segunda app/PWA solo para el mostrador.

2. **Panel admin web** (Node/Express/vanilla, Hostinger) — trabajo de escritorio, no operativo de mostrador:
   - Configurar la regla de recompensa activa (y sus 3 modalidades, ver §5).
   - CRUD del menú (productos, extras, disponibilidad).
   - Crear/activar/desactivar promociones informativas.
   - Configurar fechas de vigencia de puntos y de ciclo de confirmación.
   - Gestión de cuentas de staff/admin.
   - Reportes y exportes (incluido Excel del log de notificaciones).

Todo acceso a Supabase pasa por la **API Express** (nunca directo desde la app ni el panel) — service key solo vive en el backend. Esto centraliza permisos y valida reglas de negocio en un solo lugar.

## 4. Roles y autenticación

| Rol | Alcance |
|---|---|
| **admin** | Acceso total: todo lo de staff + panel de configuración completo + gestión de cuentas de staff + reportes. |
| **staff / cajero** | Solo operación de mostrador: registrar ticket (acumulación), redimir recompensas/promos, ver cola de pedidos, y marcar un producto o extra como **agotado/disponible** desde la app (cambio rápido operativo). No puede crear ni editar productos, precios, ni configurar reglas o menú — eso sigue siendo exclusivo del panel admin. |

- Login: usuario + contraseña simple.
- Recuperación (staff): el usuario solicita reset → **el admin valida la solicitud** → se envía contraseña temporal por correo → al usarla, el sistema obliga a cambiarla de inmediato.
- **Recuperación del admin (caso especial, sin otro admin que valide)** — dos vías, ambas activas:
  1. **Código de un solo uso** enviado a un **correo de respaldo** configurado para la cuenta de admin (distinto del correo normal de login) → con ese código se genera una nueva contraseña.
  2. **Vía directa de emergencia** (*break-glass*) para cuando ni siquiera el correo de respaldo esté disponible: un mecanismo operado directamente por el desarrollador (acceso a Supabase / script de reset), fuera del flujo normal de la app. Se define el detalle técnico en la fase de backend.
- Corrección/anulación de un ticket ya registrado: requiere **PIN creado por el admin** (no se edita libremente).
- Toda acumulación y redención queda con **trazabilidad completa**: qué usuario de staff la registró, cuándo, y sobre qué cliente.
- **Login del cliente (distinto al de staff/admin): OTP por correo**, sin contraseña — código de un solo uso vía Supabase Auth ("Email OTP"), con el envío configurado por el SMTP de Resend. Evita que cientos de alumnos con contraseña olvidada saturen la validación manual del admin; la sesión queda guardada en el dispositivo tras el primer login.

## 5. Reglas de negocio — recompensas

**Una sola regla activa a la vez** en todo el negocio, configurable por el admin, con **3 modalidades posibles**:

### Modalidad A — `credito_valor_mxn` ("cd = $ MXN")
- El admin configura un **% del ticket** que se convierte en créditos ("cd").
- El admin configura el **valor de 1 cd en MXN**.
- Al redimir: los créditos cubren **hasta el 100% del costo de la bebida elegible**, nunca más (no genera cambio ni saldo negativo).
- Si los créditos disponibles no cubren el precio completo, se descuenta la cantidad equivalente en créditos y **la diferencia se paga en efectivo en caja** (fuera del sistema).
- El cliente **acepta/activa la redención desde la app**.

### Modalidad B — `credito_umbral` ("X cd = producto gratis")
- Igual acumulación en créditos que la modalidad A (% del ticket).
- Al llegar a un umbral configurable (ej. 100 cd), se habilita 1 producto gratis.
- El admin define la **lista de productos elegibles** para este canje (no necesariamente todo el menú).
- El cliente acepta la redención desde la app.

### Modalidad C — `visitas` ("X visitas = producto gratis")
- Se cuenta **máx. 1 visita/día**, sujeta a un **consumo mínimo configurable**.
- Al llegar al umbral configurable de visitas, se habilita 1 producto gratis de una **lista de productos elegibles** (configurable, independiente de la de la modalidad B).
- La app **avisa automáticamente** al cliente que tiene un premio disponible (no requiere que lo acepte primero, a diferencia de A/B).

### Reglas comunes a las 3 modalidades
- Solo una modalidad activa en todo el negocio a la vez; el admin puede cambiarla cuando quiera.
- Cada movimiento (venta o visita) guarda **qué regla y qué modalidad estaban vigentes** en ese momento — el historial no se recalcula si la regla cambia después.
- Cambiar de modalidad **no borra saldos anteriores**: quedan disponibles para canjear, solo dejan de crecer hasta reactivarse.
- **Vencimiento semestral**: el admin configura una **fecha límite de vigencia** de puntos/créditos/visitas (sin fecha de inicio, solo fin). Al llegar la fecha:
  - El saldo se pone en 0 (vía un movimiento de "expiración" — no se borra el historial).
  - Se notifica al cliente afectado por **app + correo**.
  - El sistema requiere que el **admin capture la siguiente fecha límite** manualmente (no se recalcula solo cada semestre).

## 6. Menú y pedidos (ampliación de alcance)

- El admin gestiona el menú desde el panel: productos, precio, categoría, extras.
- Extras pueden tener costo o ser gratis (configurable por extra), ej. crema batida, chocolate líquido, bombones.
- Un producto o extra puede marcarse **"agotado"** manualmente — desde el panel (admin) o desde la app en modo staff (cambio rápido del día a día, sin acceso al resto del menú).
- El cliente arma un carrito desde la app, elige **hora de pickup en slots de 15 minutos**.
- **v1: pago 100% en caja** (Clip) al recoger — la app **no procesa pagos en línea**. Los créditos, si aplican, se descuentan dentro del flujo del carrito como parte del "total a pagar en caja".
- El staff ve una **cola de pedidos (KDS)**: recibido → preparando → listo → entregado.
- Cuando el staff marca el pedido como "listo", la app **notifica por push** al cliente.
- **La acumulación y la redención de un pedido de la app se confirman hasta la entrega, no al armar el carrito** — ver §7.1, flujo unificado de cobro en el escaneo. Si el pedido se cancela, no se generan ni movimiento ni canje.
- **Cancelación por el cliente**: puede cancelar su propio pedido desde la app solo mientras sigue en estado "Recibido" — una vez que el staff empieza a prepararlo, ya no.
- **Penalización por no recoger — no es automática**: pasados 30 minutos (configurable) de la hora de pickup sin que el staff marque el pedido como entregado, aparece disponible para que el staff lo cancele a mano ("no recogido") desde su cola de pedidos — nada corre solo en segundo plano, es una decisión del staff en el momento, con dos botones explícitos ("Cancelar y aplicar penalización" / "Cancelar sin penalización").
- **La penalización aplica sobre cualquier pedido no recogido, no solo los que traían una redención asociada a ese pedido específico** — se calcula según la modalidad activa en ese momento, usando el saldo/avance real del cliente:
  - **Modalidad A (cd = $ MXN)**: se descuentan créditos equivalentes al valor del pedido, tope el saldo disponible (si no alcanza, se toma lo que haya, nunca queda negativo).
  - **Modalidad B (X cd = premio)**: si el cliente aún no llega al umbral, se reinicia todo su avance a 0; si ya tenía el premio disponible (lo haya solicitado o no), solo se descuenta el valor de un premio (el umbral), no el avance acumulado de más.
  - **Modalidad C (visitas)**: se reinician las visitas a 0, sin importar cuántas llevaba ni si el premio ya estaba disponible.
  - Es una penalización, no una reversión — el saldo nunca llegó a acreditarse formalmente por este pedido, se descuenta del histórico acumulado como consecuencia de no recogerlo.
- **Suspensión temporal de pedidos en línea**: el admin puede pausar la toma de pedidos desde el panel (ej. día muy saturado, falta de personal) sin afectar el resto del sistema — el registro de ventas de mostrador y la acumulación/redención en caja siguen funcionando normal.
- **Elegibilidad por historial de gasto**: aunque el admin tenga los pedidos en línea activos, cada cliente individual solo puede usarlos hasta juntar un gasto mínimo configurable (propuesto $100 MXN) en compras reales registradas — evita que alguien sin historial deje un pedido preparado y no lo recoja con mala intención. Se basa en el monto de los tickets, no en el saldo de créditos, así que redimir una promoción no lo afecta. Se reinicia en cada corte de vigencia de puntos (§5) — hay que volver a juntar el monto para desbloquear pedidos en línea en el nuevo periodo.

## 7. Registro e identidad del cliente

- Landing/QR fijo de mostrador → registro con: **nombre + apellido paterno (obligatorios)**, apellido materno opcional, y **teléfono y correo — ambos obligatorios** (el cliente puede empezar capturando el que prefiera, pero el registro no se completa sin los dos; así siempre hay forma de contactarlo y el correo queda garantizado para el login por OTP).
- Tipo de perfil: **alumno / docente / otro** — permite segmentar el envío de promociones por tipo de perfil.
- **QR personal dinámico**: identificador interno fijo (UUID) por cliente, pero lo que se muestra en pantalla es un **token firmado de corta vida** (30–60s, regenerado por el backend mientras la pantalla está abierta) — un screenshot viejo deja de ser válido solo por el paso del tiempo.
- Al escanear, el dispositivo del staff muestra el **nombre del cliente** para validación visual rápida (coincidencia aproximada de persona).
- El cliente puede ver en la app un **listado de sus compras** (fecha y monto de cada una).

### 7.1 Flujo unificado de cobro en el escaneo

Un solo punto de contacto para cualquier transacción — mostrador o pedido de la app — evita duplicar lógica y resuelve de paso la validación de identidad en la recogida:

1. El staff **siempre escanea el QR dinámico del cliente**, sea venta de mostrador o recogida de un pedido hecho por la app. El escaneo mismo confirma que es la persona correcta — no se necesita nada adicional para verificar identidad en la recogida.
2. La pantalla de escaneo (app, modo staff) muestra de inmediato:
   - Nombre del cliente, para validación visual.
   - **Pedido(s) pendientes por recoger** de ese cliente, con su detalle y total, si los hay.
   - **Solicitud de redención pendiente**, si el cliente ya la pidió desde la app (botón "Redimir" habilitado solo cuando ya cumple la regla vigente).
3. El staff cobra en el TPV Clip (fuera del sistema, sin cambios) y en esta misma pantalla confirma lo que corresponda: registra el ticket de una venta nueva, y/o marca un pedido como entregado, y/o aplica la redención pendiente — puede ser más de una cosa en la misma visita.
4. **La acumulación (movimiento) y la redención (canje) se generan en ese momento de confirmación, no antes.** Si un pedido se cancela o una solicitud de redención nunca se atiende, no queda ni movimiento ni canje de por medio — igual que una venta de mostrador solo se acredita hasta que el staff la registra.

Esto aplica también a las visitas (modalidad C): aunque la app avisa automáticamente que hay un premio disponible, el canje real solo se ejecuta cuando el staff lo confirma en el escaneo.

## 8. Ciclo de confirmación (contexto escolar)

- Independiente de la vigencia de puntos (§5), con su **propia fecha límite configurable** (sin fecha de inicio).
- Ejemplo dado: vigencia de puntos 15-jul-2026, fecha límite de confirmación de cuenta 01-sep-2026 — fechas separadas, pueden coincidir o no.
- Al vencer: `notificaciones_activas = false`. El cliente conserva puntos/créditos/visitas e historial — nada se borra. El propósito de esta desactivación es **únicamente evitar saturar de correos a quienes ya no estudian en la escuela** — no es un bloqueo de cuenta ni afecta su saldo.
- **Reactivación por dos vías paralelas, disponibles en cualquier momento** (no solo durante los 15 días de gracia):
  1. La **liga de confirmación** enviada por correo sigue funcionando aunque haya pasado el plazo.
  2. El staff o admin la reactiva directamente en caja en la siguiente compra del cliente.
- Todo el ciclo es configurable en cualquier momento desde el panel.

## 9. Promociones informativas

- Se crean **una por una** desde el panel (módulo dedicado).
- Cada promoción, individualmente, puede ser **imagen o PDF**.
- Se muestran **embebidas** dentro de la app: el admin sube el archivo directo a **Supabase Storage** desde el panel (decisión final) — se ve garantizado dentro del sistema, sin depender de permisos ni disponibilidad de Google Drive. Google Drive queda descartado como fuente de las promociones informativas.
- Pueden existir **varias promociones activas a la vez**; el cliente ve una lista/galería en la app.
- Cada promoción puede tener **vigencia programada (fecha inicio/fin) o no tener vigencia** — en ese caso permanece hasta que el admin la desactive manualmente.
- Al publicarse una promoción nueva, se **envía notificación automática** (app + correo) a los clientes con notificaciones activas, filtrando por tipo de perfil si aplica.

## 10. Notificaciones

- **v1: solo correo** (vía Resend). SMS queda pospuesto a una fase futura.
- Canales por defecto para todo aviso: **app (push/in-app) + correo**, simultáneos.
- Disparadores automáticos:
  - Nueva promoción publicada.
  - Recompensa disponible para canjear (modalidad visitas, aviso automático; modalidades de créditos, opcional ya que el cliente ve su saldo).
  - Pedido listo para recoger.
  - Vencimiento de puntos/créditos o de ciclo de confirmación.
- Un solo punto en el backend decide "a quién y cuándo" — correo y push son dos salidas del mismo disparador.
- Se guarda un **log de notificaciones enviadas** (destinatario, canal, tipo, fecha, éxito/fallo), exportable a **Excel** desde el panel admin.

## 11. Seguridad — consideraciones

- Backend Express como única puerta a Supabase (service key nunca en el cliente).
- QR dinámico firmado con expiración corta (ver §7) como mitigación principal contra compartir el QR (más robusto que intentar bloquear el screenshot, que en iOS no se puede impedir, solo detectar).
- PIN de admin para correcciones/anulaciones de tickets.
- **Rate limiting (aceptado)** — límite de intentos por cuenta/IP en una ventana de tiempo, para frenar abuso automatizado:
  - Login: máx. 5 intentos fallidos / 10 min por cuenta.
  - Solicitud de "olvidé mi contraseña": máx. 3 solicitudes / hora por cuenta.
  - Registro de clientes: límite por IP en una ventana corta, para evitar altas masivas por bot.
  - Se implementa una sola vez en el backend (ej. `express-rate-limit`), sin operación manual.
- Vía de recuperación de emergencia para el admin — definida en §4 (código a correo de respaldo + vía directa de desarrollador).

## 12. Entidades de datos (borrador de referencia — el esquema formal con tipos, relaciones e índices se presenta como entregable de la Fase 1)

- `clientes` — datos personales, tipo de perfil, notificaciones_activas, confirmado_en_ciclo_actual, referencia a saldo.
- `usuarios_staff` — cuentas admin/staff, rol, credenciales.
- `configuracion_recompensa` — historial versionado: modalidad (A/B/C), parámetros vigentes (%, valor cd, umbral, productos elegibles, consumo mínimo, etc.), vigente_desde.
- `saldos_cliente` — puntos/créditos/visitas disponibles por cliente (cache calculado, o vista).
- `movimientos` — ventas/visitas: cliente, staff que registró, monto, modalidad/regla aplicada en su momento, fecha.
- `canjes` — redenciones: cliente, tipo, cantidad descontada, producto (si aplica), staff que autorizó, fecha.
- `productos` / `extras` — menú, precio, disponibilidad, elegibilidad para canje.
- `pedidos` / `pedido_items` — carrito, estado (recibido/preparando/listo/entregado), hora de pickup.
- `promociones_informativas` — título, descripción, tipo de archivo (imagen/PDF), origen (Storage o Drive), fecha inicio/fin (opcional), activa, segmentación por tipo de perfil.
- `vigencias` — fecha límite de puntos, fecha límite de ciclo de confirmación (independientes), configurables sin fecha de inicio.
- `notificaciones_log` — destinatario, canal, tipo, fecha, éxito/fallo.
- `tickets_correcciones` (o campo en `movimientos`) — trazabilidad de ediciones/anulaciones con PIN y quién la hizo.

## 13. Orden de desarrollo recomendado

1. **Esquema de datos en Supabase** — congelar con aprobación explícita (siguiente entregable).
2. **Backend/API base** — auth, roles, sesiones, estructura de endpoints.
3. **Panel admin web** — reglas de recompensa, menú, promociones, ciclos, cuentas de staff, reportes. (Se hace antes que la app porque la app consume esta configuración.)
4. **App Expo — modo cliente** — registro, QR dinámico, menú/carrito/pickup, saldo, historial, promociones.
5. **App Expo — modo staff/admin** — escaneo, registro de ticket, cola de pedidos, redención, PIN de corrección.
6. **Notificaciones por correo** (Resend) — todos los disparadores del §10.
7. **Ciclos de vigencia y confirmación** — jobs programados (cron), expiración automática, notificación de vencimiento.
8. **Reportes y pulido** — exportes Excel, rate limiting, vía de recuperación de emergencia del admin.

## 14. Pendientes por confirmar

Ninguno pendiente por ahora — todas las dudas abiertas de la ronda anterior quedaron resueltas (§4, §8, §9). El siguiente paso es el esquema formal de datos (Fase 1).

## 15. Mejoras propuestas (no solicitadas originalmente)

- QR dinámico firmado con expiración corta, en vez de solo intentar bloquear screenshots (§7/§11) — aceptado.
- Vía de recuperación de emergencia para el admin (§4) — aceptado, con código a correo de respaldo + vía directa de desarrollador.
- Rate limiting en endpoints sensibles (§11) — aceptado (login, reset de contraseña, registro).
- Cola de pedidos (KDS) como pantalla dedicada para staff, formalizada como parte del diseño de la Fase 5.
