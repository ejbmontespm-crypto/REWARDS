# Fase 5 — Ciclos de vigencia y confirmación (mecánica de ejecución)

> Entregable de diseño, **pendiente de tu aprobación**. Las reglas de negocio ya estaban definidas en [plan-maestro-programa-lealtad.md](plan-maestro-programa-lealtad.md) §5 y §8 — esta fase define **cómo se ejecutan en la práctica**: el job que corre, en qué orden, y a quién le toca qué. Se apoya en `ciclos_vigencia` de [fase1-esquema-datos.md](fase1-esquema-datos.md).

## Los dos ciclos son independientes (recordatorio)

- **Vigencia de puntos/créditos/visitas** (§5): un solo paso — al llegar la fecha, se ponen en 0 vía canje `expiracion_*`, se notifica, y se reinicia `ciclo_gasto_desde` (el contador de pedidos en línea).
- **Ciclo de confirmación de cuenta** (§8): dos pasos separados por el plazo de gracia — primero se invita a confirmar, después (si no confirmaron) se desactivan las notificaciones.

Cada uno vive en su propia fila de `ciclos_vigencia`, con su propia `fecha_limite`, y el admin captura la siguiente manualmente cuando el job ya ejecutó la anterior (§6 del panel).

## El job (cron diario)

Un solo proceso programado corre una vez al día y revisa `ciclos_vigencia`:

### A.0 — Aviso anticipado (adición, confirmado)
`tipo = 'puntos_creditos_visitas'`, no ejecutado, `aviso_previo_enviado_en` vacío, y `hoy` está a **7 días o menos** de `fecha_limite` (configurable, `vigencia_aviso_previo_dias`):
1. Notifica a clientes con saldo > 0: "tus créditos/visitas vencen en N días, aprovéchalos antes de que se pierdan".
2. Marca `aviso_previo_enviado_en = ahora()` (para no repetir el aviso cada día durante esa ventana).

### A. `tipo = 'puntos_creditos_visitas'`, no ejecutado, `fecha_limite <= hoy`
1. Para cada cliente con saldo > 0: genera el canje `expiracion_creditos` y/o `expiracion_visitas` por el saldo disponible completo (saldo → 0). El historial de `movimientos` no se toca.
2. Actualiza `clientes.ciclo_gasto_desde = ahora()` para todos — reinicia el contador de elegibilidad de pedidos en línea.
3. Notifica (correo + push, transaccional — se envía siempre) a los clientes afectados: "tus créditos/visitas vencieron".
4. Marca la fila `ejecutado = true`, `ejecutado_en = ahora()`.

### B. `tipo = 'confirmacion_cuenta'` — dos momentos distintos en la misma fila

**Paso 1 — al llegar `fecha_limite`** (si `notificado_en` sigue vacío):
1. Selecciona clientes con `notificaciones_activas = true`.
2. Les pone `confirmado_en_ciclo_actual = false` (todos deben reconfirmar este ciclo, sin importar si confirmaron el anterior).
3. Les manda el correo con la liga de confirmación (transaccional).
4. Marca `notificado_en = ahora()` en la fila.

**Paso 1.5 — recordatorio a medio plazo de gracia (adición, confirmado)**, cuando `hoy >= fecha_limite + plazo_gracia_dias/2` y `aviso_previo_enviado_en` sigue vacío:
1. A quien de los invitados en el paso 1 sigue con `confirmado_en_ciclo_actual = false`, se le manda un recordatorio: "te quedan X días para confirmar tu cuenta, no pierdas tus avisos de promociones".
2. Marca `aviso_previo_enviado_en = ahora()`.

**Paso 2 — al llegar `fecha_limite + plazo_gracia_dias`** (si `notificado_en` ya tiene valor y aún no `ejecutado`):
1. De los clientes que recibieron la invitación en el paso 1, a quien sigue con `confirmado_en_ciclo_actual = false` se le pone `notificaciones_activas = false`. Su saldo e historial no se tocan.
2. Marca `ejecutado = true`, `ejecutado_en = ahora()`.

**Adiciones necesarias al esquema**: `ciclos_vigencia` no tenía forma de distinguir "ya mandé la invitación" de "ya mandé el recordatorio de a medio camino" de "ya ejecuté la desactivación" — son tres momentos distintos, separados por días/semanas. Se agregan `notificado_en timestamptz` (paso 1, solo `confirmacion_cuenta`) y `aviso_previo_enviado_en timestamptz` (reutilizada por los dos tipos: el aviso anticipado de A.0, y el recordatorio de medio plazo de B — cumplen el mismo papel conceptual de "ya mandé el aviso intermedio").

## La liga de confirmación

Es **estable por cliente**, no por ciclo — el mismo enlace de "confirmar mi cuenta" sirve sin importar cuántos ciclos hayan pasado desde que se envió. Al usarla: `confirmado_en_ciclo_actual = true` y `notificaciones_activas = true`, sin importar si ya estaba inactiva desde hace tiempo. Esto es justo lo que permite la reactivación tardía por correo que ya habíamos definido (§8), sin necesitar reenviar nada.

## Reactivación presencial

Sin cambios respecto a lo ya definido: el staff/admin la activa directamente desde la ficha del cliente (app modo staff o panel), mismo efecto que usar la liga.

## Estado

✅ Ambos avisos confirmados y agregados: aviso anticipado 7 días antes del vencimiento de puntos (configurable, `vigencia_aviso_previo_dias`), y recordatorio a medio plazo de gracia en el ciclo de confirmación. **Fase 5 congelada.**
