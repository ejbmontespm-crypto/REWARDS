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

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
