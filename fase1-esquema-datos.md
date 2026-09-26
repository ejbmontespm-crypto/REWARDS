# Fase 1 — Esquema de datos (Supabase / PostgreSQL)

> **✅ Congelado y aprobado.** Este es el diseño de referencia para las migraciones reales, que se generan y aplican al iniciar el trabajo de backend (Fase 2 en adelante puede referenciarlo con confianza). Complementa [plan-maestro-programa-lealtad.md](plan-maestro-programa-lealtad.md) §12. Cualquier cambio futuro a estas tablas se hace por migración nueva, no editando este archivo en sitio — se documenta el cambio y el motivo.

## Historial de cambios post-congelación

- **11 sep 2026** — Flujo unificado de cobro en el escaneo (pedidos de la app + redenciones se confirman ahí, no al armar el carrito). Se agregan `movimientos.pedido_id` (liga el movimiento generado al confirmar un pedido) y la tabla `solicitudes_canje` (el "quiero redimir" del cliente desde la app, en espera de que el staff lo atienda en caja). Ver detalle al final del SQL.
- **11 sep 2026** — Login del cliente: correo (OTP) como único canal automático + respaldo presencial para quien no tiene correo o nunca le llega. Se agrega la tabla `codigos_acceso_asistido` (código de un solo uso generado por staff/admin en persona).
- **11 sep 2026** — Penalización por no recoger un pedido (aplicada a mano por el staff, no automática; aplica sobre cualquier pedido no recogido según la modalidad activa, no solo los que traían una redención asociada) y suspensión temporal de pedidos en línea. Se agrega `no_recogido` a `estado_pedido`, `penalizacion_creditos`/`penalizacion_visitas` a `tipo_canje`, y dos claves en `configuracion_sistema` (`pedidos_tolerancia_minutos`, `pedidos_en_linea_activos`). Se actualiza `saldos_cliente_v` para incluir las penalizaciones en lo ya canjeado.
- **11 sep 2026** — Elegibilidad de pedidos en línea por historial de gasto: un cliente no puede usar pedidos en línea hasta juntar un gasto mínimo configurable (propuesto $100 MXN), basado en el monto real de sus tickets (no se ve afectado por redenciones). Se reinicia en cada corte de vigencia de puntos. Se agrega `clientes.ciclo_gasto_desde`, la vista `elegibilidad_pedidos_v`, y la clave `pedidos_gasto_minimo_mxn` en `configuracion_sistema`.
- **11 sep 2026** — Teléfono y correo pasan de "al menos uno" a **ambos obligatorios** en el registro (el cliente puede empezar por cualquiera de los dos en la pantalla, pero al terminar quedan los dos capturados). `clientes.telefono` y `clientes.correo` cambian a `not null`; se retira `chk_contacto_obligatorio`. Efecto colateral positivo: desaparece el caso de un cliente sin correo que solo podía entrar por acceso asistido — ese mecanismo queda exclusivamente para cuando el correo falla en la entrega, no como única vía de acceso.
- **11 sep 2026** — Bandeja de notificaciones en la app: se agrega `notificaciones_log.leido_en` (nullable; null = no leída) para que la app pueda mostrar el historial de avisos de cada cliente y marcarlos como leídos, reutilizando la misma tabla que ya sirve para el reporte del admin.
- **13 sep 2026** — Mecánica de ejecución de los ciclos de vigencia ([fase5-ciclos-vigencia.md](fase5-ciclos-vigencia.md)): el ciclo de confirmación necesita distinguir tres momentos (invitar / recordar a medio plazo / desactivar), y el de puntos necesita un aviso previo antes de vencer. Se agregan `ciclos_vigencia.notificado_en` y `ciclos_vigencia.aviso_previo_enviado_en`, y la clave `vigencia_aviso_previo_dias` en `configuracion_sistema`.

**✅ Aplicado y verificado en tu proyecto real de Supabase (24 sep 2026)** — 21 tablas creadas, todas con RLS activado, las 2 vistas (`saldos_cliente_v`, `elegibilidad_pedidos_v`) y los enums con todos sus valores presentes. Confirmado consultando el catálogo de Postgres directo, no solo "corrió sin error".

---

## Cómo está organizado

- **Catálogo/config**: `usuarios_staff`, `password_reset_solicitudes`, `configuracion_sistema`, `configuracion_recompensa` (+ elegibilidad de productos), `ciclos_vigencia`.
- **Cliente**: `clientes`.
- **Menú**: `categorias_producto`, `productos`, `extras`, `producto_extras`.
- **Actividad de lealtad**: `movimientos` (ventas registradas por staff), `correcciones_movimiento` (auditoría con PIN), `canjes` (redenciones, incluidas las expiraciones automáticas), `solicitudes_canje` (el "quiero redimir" del cliente desde la app, en espera de que el staff lo atienda en caja).
- **Pedidos**: `pedidos`, `pedido_items`, `pedido_item_extras`.
- **Comunicación**: `promociones_informativas`, `notificaciones_log`.
- **Vista calculada**: `saldos_cliente_v` — créditos y visitas disponibles, siempre `acumulado − canjeado` (igual que pide el master-prompt), sin tabla cacheada que se pueda desincronizar.

## Decisión de diseño importante: saldos como vista, no como columna cacheada

En vez de guardar `puntos_disponibles`/`visitas_disponibles` como columnas en `clientes` que hay que mantener sincronizadas a mano (con riesgo de condiciones de carrera al canjear), son una **vista calculada** (`saldos_cliente_v`) sobre `movimientos` y `canjes`. Las expiraciones semestrales se modelan como un `canje` más (tipo `expiracion_creditos` / `expiracion_visitas`), así que la fórmula "acumulado − canjeado" nunca cambia y el historial de `movimientos` queda intacto, tal como pide el punto de "nada se borra".

## Seguridad de acceso

Todas las tablas se acceden **exclusivamente desde el backend Express** con la *service role key* de Supabase — ninguna de las 3 superficies (app, panel) toca Supabase directo para leer/escribir datos.

**Corrección (14 sep 2026) a lo que decía antes esta sección**: originalmente decía que no hacía falta RLS "porque no hay anon key expuesta". Eso estaba mal — **la app sí trae integrada la llave anónima de Supabase**, porque la necesita para hablar con Supabase Auth (el login por OTP). Cualquiera que descompile la app puede extraer esa llave, y sin RLS podría usarla para leer/escribir las tablas directo vía la API automática de Supabase (PostgREST), sin pasar por el backend ni sus reglas de negocio.

**Por eso: RLS va activado (`Enable automatic RLS` al crear el proyecto) en todas las tablas, sin políticas propias.** Con RLS activado y sin políticas, el acceso queda bloqueado por default para las llaves `anon`/`authenticated` — exactamente lo que queremos, ya que nadie más que el backend debe tocar las tablas. El backend sigue con acceso total sin restricción, porque la *service role key* **ignora RLS siempre**, esté activado o no. Si en algún momento decides exponer Supabase directo a la app para algo (tiempo real, por ejemplo), ahí sí habría que escribir políticas específicas para ese caso.

---

## SQL propuesto

```sql
-- =========================================================
-- Extensiones
-- =========================================================
create extension if not exists pgcrypto; -- gen_random_uuid()

-- =========================================================
-- ENUMS
-- =========================================================
create type perfil_tipo            as enum ('alumno', 'docente', 'otro');
create type rol_staff              as enum ('admin', 'staff');
create type modalidad_recompensa   as enum ('credito_valor_mxn', 'credito_umbral', 'visitas');
create type tipo_evento_movimiento as enum ('venta', 'ajuste');
create type tipo_canje             as enum ('credito_valor_mxn', 'credito_umbral', 'visitas', 'expiracion_creditos', 'expiracion_visitas');
create type estado_pedido          as enum ('recibido', 'preparando', 'listo', 'entregado', 'cancelado');
create type tipo_archivo_promo     as enum ('imagen', 'pdf');
create type canal_notificacion     as enum ('correo', 'push');
create type tipo_notificacion      as enum ('promocion_nueva', 'recompensa_disponible', 'pedido_listo', 'vencimiento_puntos', 'vencimiento_ciclo', 'confirmacion_cuenta', 'otro');
create type estado_notificacion    as enum ('enviado', 'fallido');
create type tipo_vigencia          as enum ('puntos_creditos_visitas', 'confirmacion_cuenta');
create type accion_correccion      as enum ('editar', 'anular');
create type estado_solicitud_reset as enum ('pendiente', 'aprobada', 'usada', 'expirada', 'rechazada');

-- =========================================================
-- usuarios_staff
-- =========================================================
create table usuarios_staff (
  id uuid primary key default gen_random_uuid(),
  nombre_usuario text not null unique,
  nombre_completo text not null,
  correo text not null unique,
  correo_respaldo text,                       -- solo relevante para rol='admin'
  password_hash text not null,
  rol rol_staff not null default 'staff',
  activo boolean not null default true,
  debe_cambiar_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column usuarios_staff.correo_respaldo is
  'Correo de respaldo para recuperación de emergencia del admin (código de un solo uso).';

-- =========================================================
-- password_reset_solicitudes
-- =========================================================
create table password_reset_solicitudes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios_staff(id) on delete cascade,
  via text not null check (via in ('validacion_admin', 'correo_respaldo_admin')),
  estado estado_solicitud_reset not null default 'pendiente',
  codigo_hash text,                           -- hash del código/temporal de un solo uso
  solicitado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  resuelto_por uuid references usuarios_staff(id),
  resuelto_en timestamptz
);

create index idx_password_reset_usuario on password_reset_solicitudes(usuario_id);

-- =========================================================
-- configuracion_sistema (clave/valor para ajustes únicos, ej. PIN de corrección)
-- =========================================================
create table configuracion_sistema (
  clave text primary key,
  valor jsonb not null,
  actualizado_por uuid references usuarios_staff(id),
  actualizado_en timestamptz not null default now()
);

-- =========================================================
-- clientes
-- =========================================================
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido_paterno text not null,
  apellido_materno text,
  telefono text not null,                     -- obligatorio (adición 11 sep 2026: antes era "al menos uno")
  correo text not null,                        -- obligatorio; también es el canal de login por OTP
  tipo_perfil perfil_tipo not null default 'otro',
  notificaciones_activas boolean not null default true,
  confirmado_en_ciclo_actual boolean not null default true,
  qr_secret_version int not null default 1,   -- incrementar invalida tokens de QR previos emitidos
  auth_user_id uuid unique references auth.users(id), -- login por OTP de correo (Supabase Auth)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_clientes_telefono_unico on clientes (telefono);
create unique index idx_clientes_correo_unico   on clientes (correo);

-- =========================================================
-- Menú: categorías, productos, extras
-- =========================================================
create table categorias_producto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int not null default 0
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio numeric(10,2) not null check (precio >= 0),
  categoria_id uuid references categorias_producto(id),
  disponible boolean not null default true,   -- false = "agotado"
  imagen_path text,                           -- ruta en Supabase Storage
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table extras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  costo numeric(10,2) not null default 0 check (costo >= 0),
  disponible boolean not null default true
);

create table producto_extras (
  producto_id uuid not null references productos(id) on delete cascade,
  extra_id uuid not null references extras(id) on delete cascade,
  primary key (producto_id, extra_id)
);

-- =========================================================
-- configuracion_recompensa (historial versionado de la regla activa)
-- =========================================================
create table configuracion_recompensa (
  id uuid primary key default gen_random_uuid(),
  modalidad modalidad_recompensa not null,
  porcentaje_acumulacion numeric(5,2) check (porcentaje_acumulacion >= 0 and porcentaje_acumulacion <= 100),
  valor_cd_mxn numeric(10,2) check (valor_cd_mxn >= 0),             -- modalidad credito_valor_mxn
  umbral_cd numeric(10,2) check (umbral_cd >= 0),                   -- modalidad credito_umbral
  umbral_visitas int check (umbral_visitas >= 1),                   -- modalidad visitas
  consumo_minimo_mxn numeric(10,2) check (consumo_minimo_mxn >= 0), -- modalidad visitas
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,                                        -- null = es la regla activa
  creado_por uuid not null references usuarios_staff(id),
  created_at timestamptz not null default now(),
  constraint chk_parametros_por_modalidad check (
       (modalidad = 'credito_valor_mxn' and porcentaje_acumulacion is not null and valor_cd_mxn is not null)
    or (modalidad = 'credito_umbral'    and porcentaje_acumulacion is not null and umbral_cd is not null)
    or (modalidad = 'visitas'           and umbral_visitas is not null and consumo_minimo_mxn is not null)
  )
);

-- Solo una regla activa (vigente_hasta IS NULL) en todo el negocio a la vez
create unique index idx_una_config_activa on configuracion_recompensa ((1)) where vigente_hasta is null;

create table configuracion_recompensa_productos_elegibles (
  configuracion_recompensa_id uuid not null references configuracion_recompensa(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  primary key (configuracion_recompensa_id, producto_id)
);

-- =========================================================
-- movimientos (ventas registradas por staff al escanear el QR)
-- =========================================================
create table movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo_evento tipo_evento_movimiento not null default 'venta',
  monto numeric(10,2) not null check (monto >= 0),
  creditos_generados numeric(10,2) not null default 0 check (creditos_generados >= 0),
  cuenta_como_visita boolean not null default false,
  dia_local date not null,                    -- fecha local (America/Mexico_City) calculada por el backend
  configuracion_recompensa_id uuid not null references configuracion_recompensa(id),
  registrado_por uuid not null references usuarios_staff(id),
  nota text,
  created_at timestamptz not null default now()
);

create index idx_movimientos_cliente on movimientos(cliente_id, created_at desc);

-- máximo 1 movimiento contado como visita por cliente por día
create unique index idx_una_visita_por_dia on movimientos (cliente_id, dia_local) where cuenta_como_visita = true;

-- =========================================================
-- correcciones_movimiento (auditoría de ediciones/anulaciones con PIN)
-- =========================================================
create table correcciones_movimiento (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references movimientos(id),
  accion accion_correccion not null,
  valores_anteriores jsonb not null,
  valores_nuevos jsonb,
  realizado_por uuid not null references usuarios_staff(id),
  created_at timestamptz not null default now()
);

-- =========================================================
-- pedidos (carrito / pickup)
-- =========================================================
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  estado estado_pedido not null default 'recibido',
  hora_pickup timestamptz not null,
  total_mxn numeric(10,2) not null default 0 check (total_mxn >= 0),
  creditos_aplicados_mxn numeric(10,2) not null default 0 check (creditos_aplicados_mxn >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pedidos_cliente on pedidos(cliente_id, created_at desc);
create index idx_pedidos_estado on pedidos(estado, hora_pickup);

-- =========================================================
-- canjes (redenciones — incluye expiraciones automáticas)
-- =========================================================
create table canjes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo tipo_canje not null,
  cantidad_descontada numeric(10,2) not null check (cantidad_descontada >= 0),
  producto_id uuid references productos(id),
  monto_cubierto_mxn numeric(10,2),
  diferencia_pagada_caja numeric(10,2),
  pedido_id uuid references pedidos(id),
  configuracion_recompensa_id uuid references configuracion_recompensa(id),
  autorizado_por uuid references usuarios_staff(id),  -- null cuando es expiración automática (sistema)
  created_at timestamptz not null default now()
);

create index idx_canjes_cliente on canjes(cliente_id, created_at desc);

-- =========================================================
-- pedido_items / pedido_item_extras
-- =========================================================
create table pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad int not null default 1 check (cantidad > 0),
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),  -- snapshot al momento del pedido
  canje_id uuid references canjes(id),          -- no nulo si este item se obtuvo gratis por redención
  created_at timestamptz not null default now()
);

create table pedido_item_extras (
  id uuid primary key default gen_random_uuid(),
  pedido_item_id uuid not null references pedido_items(id) on delete cascade,
  extra_id uuid not null references extras(id),
  costo_unitario numeric(10,2) not null default 0   -- snapshot al momento del pedido
);

-- =========================================================
-- promociones_informativas
-- =========================================================
create table promociones_informativas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  tipo_archivo tipo_archivo_promo not null,
  archivo_path text not null,                 -- ruta en Supabase Storage
  fecha_inicio date,
  fecha_fin date,
  activa boolean not null default true,
  segmentos perfil_tipo[],                    -- null o vacío = todos los perfiles
  creado_por uuid not null references usuarios_staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_fechas_promo check (fecha_inicio is null or fecha_fin is null or fecha_inicio <= fecha_fin)
);

-- =========================================================
-- notificaciones_log
-- =========================================================
create table notificaciones_log (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  canal canal_notificacion not null,
  tipo tipo_notificacion not null,
  estado estado_notificacion not null,
  detalle jsonb,
  created_at timestamptz not null default now()
);

create index idx_notif_log_cliente on notificaciones_log(cliente_id, created_at desc);
create index idx_notif_log_tipo_fecha on notificaciones_log(tipo, created_at desc);

-- =========================================================
-- ciclos_vigencia (fecha límite de puntos y de confirmación — independientes)
-- =========================================================
create table ciclos_vigencia (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_vigencia not null,
  fecha_limite date not null,
  plazo_gracia_dias int,                      -- solo aplica a confirmacion_cuenta; null = sin gracia adicional
  ejecutado boolean not null default false,
  ejecutado_en timestamptz,
  creado_por uuid not null references usuarios_staff(id),
  created_at timestamptz not null default now()
);

-- Solo un ciclo pendiente (no ejecutado) por tipo a la vez
create unique index idx_un_ciclo_pendiente_por_tipo on ciclos_vigencia (tipo) where ejecutado = false;

-- =========================================================
-- Vista: saldos disponibles por cliente (acumulado - canjeado)
-- =========================================================
create view saldos_cliente_v as
select
  c.id as cliente_id,
  coalesce(acum.creditos, 0) - coalesce(canj.creditos_canjeados, 0) as creditos_disponibles,
  coalesce(acum.visitas, 0)  - coalesce(canj.visitas_canjeadas, 0)  as visitas_disponibles
from clientes c
left join (
  select
    cliente_id,
    sum(creditos_generados) as creditos,
    count(*) filter (where cuenta_como_visita) as visitas
  from movimientos
  group by cliente_id
) acum on acum.cliente_id = c.id
left join (
  select
    cliente_id,
    sum(cantidad_descontada) filter (where tipo in ('credito_valor_mxn', 'credito_umbral', 'expiracion_creditos')) as creditos_canjeados,
    sum(cantidad_descontada) filter (where tipo in ('visitas', 'expiracion_visitas')) as visitas_canjeadas
  from canjes
  group by cliente_id
) canj on canj.cliente_id = c.id;

-- =========================================================
-- Trigger genérico para updated_at
-- =========================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_usuarios_staff_updated_at before update on usuarios_staff
  for each row execute function set_updated_at();
create trigger trg_clientes_updated_at before update on clientes
  for each row execute function set_updated_at();
create trigger trg_productos_updated_at before update on productos
  for each row execute function set_updated_at();
create trigger trg_pedidos_updated_at before update on pedidos
  for each row execute function set_updated_at();
create trigger trg_promociones_updated_at before update on promociones_informativas
  for each row execute function set_updated_at();

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (11 sep 2026)
-- Flujo unificado de cobro en el escaneo: los pedidos de la app y las
-- redenciones se confirman ahí (no al armar el carrito ni al solicitarlas).
-- =========================================================

-- Liga el movimiento generado automáticamente al confirmar la entrega
-- de un pedido de la app durante el escaneo (null en una venta de mostrador
-- capturada a mano).
alter table movimientos add column pedido_id uuid references pedidos(id);

-- El "quiero redimir" que el cliente dispara desde la app queda en espera
-- aquí hasta que el staff lo atiende en el escaneo de caja. No es el canje
-- en sí (eso sigue siendo `canjes`, creado hasta que se confirma) — es la
-- señal de que hay algo pendiente por atender la próxima vez que ese
-- cliente pase por caja.
create type estado_solicitud_canje as enum ('pendiente', 'atendida', 'cancelada');

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (26 sep 2026) — Fase A de correcciones
-- =========================================================

-- Liga una promoción a un producto real de catálogo, para poder pedirla
-- desde Menú/Carrito como cualquier otro producto. Nullable: la mayoría
-- de las promos siguen siendo solo informativas (imagen/PDF), esto es
-- opcional por promo. Al pausar la promo se apaga `productos.disponible`
-- del producto ligado (no tiene sentido poder pedirla si está pausada);
-- al borrar la promo, el producto ligado se oculta (disponible = false)
-- en vez de borrarse, por si ya tiene pedidos en su historial.
alter table promociones_informativas
  add column producto_id uuid references productos(id) on delete set null;

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (26 sep 2026) — Fase A, ronda 2
-- =========================================================

-- Ventana de días/horario específica de la promo (ej. "happy hour" solo
-- viernes de 15:00 a 17:00) — independiente de fecha_inicio/fecha_fin,
-- que ya cubrían el rango de FECHAS de vigencia, no el horario del día.
-- dias_semana: null = todos los días; 0=domingo...6=sábado (mismo criterio
-- que Intl al leer el día de la semana en hora de México). hora_inicio/fin
-- en texto "HH:MM" (mismo criterio que horario_servicio en
-- configuracion_sistema) — ambas null o ambas presentes, nunca una sola.
-- Cuando una promo con producto_id tiene esta ventana configurada, el
-- pedido que la incluya debe recogerse máximo 30 min después de hacerlo
-- (POST /pedidos lo valida) — evita que alguien "aparte" el precio de
-- happy hour para recoger horas después, ya fuera de la ventana.
alter table promociones_informativas
  add column dias_semana smallint[],
  add column hora_inicio text,
  add column hora_fin text;

alter table promociones_informativas
  add constraint chk_promo_horario_par
  check (
    (hora_inicio is null and hora_fin is null) or
    (hora_inicio is not null and hora_fin is not null)
  );

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (26 sep 2026) — Fase A, ronda 4
-- =========================================================

-- Cancelar un pedido que ya está "preparando" (staff/admin) exige el PIN
-- de corrección (mismo pin_correccion ya usado para editar/anular
-- movimientos) y guardar por qué se canceló — ya se gastaron ingredientes,
-- a diferencia de cancelar uno que sigue en "recibido".
alter table pedidos add column motivo_cancelacion text;

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (26 sep 2026) — Fase A, ronda 4
-- Pago con Mercado Pago (liga de pago y, más adelante, terminal física) —
-- aditivo al flujo existente de "cobrar en caja": si el cliente ya pagó por
-- liga, el staff lo ve al confirmar la entrega y no vuelve a cobrar el
-- monto correspondiente en el escaneo.
-- =========================================================
alter table pedidos
  add column metodo_pago text,                    -- null = caja (default); 'liga_mp' | 'terminal_mp'
  add column pago_confirmado boolean not null default false,
  add column mercadopago_preference_id text,       -- id de la preferencia (liga de pago) generada
  add column mercadopago_payment_id text;          -- id del pago aprobado, una vez confirmado por el webhook

create table solicitudes_canje (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo tipo_canje not null,                    -- credito_valor_mxn / credito_umbral / visitas
  estado estado_solicitud_canje not null default 'pendiente',
  creado_en timestamptz not null default now(),
  atendida_en timestamptz,
  canje_id uuid references canjes(id)          -- se llena cuando el staff la confirma en caja
);

-- Consulta que hace la pantalla de escaneo: "¿este cliente tiene algo pendiente?"
create index idx_solicitudes_canje_pendientes on solicitudes_canje (cliente_id) where estado = 'pendiente';

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (11 sep 2026)
-- Login del cliente: correo (OTP vía Supabase Auth) es el único canal
-- automático. Para quien se registró solo con teléfono, o a quien nunca
-- le llega el correo, staff/admin genera un código presencial de un solo
-- uso desde la ficha del cliente — se captura en la misma pantalla de
-- "ingresa el código" que el OTP normal, el backend lo valida contra esta
-- tabla en vez de contra Supabase Auth.
-- =========================================================
create table codigos_acceso_asistido (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  codigo_hash text not null,
  generado_por uuid not null references usuarios_staff(id),
  expira_en timestamptz not null,
  usado_en timestamptz,
  created_at timestamptz not null default now()
);

create index idx_codigos_acceso_pendientes on codigos_acceso_asistido (cliente_id) where usado_en is null;

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (11 sep 2026)
-- Penalización por no recoger un pedido + suspensión temporal de pedidos
-- en línea. Nota de implementación: en Postgres real, un ALTER TYPE ...
-- ADD VALUE no puede usarse en la misma transacción en la que se
-- referencia el nuevo valor — al generar la migración real, esta adición
-- va en un paso separado antes de usarse.
-- =========================================================

-- Un pedido cuya hora de pickup ya pasó (+ tolerancia) y que el staff
-- nunca marcó como entregado.
alter type estado_pedido add value 'no_recogido';

-- Penalización: NO es automática. Pasados los minutos de tolerancia, el
-- pedido queda disponible en la cola del staff para marcarlo "no
-- recogido" a mano (botón explícito) — solo esa acción de staff genera
-- este canje. Aplica sobre CUALQUIER pedido no recogido, no solo los que
-- traían una redención asociada; cantidad_descontada se calcula al
-- momento, según la modalidad activa y el saldo real del cliente:
--   Modalidad A (cd=$MXN): min(saldo_disponible, valor_del_pedido_en_cd).
--   Modalidad B (X cd=premio): si saldo < umbral -> se descuenta todo el
--     saldo (reinicio a 0); si saldo >= umbral -> se descuenta solo el
--     umbral (un premio), conservando el excedente.
--   Modalidad C (visitas): se descuentan todas las visitas disponibles
--     (reinicio a 0).
-- Esta lógica vive en el backend, no en el esquema — aquí solo se
-- registra el resultado en `canjes`.
alter type tipo_canje add value 'penalizacion_creditos';
alter type tipo_canje add value 'penalizacion_visitas';

-- Ajustes configurables (reutiliza configuracion_sistema, ya existente):
--   'pedidos_tolerancia_minutos' -> {"minutos": 30}  (propuesto, confirmar)
--   'pedidos_en_linea_activos'   -> {"activo": true}  (el admin lo apaga para suspender pedidos temporalmente)

-- La vista de saldos debe contar las penalizaciones como "canjeado", igual
-- que una redención real o una expiración.
create or replace view saldos_cliente_v as
select
  c.id as cliente_id,
  coalesce(acum.creditos, 0) - coalesce(canj.creditos_canjeados, 0) as creditos_disponibles,
  coalesce(acum.visitas, 0)  - coalesce(canj.visitas_canjeadas, 0)  as visitas_disponibles
from clientes c
left join (
  select
    cliente_id,
    sum(creditos_generados) as creditos,
    count(*) filter (where cuenta_como_visita) as visitas
  from movimientos
  group by cliente_id
) acum on acum.cliente_id = c.id
left join (
  select
    cliente_id,
    sum(cantidad_descontada) filter (where tipo in ('credito_valor_mxn', 'credito_umbral', 'expiracion_creditos', 'penalizacion_creditos')) as creditos_canjeados,
    sum(cantidad_descontada) filter (where tipo in ('visitas', 'expiracion_visitas', 'penalizacion_visitas')) as visitas_canjeadas
  from canjes
  group by cliente_id
) canj on canj.cliente_id = c.id;

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (11 sep 2026)
-- Elegibilidad de pedidos en línea por historial de gasto: un cliente no
-- puede usar pedidos en línea hasta juntar un gasto mínimo configurable,
-- aunque el admin los tenga activos en general. Se basa en el monto real
-- de los tickets (movimientos.monto), no en el saldo de créditos, así que
-- redimir una promoción nunca lo afecta. Se reinicia en cada corte de
-- vigencia de puntos (el mismo job que ejecuta la expiración de §5
-- también actualiza ciclo_gasto_desde a "ahora" para todos los clientes).
-- =========================================================
alter table clientes add column ciclo_gasto_desde timestamptz not null default now();

create or replace view elegibilidad_pedidos_v as
select
  c.id as cliente_id,
  coalesce(sum(m.monto), 0) as gasto_acumulado_periodo_mxn
from clientes c
left join movimientos m
  on m.cliente_id = c.id
  and m.created_at >= c.ciclo_gasto_desde
group by c.id;

-- Ajuste configurable (reutiliza configuracion_sistema):
--   'pedidos_gasto_minimo_mxn' -> {"monto": 100}  (propuesto, confirmar)

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (11 sep 2026)
-- Bandeja de notificaciones en la app: el cliente ve su historial de
-- avisos (no solo el admin vía reporte) y puede marcarlos como leídos.
-- =========================================================
alter table notificaciones_log add column leido_en timestamptz;

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (13 sep 2026)
-- Mecánica de ejecución de ciclos_vigencia (fase5-ciclos-vigencia.md):
--   - confirmacion_cuenta tiene 3 momentos: invitar (fecha_limite) ->
--     recordar a medio plazo de gracia -> desactivar a quien no confirmó
--     (fecha_limite + plazo_gracia_dias).
--   - puntos_creditos_visitas tiene un aviso previo antes del vencimiento,
--     además de la expiración en sí.
-- =========================================================
alter table ciclos_vigencia add column notificado_en timestamptz;              -- paso 1 (solo confirmacion_cuenta): invitación enviada
alter table ciclos_vigencia add column aviso_previo_enviado_en timestamptz;     -- aviso intermedio (ambos tipos, mismo rol conceptual)

-- Ajuste configurable (reutiliza configuracion_sistema):
--   'vigencia_aviso_previo_dias' -> {"dias": 7}  (propuesto, confirmar)

-- =========================================================
-- ADICIÓN POST-CONGELACIÓN (14 sep 2026)
-- RLS explícito por tabla, sin políticas propias. No dependemos de que el
-- toggle "Enable automatic RLS" del dashboard cubra tablas creadas por SQL
-- directo — lo forzamos aquí para que quede garantizado sin importar cómo
-- se haya creado el proyecto. Con RLS activado y CERO políticas, el acceso
-- queda bloqueado por default para las llaves anon/authenticated; la
-- service role key del backend sigue con acceso total, ya que ignora RLS
-- siempre. Ver "Seguridad de acceso" al inicio del documento.
-- =========================================================
alter table usuarios_staff enable row level security;
alter table password_reset_solicitudes enable row level security;
alter table configuracion_sistema enable row level security;
alter table clientes enable row level security;
alter table categorias_producto enable row level security;
alter table productos enable row level security;
alter table extras enable row level security;
alter table producto_extras enable row level security;
alter table configuracion_recompensa enable row level security;
alter table configuracion_recompensa_productos_elegibles enable row level security;
alter table movimientos enable row level security;
alter table correcciones_movimiento enable row level security;
alter table pedidos enable row level security;
alter table canjes enable row level security;
alter table pedido_items enable row level security;
alter table pedido_item_extras enable row level security;
alter table promociones_informativas enable row level security;
alter table notificaciones_log enable row level security;
alter table ciclos_vigencia enable row level security;
alter table solicitudes_canje enable row level security;
alter table codigos_acceso_asistido enable row level security;
```

---

## Supuestos confirmados

1. **Teléfono/correo únicos** entre clientes — confirmado, no se repiten.
2. **Visita = primera compra del día de ese cliente con monto mínimo configurable** — confirmado; se modela como `movimientos.cuenta_como_visita = true` sobre una venta normal, no como evento aparte.
3. **PIN de corrección único y global** para todo el staff — confirmado, vive en `configuracion_sistema`.
4. **`plazo_gracia_dias` en `ciclos_vigencia`** se deja tal cual, como campo opcional.

## Autenticación del cliente — decidido

**OTP por correo, usando Supabase Auth** (función nativa "Email OTP"): sin contraseña ni tabla de recuperación para clientes. `clientes.auth_user_id` enlaza cada cliente con la cuenta que Supabase Auth crea en `auth.users` al verificar su primer código.

Un matiz técnico sobre "por Resend": Supabase Auth es quien genera y valida el código (esa parte no se construye a mano), pero el **envío del correo se configura para salir por el SMTP de Resend** en vez del proveedor de correo por default de Supabase — así el envío real de todos los correos del sistema (OTP incluido) pasa por la misma cuenta de Resend que ya ibas a usar para promociones y avisos. Se configura una sola vez en el dashboard de Supabase (Authentication → SMTP settings), no requiere código aparte.

## Lo que este esquema **no** resuelve todavía (a propósito)

- El mecanismo exacto de firma del QR dinámico (JWT/HMAC de corta vida) — es lógica de backend, no de esquema; se detalla en la Fase de app (usa `clientes.qr_secret_version` para poder invalidar tokens viejos si hace falta).
- Migraciones reales (`supabase migration new ...`) — se generan y aplican hasta que apruebes este diseño.

## Siguiente paso

Con tu aprobación (y la respuesta sobre autenticación de cliente), paso a la **Fase 2: Panel de control** — pantallas y flujos, antes de escribir código, como marca la metodología.
