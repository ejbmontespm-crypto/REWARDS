import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

// Railway (como cualquier proxy inverso) termina TLS y reenvía como http
// puro — sin esto, req.protocol siempre diría "http" aunque el cliente
// haya entrado por https (importante para /pago-retorno, que arma su URL
// a partir de req.protocol/req.get("host")).
app.set("trust proxy", 1);

const ORIGENES_PERMITIDOS = [
  "https://panel-production-62b8.up.railway.app",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
];

app.use(helmet());
app.use(
  cors({
    // Sin Origin (apps nativas, curl, el webhook de Mercado Pago) siempre
    // pasa — CORS solo aplica a requests de navegador con Origin.
    origin: (origin, callback) => {
      if (!origin || ORIGENES_PERMITIDOS.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin))) {
        return callback(null, true);
      }
      callback(new Error("Origen no permitido por CORS"));
    },
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/salud", (req, res) => res.json({ ok: true, servicio: "lealtad-cafe-backend" }));

// Assets de apariencia (logo) — público, sirve desde el mismo backend para
// que tanto el panel (otro origen) como la app lo puedan cargar sin líos
// de CORS/CORP (helmet por default bloquea la carga cross-origin de imágenes).
app.use(
  "/assets",
  express.static(path.join(__dirname, "..", "public", "assets"), {
    setHeaders: (res) => res.set("Cross-Origin-Resource-Policy", "cross-origin"),
  })
);

// Puente de regreso desde Mercado Pago (back_urls) — un navegador/webview no
// puede abrir un esquema personalizado (lealtadcafe://) directo como
// back_url (Mercado Pago lo rechaza, exige http/https), así que Mercado
// Pago redirige aquí y esta página mínima sí abre la app. Si el teléfono no
// tiene la app o el redirect automático no dispara (pasa en algunos
// navegadores), queda el link visible como respaldo.
app.get("/pago-retorno", (req, res) => {
  const pedidoId = typeof req.query.pedido === "string" ? req.query.pedido : "";
  const destino = `lealtadcafe://pedido/${encodeURIComponent(pedidoId)}`;
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${destino}" />
  <title>Volviendo a Lealtad Café…</title>
</head>
<body style="font-family:sans-serif;text-align:center;padding:40px 20px;">
  <p>Volviendo a la app…</p>
  <p><a href="${destino}">Si no abre sola, toca aquí</a></p>
</body>
</html>`);
});

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
