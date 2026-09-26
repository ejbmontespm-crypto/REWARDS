# Fase 8 — Reportes y pulido

> Entregable de diseño, **pendiente de tu aprobación**. Última fase de diseño antes de construir. Junta cabos sueltos que quedaron mencionados pero no detallados: catálogo de reportes, mecanismo real de recuperación de emergencia del admin, y un checklist de pulido pre-lanzamiento.

## 1. Catálogo de reportes (panel, sección Reportes — §9 de [fase2-panel-control.md](fase2-panel-control.md))

Todos con selector de rango de fechas y exportación a Excel.

| Reporte | Contenido | Filtros |
|---|---|---|
| **Ventas** | Fecha, cliente, monto, créditos generados, staff que registró | Rango de fechas, staff |
| **Canjes** | Fecha, cliente, tipo (A/B/C/expiración/penalización), cantidad descontada, producto (si aplica), autorizado por | Rango de fechas, tipo |
| **Clientes por estado** | Nombre, contacto, tipo de perfil, confirmado/no confirmado, saldo actual | Tipo de perfil, estado de confirmación |
| **Notificaciones enviadas** | Destinatario, canal, tipo, fecha, éxito/fallo | Rango de fechas, tipo, canal (ya definido en §10 del plan) |
| **Pedidos** | Cliente, items, total, estado final (entregado/cancelado/no recogido), hora de pickup | Rango de fechas, estado |

**¿Falta algún reporte que necesites** (ej. producto más vendido, ticket promedio, ranking de clientes frecuentes)? Los cinco de arriba cubren lo operativo básico; cualquier análisis más elaborado se puede agregar después sin tocar el esquema, ya que toda la data ya vive en las tablas.

## 2. Recuperación de emergencia del admin — mecanismo concreto

Quedó pendiente definir el "cómo" técnico (§4 del plan solo decía "se define en la fase de backend"). Propongo:

**Un script de línea de comandos** (`scripts/reset-admin-emergencia.js`), que:
- Corre con la *service role key* de Supabase (nunca expuesta a la app ni al panel).
- Pide el `nombre_usuario` del admin a resetear.
- Genera una contraseña temporal, la muestra en pantalla (no la manda por correo — es la vía para cuando ni el correo de respaldo funciona), y marca `debe_cambiar_password = true`.
- Solo tú (o quien tenga acceso a la terminal del servidor/repositorio) puede ejecutarlo — no es una ruta HTTP ni un botón en ninguna interfaz, así que no hay una puerta nueva que proteger en la app.

Es deliberadamente low-tech: un comando que corres tú mismo cuando de verdad no hay otra opción, no una funcionalidad más del sistema.

## 3. Checklist de pulido pre-lanzamiento

- **Variables de entorno**: separar claves de Supabase, Resend, y secretos de firma del QR/JWT en `.env`, nunca en el código.
- **Seed inicial de datos**: categorías y extras base cargados antes de que el admin empiece a usar el panel (para no arrancar con el menú vacío).
- **Backups de Supabase**: confirmar el plan de respaldo automático de tu proyecto de Supabase (el plan gratuito tiene retención limitada — vale la pena revisarlo antes de tener datos reales de clientes).
- **Monitoreo de errores**: ¿algo como Sentry (tiene plan gratuito) para enterarte si algo se rompe en producción, o mantenerlo simple con logs de archivo por ahora?
- **Checklist de contrataciones pendientes** (ya mencionadas en el master-prompt, las junto aquí para no perderlas de vista): dominio + verificación en Resend, cuenta de Google Play (~$25 USD único), cuenta de Apple Developer (~$99 USD/año) — ninguna bloquea el desarrollo, se contratan cuando decidas pasar a pruebas reales o publicar.

## Estado

✅ Los 5 reportes tal cual, script de recuperación de emergencia como se propuso, y Sentry para monitoreo de errores. **Fase 8 congelada — quedan las 8 fases de diseño completas.**
