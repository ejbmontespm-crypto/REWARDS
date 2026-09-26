# Backend — Programa de lealtad

API Express, único punto de acceso a la base de datos (ver `fase1-esquema-datos.md` §"Seguridad de acceso" y `fase6-backend-api.md`). Conexión directa a Postgres (no vía la API REST de Supabase) — por eso casi todo el backend funciona sin la service role key; esa key solo hace falta para lo que sí depende de Supabase Auth (login de cliente, ver abajo).

## Arranque

```bash
npm install
cp .env.example .env   # llena los valores reales — ver la tabla de abajo
npm run dev             # http://localhost:3000 — /salud responde { ok: true }
```

Para que un celular en la misma red (Expo Go) o el panel en otra máquina se conecten, el backend ya escucha en todas las interfaces (`app.listen(PORT)`, sin restringir a localhost) — solo hace falta que el firewall de Windows permita el puerto 3000.

## Variables de entorno

Todas viven en `.env` (nunca se sube a git — ver `.gitignore`). `.env.example` trae la misma lista con comentarios inline; esta tabla es el resumen rápido:

| Variable | Para qué | Sensible | Dónde conseguirla |
|---|---|---|---|
| `DATABASE_URL` | Conexión directa a Postgres (todo el backend la usa) | Sí — trae la contraseña de la base | Supabase → Project Settings → Database → Connect → Session pooler |
| `PORT` | Puerto local del backend (default 3000) | No | — |
| `JWT_SECRET` | Firma los JWT de sesión de staff/admin | Sí | Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Duración de la sesión de staff (default `12h`) | No | — |
| `QR_SECRET` | Firma el token dinámico y rotativo del QR del cliente — **distinto** de `JWT_SECRET` a propósito (son identidades distintas: sesión de staff vs. token momentáneo de escaneo) | Sí | Generar igual que `JWT_SECRET`, con un valor distinto |
| `SUPABASE_URL` | URL del proyecto de Supabase | No (es pública) | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Verificar sesiones de cliente por OTP y crear su cuenta de Supabase Auth al registrarse — **nunca** debe usarse en el panel ni en la app (esos usan la `anon` key, que sí es pública); esta se salta todas las reglas de RLS | **Sí, muy** | Supabase → Project Settings → API → "service_role" |
| `CLIENTE_SECRET` | Firma la sesión propia del cliente para los dos casos que no pasan por Supabase Auth: el primer login implícito al registrarse, y el acceso asistido con código presencial | Sí | Generar igual que `JWT_SECRET`, con un valor distinto |

Tres secretos de firma distintos (`JWT_SECRET`, `QR_SECRET`, `CLIENTE_SECRET`) a propósito — cada uno protege una cosa diferente; si uno se filtra, los otros dos siguen firmes.

## Cuentas de staff/admin

No hay forma de crear la primera cuenta admin desde la API (crear cuentas requiere ya ser admin). Se hace una sola vez con:

```bash
node scripts/crear-admin.mjs --usuario ejbmontes@hotmail.com --nombre "Enrique Bejar" \
  --correo ejbmontes@hotmail.com --correo-respaldo ejbmontes.pm@gmail.com --password "temporal123"
```

Queda con contraseña temporal — el primer login pide cambiarla.

### Recuperación de emergencia

Si ni el login normal ni "olvidé mi contraseña" (correo de respaldo) funcionan — por ejemplo, si el correo de respaldo también se perdió, o Resend está caído — hay un último recurso que se corre a mano desde esta terminal, nunca desde la app ni el panel:

```bash
node scripts/reset-admin-emergencia.js --usuario ejbmontes@hotmail.com
```

Genera una contraseña temporal nueva y la imprime en pantalla (nunca la manda por correo — ese es justo el canal que puede estar fallando). Deliberadamente low-tech: es un comando, no una funcionalidad del sistema, así que no hay una puerta nueva que proteger en la app.

## Estructura

```
src/
  config/     variables de entorno, conexión a Postgres (con los type parsers de fecha/enum-array), cliente admin de Supabase
  lib/        helpers compartidos: errores, recompensa/vigencia (con el cálculo de zona horaria México), QR token, correo (stub), Excel, notificaciones
  middleware/ auth (staff JWT, cliente OTP/propio, y la combinación de ambos), rate limiting, manejo de errores
  routes/     un archivo por grupo de recursos, igual a fase6-backend-api.md
  app.js      arma la app de Express (incluye /assets, estático, para el logo de Apariencia)
  server.js   arranca el servidor + el cron diario de ciclos de vigencia
scripts/
  crear-admin.mjs            bootstrap de la primera cuenta admin
  reset-admin-emergencia.js  recuperación de emergencia (ver arriba)
public/assets/
  logo-provisional.svg       logo por defecto de la app cliente (Apariencia, panel)
```

## Estado

Ver [roadmap-construccion.md](../roadmap-construccion.md). Backend completo (bloque 2): todos los grupos de rutas construidos y probados contra la base real, incluida la sesión de cliente (OTP real + acceso asistido) desde que se conectó la service role key.
