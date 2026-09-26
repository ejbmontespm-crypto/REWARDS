# Roadmap de construcción — Programa de lealtad

> Ruta de construcción, en el orden de dependencia real (§13 del [plan maestro](plan-maestro-programa-lealtad.md)). Se va palomeando conforme avanzamos — es la referencia viva de "en qué vamos", distinta de los documentos de diseño (`fase1` a `fase8`, ya todos congelados) que describen *qué* se construye. Esta versión (25 sep 2026) resume lo ya funcional y reordena lo pendiente en fases nuevas, empezando por una fase de correcciones puntuales antes de continuar.

## Resumen de lo ya funcional

Los 5 bloques base del diseño original están completos y probados de punta a punta contra la base real: **esquema de datos** (21 tablas, RLS), **backend/API** (todos los endpoints de fase6), **panel de control** (todas las pantallas de fase2 excepto el despliegue), **app cliente** (todas las pantallas de fase3, ya probadas en Expo Go en celular real) y **app staff/admin** (todas las pantallas de fase7). También están completos los **ciclos de vigencia** (job diario) y, dentro del bloque de correo, el **disparador de notificaciones** (correo + push por evento, aunque el envío real de correo sigue en stub).

Además, se construyó una pieza que no estaba en el diseño original: **Apariencia configurable**. El panel tiene una pantalla (`panel/public/js/screens/apariencia.js`) donde el admin sube el logo y define 4 colores (fondo, superficie, texto, acento) para la app del cliente — el panel conserva su propia paleta B2B fija, no se re-brandea a sí mismo. La app lee esa paleta una sola vez al arrancar (`lib/contextoTema.js`), con un botón **"Actualizar apariencia"** en Perfil (cliente) y Más (staff) para refrescarla sin reabrir la app. `textoMuted` y `borde` se calculan mezclando texto/superficie (no son configurables aparte) para que siempre queden legibles.

Detalle completo de todo lo anterior: ver el historial en el control de versiones o los documentos `fase1` a `fase8`. Esta versión del roadmap solo detalla lo que sigue.

---

## Fase A — Correcciones puntuales (antes de continuar)

Ronda de ajustes sobre lo ya construido, detectados al retomar el proyecto (25 sep 2026).

- [ ] **Staff sin botón "Entregado" en Cola de pedidos**: hoy el KDS (`app-cliente/app/(staff)/cola.js`) solo avanza Recibido→Preparando→Listo — para marcar "Entregado" el staff tiene que ir a Escanear o Buscar cliente y confirmar ahí (`ResultadoCliente.js`). Se agrega el botón directo en la tarjeta de "Listo" (requiere exponer `cliente_id` en `GET /pedidos/cola`, hoy no viaja).
- [x] **¿La entrega cuenta automático para la recompensa?** — confirmado por código: `POST /movimientos` con `pedido_id` genera la acumulación (créditos/visita) y, si el pedido traía créditos aplicados, también el canje correspondiente, todo en la misma llamada (`backend/src/routes/movimientos.routes.js`). No requiere cambios, solo quedó documentado aquí.
- [ ] **Botón de "Mi QR" en Inicio**: mejorar la vista y darle proporción 1:1 (hoy es un botón rectangular ancho, `app-cliente/app/(tabs)/index.js`, estilo `botonQr`).
- [ ] **Espacio superior chocando con el notch**: bajar el inicio del contenido en pantallas con encabezado propio para respetar el área segura del celular (`SafeAreaView`/`useSafeAreaInsets`).
- [ ] **Auditoría de colores hardcodeados**: quedan valores fijos fuera del tema configurable (ej. banner amarillo `#fff7e6`/`#f0dba9` repetido en Inicio, Menú y Perfil). Pasarlos a `colores` del contexto o, si deben ser un color nuevo de estado (no de marca), agregarlos como quinto valor configurable en Apariencia.
- [ ] **Horario de servicio configurable**: agregar clave en `configuracion_sistema` (apertura/cierre), pantalla en el panel para editarla, y validación en `POST /pedidos` para rechazar pedidos en línea fuera de horario.
- [ ] **Promoción vinculada al menú**: permitir que al crear una promoción se genere/asocie un producto de catálogo, para que se pueda pedir esa promo desde Menú/Carrito como cualquier otro producto.
- [ ] **Notificaciones configurables + sonido propio**: revisar viabilidad de un tono de notificación específico de la app (cliente: cambio de estatus de pedido; staff: pedido nuevo recibido) — depende de push real, ver Fase C.

## Fase B — Panel: despliegue

- [ ] Desplegado en Hostinger (único pendiente del bloque de panel de control).

*(Diseño completo en [fase2-panel-control.md](fase2-panel-control.md).)*

## Fase C — Correo y notificaciones (Resend + push)

- [ ] SMTP de Resend conectado en Supabase Auth (hoy el envío real es un stub que solo imprime en consola, `backend/lib/mailer.js`) — para que el OTP llegue por correo de verdad.
- [ ] Plantilla de correo profesional (hoy texto plano).
- [ ] Dominio verificado en Resend *(pendiente de que se decida contratarlo — no bloquea lo demás)*.
- [ ] Eventos de notificación que dependen de la app ya construida (pedido listo, recompensa disponible) — el disparador genérico ya existe (`lib/notificar.js`), falta conectar estos dos casos puntuales.
- [ ] Bandeja de notificaciones del cliente (`GET /notificaciones/mias`) — hoy es un placeholder en Inicio (ícono de campana).
- [ ] Notificaciones push reales con sonido configurable (ligado al punto de Fase A sobre tono de notificación).

*(Diseño completo en [fase4-correo.md](fase4-correo.md).)*

## Fase D — Reportes y pulido final

- [ ] Monitoreo de errores (Sentry) — pendiente de crear la cuenta gratis y compartir el DSN del proyecto.
- [ ] Checklist de contrataciones (dominio, Google Play, Apple Developer) — según se decida avanzar.

*(Diseño completo en [fase8-reportes-pulido.md](fase8-reportes-pulido.md). El resto de ese bloque — script de recuperación de emergencia del admin, variables de entorno documentadas, apariencia reactiva — ya está hecho, ver resumen arriba.)*

---

**Progreso actual:** los 5 bloques base del diseño original están completos (esquema de datos, backend, panel salvo despliegue, app cliente, app staff), igual que ciclos de vigencia y el disparador de notificaciones. Antes de seguir con correo/despliegue se ejecuta la **Fase A** (correcciones puntuales de esta sesión); después, Fase B (Hostinger), Fase C (correo + notificaciones reales) y Fase D (monitoreo y checklist final de tiendas).
