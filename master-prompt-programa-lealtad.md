# Master prompt — Programa de lealtad para cafetería

Usa este documento como contexto inicial del proyecto. Antes de escribir código, sigue metodología de diseño-primero: propone el diseño de cada fase (esquema de datos, luego pantallas del panel, luego pantallas de la app) y espera mi aprobación explícita antes de pasar a la siguiente fase o de programar. Prefiere entregarme archivos completos corregidos en vez de diffs, prefiere ediciones programáticas sobre manuales, y valida cualquier JS con `node -e` antes de entregarlo.

## Contexto del negocio

Tengo una cafetería dentro de una escuela. Ya cuento con:
- TPV Clip (caja registradora, impresora de tickets, tablet) — **no se integra** por API en tiempo real, es un sistema aparte. El cobro real sigue pasando ahí sin cambios.
- Un dispositivo propio de escaneo de QR, independiente del TPV.

El programa de lealtad es un sistema **independiente**: el cliente paga en Clip como siempre, y en paralelo el staff registra la venta o visita en este sistema usando el QR personal del cliente.

## Stack técnico

- **App del cliente**: React Native (Expo), un solo código para Android + iOS.
- **Panel de control** (uso interno, para cargar promociones y configurar reglas): Node + Express + SPA en JavaScript vanilla, hospedado en Hostinger (mi stack habitual).
- **Backend / API**: Node.js + Express.
- **Base de datos**: Supabase (Postgres).
- **Entorno de desarrollo**: Windows, VS Code, Git/GitHub, pnpm/nodemon.
- **Vista previa antes de publicar**: Expo Go en mi propio celular, sin necesidad de cuentas de desarrollador todavía. Cuentas de Google Play (~$25 USD único) y Apple Developer (~$99 USD/año) solo se dan de alta cuando se vaya a probar con TestFlight/canal interno o publicar.

## Reglas de negocio — recompensas

- Solo **una regla de recompensa activa a la vez** en todo el negocio (no hay promociones que se acumulen entre sí). El tipo de regla es configurable desde el panel:
  - `puntos_porcentaje`: un % del monto del ticket se convierte en puntos.
  - `visitas`: se cuenta cada visita/consumo.
- Cada cliente tiene un **saldo disponible** por tipo (`puntos_disponibles`, `visitas_disponibles`), calculado como acumulado − canjeado. Esto permite que:
  - Si cambias de puntos a visitas (o viceversa), el saldo anterior se conserva y sigue siendo canjeable; solo deja de crecer hasta que reactives esa regla.
  - En puntos: al canjear se resta del saldo lo ya canjeado.
  - En visitas: al ser un saldo (no un listado con estado individual por visita), el saldo disponible ya refleja automáticamente "las últimas de las que no se descontó nada", sin necesitar lógica de prioridad.
- Cada movimiento (venta o visita) debe guardar qué regla estaba vigente en ese momento, para no alterar el historial pasado si la regla cambia después.

**Pendiente de definir en la fase de diseño de datos** (no asumir, preguntarme): tasa exacta de conversión de puntos a recompensa, y umbral de visitas necesario para una recompensa.

## Promociones informativas

- Sección aparte de la lógica de recompensa: promociones puramente visuales/informativas que se muestran en la app (ej. "2x1 los viernes").
- El material de cada promoción (imagen, poster, detalle) vive en una **liga de Google Drive** que yo administro — el sistema solo guarda esa liga junto con la promoción, fechas de vigencia y estado (activa/pausada). No se sube ni se diseña contenido dentro del sistema.

## Registro e identificación de clientes

- QR fijo impreso en el mostrador/mesas → apunta a una landing de registro (nombre, teléfono/correo).
- Al registrarse, el sistema genera el **QR personal** del cliente (mostrado en la app o enviable por correo/SMS para quien no instale la app).
- El staff usa el dispositivo de escaneo ya existente para leer el QR del cliente y registrar la venta/visita en el momento del cobro (proceso manual, paralelo al cobro real en Clip).

## Avisos y promociones — canales

- **Correo**: vía Resend (u opción equivalente: SendGrid, Postmark).
- **SMS**: vía un proveedor local/regional (LabsMobile o 402T Labs) — evitar Twilio para este uso por costo en México.
- **WhatsApp**: en pausa, no desarrollar en esta primera versión (posible fase futura).
- Disparadores: nueva promoción publicada, recompensa disponible para canjear, avisos generales.
- Un solo punto en el backend decide "a quién y cuándo avisar"; correo y SMS son dos salidas del mismo disparador.

## Vigencia de datos — ciclo de confirmación (contexto escolar)

Como los clientes son en su mayoría alumnos, hay que evitar seguir enviando promociones a quienes ya egresaron:

- El panel permite configurar **fechas fijas** (ej. 15 de enero y 15 de julio) en las que arranca un nuevo ciclo de confirmación — igual para todos los clientes, no es un temporizador individual.
- Al llegar la fecha, todos los clientes con notificaciones activas quedan "pendientes de confirmar" y reciben, por correo y/o SMS, una liga corta de confirmación.
- Tienen **15 días a partir del inicio de esa fecha** (plazo de gracia) para confirmar.
- Si no confirman a tiempo: `notificaciones_activas = false`. Dejan de recibir correo/SMS de promociones, pero **conservan sus puntos/visitas e historial** — nada se borra.
- Reactivación: confirmando tarde su liga, o el staff los reactiva directamente en el mostrador en su próxima compra.

## Esquema de datos (boceto de referencia — validar y ajustar en fase de diseño)

- `clientes`: id, nombre, teléfono, correo, qr_code, puntos_disponibles, visitas_disponibles, notificaciones_activas, confirmado_en_ciclo_actual
- `configuracion_recompensa`: tipo vigente, valor, historial de cambios
- `promociones_informativas`: título, descripción, liga_drive, fecha_inicio, fecha_fin, activa
- `movimientos`: cliente_id, tipo_evento (venta/visita), monto, regla_aplicada_en_su_momento, fecha
- `canjes`: cliente_id, tipo, cantidad_descontada, fecha
- `ciclos_confirmacion`: fecha_inicio (configurable), plazo_gracia_dias (15)

## Orden de desarrollo sugerido

1. Esquema de base de datos en Supabase (congelar con mi aprobación antes de seguir).
2. Panel de control (para tener dónde configurar la regla de recompensa y cargar promociones antes de que la app las consuma).
3. App del cliente (Expo/React Native).
4. Integración de correo y SMS.
5. Ciclo de confirmación semestral.

Empieza preguntándome lo que falte definir antes de proponer el esquema de base de datos.
