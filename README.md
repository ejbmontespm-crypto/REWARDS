# Programa de lealtad — Café

Sistema de lealtad para la cafetería: backend, panel de control (staff/admin) y una app Expo con modo cliente y modo staff.

- [`plan-maestro-programa-lealtad.md`](plan-maestro-programa-lealtad.md) — reglas de negocio.
- [`roadmap-construccion.md`](roadmap-construccion.md) — qué está construido y qué falta.
- `fase1` a `fase8` — diseño detallado de cada bloque, todos congelados.

## Correr todo junto (desarrollo)

Tres servicios, cada uno en su propia terminal:

```bash
cd backend && npm run dev        # http://localhost:3000 — API
cd panel && PORT=4100 npm run dev # http://localhost:4100 — panel staff/admin (navegador)
cd app-cliente && npx expo start  # QR para Expo Go — app cliente/staff (celular)
```

Cada carpeta trae su propio README con el detalle de configuración:

- [`backend/README.md`](backend/README.md) — variables de entorno (todas las claves y secretos viven aquí).
- [`panel/README.md`](panel/README.md).
- [`app-cliente/README.md`](app-cliente/README.md) — incluye la IP de red que hay que ajustar para que el celular conecte (puede cambiar si tu router reasigna direcciones).

Los tres servicios se hablan por HTTP en texto plano — es la configuración de desarrollo local, no de producción.
