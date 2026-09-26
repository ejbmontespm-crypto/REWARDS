# Fase 4 — Integración de correo (Resend)

> Entregable de diseño, **pendiente de tu aprobación**. Cubre el único canal de correo definido para v1 — SMS queda pospuesto. Se apoya en [fase1-esquema-datos.md](fase1-esquema-datos.md) (`notificaciones_log`) y [plan-maestro-programa-lealtad.md](plan-maestro-programa-lealtad.md) §10.

## Decisión de diseño: transaccional vs. promocional

Hasta ahora tratábamos "correo" como un solo bloque, pero para que el opt-out del ciclo de confirmación (§8 del plan) tenga sentido, hay que separar dos categorías:

- **Transaccional / de cuenta** — se envía siempre, sin importar `notificaciones_activas`. Es información sobre la propia cuenta del cliente, no publicidad.
- **Promocional** — respeta `notificaciones_activas`; es justo lo que el opt-out está diseñado para frenar (avisos de promociones a quien ya no estudia ahí).

| Correo | Categoría | Disparador |
|---|---|---|
| Bienvenida / cuenta creada | Transaccional | Al registrarse |
| Código OTP de login | Transaccional | Nativo de Supabase Auth (SMTP de Resend) |
| Contraseña temporal (staff/admin) | Transaccional | Admin aprueba un reset, o código de respaldo del admin |
| Liga de confirmación de cuenta | Transaccional | Arranca un ciclo de confirmación (§8) |
| Pedido listo para recoger | Transaccional | Staff marca el pedido como "listo" |
| Recompensa disponible | Transaccional | Modalidad visitas alcanza el umbral (automático) |
| Vencimiento de puntos/créditos/visitas | Transaccional | Se ejecuta el corte de vigencia (§5) |
| **Nueva promoción publicada** | **Promocional** | Admin activa una promoción |

**✅ Adoptado como propuesto.** Solo "nueva promoción" se detiene con el opt-out; todo lo demás es sobre el estado de la propia cuenta del cliente y se envía siempre — avísame si alguno de la lista te parece que debería tratarse distinto.

## Arquitectura

Un solo módulo en el backend — el **"disparador de notificaciones"** ya mencionado en el plan — es el único lugar que decide **a quién, qué y cuándo**:

1. Un evento de negocio ocurre (se activa una promoción, se ejecuta un corte de vigencia, un pedido pasa a "listo", etc.).
2. El disparador resuelve la lista de destinatarios (ej. "todos los clientes con `notificaciones_activas=true` y perfil alumno" para una promo segmentada).
3. Para cada destinatario, arma el contenido (plantilla + datos), envía por correo vía Resend, y en paralelo dispara el push in-app.
4. Cada envío (éxito o fallo) queda registrado en `notificaciones_log` — de ahí sale el reporte exportable a Excel que pediste.

Esto evita que la lógica de "quién debe recibir qué" esté repetida en varios lugares del código.

## Manejo de fallos

- Si Resend responde error (correo inválido, cuota, etc.): se registra en `notificaciones_log` como `fallido` con el detalle del error — no se reintenta automáticamente en v1 (evita mandar duplicados si el error fue temporal). El admin puede ver los fallos en el reporte.
- El OTP de login es la excepción — ahí si el envío falla, el cliente lo nota de inmediato (no le llega el código) y puede tocar "Reenviar".

## Remitente y dominio

**✅ Resuelto — no bloquea el desarrollo.** Resend permite mandar correos de prueba (a tu propia cuenta) sin dominio verificado, así que toda la integración se construye y se prueba ahora. Verificar un dominio propio **solo hace falta para mandarle correos a gente real** (estudiantes, staff) — se hace cuando decidas contratarlo, sin tener que tocar el código ya construido.

## Plantilla visual

**Profesional, con buena jerarquía y un acento de color** — sin depender de una identidad de marca que aún no existe (fácil de vestir con tu logo/colores reales después, sin tocar la lógica de envío). Estructura: encabezado con el nombre del programa, cuerpo claro, botón de acción cuando aplique, pie con "gestiona tus notificaciones" solo en los correos promocionales.

## Área de notificaciones en la app

**Adición 11 sep 2026** (documentada en [fase3-app-cliente.md](fase3-app-cliente.md) §4.1): se agrega una bandeja de notificaciones dentro de la app — ícono de campana en Inicio con contador de no leídas, historial completo, cada una navega a su pantalla relacionada al tocarla. Es el mismo contenido que se manda por correo, pero además queda disponible dentro de la app (no solo como push que desaparece). Lo que antes era el renglón "Notificaciones" en Perfil pasa a llamarse **"Preferencias de notificaciones"** (activar/desactivar), separado de la bandeja.

## Estado

Las 3 preguntas quedan resueltas. **Fase 4 congelada.**
