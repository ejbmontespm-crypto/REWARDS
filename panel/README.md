# Panel de control — Programa de lealtad

SPA vanilla JS (sin build, sin framework) servida por un Express mínimo. Habla directo con el [backend](../backend) vía `fetch` — nunca toca Supabase directamente.

## Arranque

```bash
npm install
PORT=4100 npm run dev   # http://localhost:4100 — el 4000 puede estar ocupado por otra cosa en tu máquina
```

Necesita el backend corriendo en paralelo (`../backend`, por default en `http://localhost:3000`).

## Configuración

No usa `.env` — las URLs viven directo en `public/js/config.js`:

- `API_BASE_URL` — a dónde le habla el panel (`http://localhost:3000/api` en desarrollo).
- `ASSET_BASE_URL` — se calcula solo quitándole `/api` a la de arriba; ahí vive el logo que sirve el backend (`/assets/...`).

Si mueves el backend a otra máquina/puerto/dominio, solo hay que cambiar `API_BASE_URL` aquí.

## Estructura

```
public/
  index.html      shell mínimo, carga js/main.js como módulo ES
  css/styles.css  paleta neutra B2B (IBM Plex, #4338ca de acento) — es la paleta del panel mismo, no la del cliente
  js/
    config.js     URL del backend + assets
    api.js        fetch con token, normaliza errores, maneja blobs (exportar Excel)
    auth.js       sesión en localStorage
    router.js     enrutado por hash (#/dashboard, etc.), sin dependencias
    layout.js     sidebar + header, compartido por toda pantalla autenticada
    ui.js         helpers (formatos, escape HTML, toast apilable, modal, descarga de archivos)
    icons.js      íconos SVG en línea
    screens/      un archivo por pantalla: dashboard, recompensa, menu, promociones,
                  vigencias, clientes, cuentas, reportes, apariencia
```

## Estado

Ver [roadmap-construccion.md](../roadmap-construccion.md), bloque 3. Las 9 pantallas están construidas y probadas contra la base real, más una décima no prevista en el diseño original (**Apariencia** — paleta de colores y logo de la app cliente, configurables aquí). Solo falta el despliegue a Hostinger.
