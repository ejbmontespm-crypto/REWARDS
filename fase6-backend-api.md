# Fase 6 — Backend / API base (mapa de endpoints)

> Entregable de diseño, **pendiente de tu aprobación**. No es UI — es la estructura de la API Express que consumen tanto el panel como la app (ninguna de las dos toca Supabase directo, según §3 del plan). La lógica de negocio ya quedó detallada en las fases 1-5; aquí solo se organiza en rutas.

## Convenciones generales

- Base: `/api/...` (sin número de versión — proyecto propio, sin consumidores externos que necesiten esa garantía).
- Errores en formato uniforme: `{ "error": { "code": "...", "message": "..." } }`.
- Dos esquemas de autenticación distintos, cada endpoint declara cuál acepta:
  - **Staff/admin**: JWT propio, emitido al hacer login con usuario/contraseña.
  - **Cliente**: sesión de Supabase Auth (tras el OTP) — el cliente nunca ve la service role key, solo su propio token.
- Fechas en UTC en la base y la API; la conversión a `America/Mexico_City` se hace en la presentación (panel/app).

## Grupos de endpoints

### Autenticación
| Método y ruta | Quién | Descripción |
|---|---|---|
| `POST /auth/staff/login` | público | Usuario + contraseña |
| `POST /auth/staff/forgot-password` | público | Crea `password_reset_solicitudes` pendiente |
| `POST /auth/staff/reset-password/:token` | público | Usa la contraseña temporal, obliga a cambiarla |
| `POST /auth/admin/backup-code` | público | Código de un solo uso al correo de respaldo |
| `POST /auth/cliente/codigo-asistido` | staff/admin | Genera código de acceso presencial |
| `POST /auth/cliente/codigo-asistido/verificar` | público | El cliente lo usa para entrar |

*(El OTP normal del cliente lo maneja Supabase Auth directo — la app no pasa por nuestra API para eso.)*

### Clientes
| Método y ruta | Quién | Descripción |
|---|---|---|
| `POST /clientes` | público | Registro (nombre, apellidos, teléfono+correo, perfil) |
| `GET /clientes?buscar=` | admin | Búsqueda parcial (nombre/teléfono/correo) |
| `GET /clientes/:id` | admin, o el propio cliente | Ficha completa |
| `PATCH /clientes/:id` | admin (todo), cliente (solo sus propios datos) | Editar / reactivar |
| `GET /clientes/:id/saldo` | propio, staff/admin | `saldos_cliente_v` |
| `GET /clientes/:id/movimientos` | propio, admin | Historial de compras |
| `GET /clientes/:id/elegibilidad-pedidos` | propio | `elegibilidad_pedidos_v` |

### Escaneo y movimientos (staff)
| Método y ruta | Quién | Descripción |
|---|---|---|
| `GET /staff/escaneo/:qr_token` | staff/admin | Resuelve cliente + pedidos pendientes + solicitudes de canje — la pantalla unificada de §7.1 |
| `POST /movimientos` | staff/admin | Registrar venta (ticket a mano, o confirmar entrega de pedido) |
| `POST /movimientos/:id/correccion` | staff/admin + PIN | Editar/anular |

### Regla de recompensa
| Método y ruta | Quién |
|---|---|
| `GET /configuracion-recompensa/activa` | cualquier autenticado |
| `GET /configuracion-recompensa/historial` | admin |
| `POST /configuracion-recompensa` | admin |

### Canjes y solicitudes de canje
| Método y ruta | Quién |
|---|---|
| `POST /solicitudes-canje` | cliente |
| `GET /solicitudes-canje?estado=pendiente&cliente_id=` | staff/admin |
| `POST /canjes` | staff/admin (confirma en caja, incluye penalizaciones) |

### Menú
| Método y ruta | Quién |
|---|---|
| `GET /productos`, `GET /extras` | público (catálogo) |
| `POST/PATCH/DELETE /productos`, `/extras` | admin |
| `PATCH /productos/:id/disponibilidad` | staff/admin (toggle rápido "agotado") |

### Pedidos
| Método y ruta | Quién |
|---|---|
| `POST /pedidos` | cliente (respeta elegibilidad + pedidos en línea activos) |
| `GET /pedidos/mios?estado=` | cliente propio |
| `GET /pedidos/cola?estado=` | staff/admin (KDS) |
| `PATCH /pedidos/:id/estado` | staff/admin (avanza recibido→preparando→listo→entregado) |
| `POST /pedidos/:id/cancelar` | cliente propio (solo si "recibido"), o staff/admin (no recogido, con o sin penalización) |

### Promociones
| Método y ruta | Quién |
|---|---|
| `GET /promociones?activas=true` | cliente (filtradas por su perfil) |
| `POST/PATCH/DELETE /promociones` | admin |

### Vigencias
| Método y ruta | Quién |
|---|---|
| `GET/POST /ciclos-vigencia` | admin |

### Notificaciones
| Método y ruta | Quién |
|---|---|
| `GET /notificaciones/mias` | cliente propio (bandeja, §4.1 de la app) |
| `PATCH /notificaciones/:id/leido` | cliente propio |
| `GET /notificaciones/log?export=xlsx` | admin (reporte) |

### Cuentas staff/admin
| Método y ruta | Quién |
|---|---|
| `GET/POST/PATCH /usuarios-staff` | admin |
| `GET/POST /password-reset-solicitudes` | staff (crea), admin (aprueba) |

### Configuración del sistema
| Método y ruta | Quién |
|---|---|
| `GET/PATCH /configuracion-sistema/:clave` | admin — PIN, tolerancia de pedidos, gasto mínimo, pedidos en línea activos, aviso previo de vigencia, etc. |

### Procesos internos (no son endpoints públicos, corren por cron)
- Ejecución de `ciclos_vigencia` (Fase 5).
- Disparador de notificaciones (Fase 4).

## Middleware de permisos

- `requireStaffAuth` — valida el JWT propio; `requireRole('admin')` filtra las rutas exclusivas de admin.
- `requireClienteAuth` — valida la sesión de Supabase.
- **Rate limiting** (§11 del plan) en `/auth/*` y `/clientes` (registro).

## Estado

✅ Rutas en español, sin versionado (`/api/...`). **Fase 6 congelada.**
