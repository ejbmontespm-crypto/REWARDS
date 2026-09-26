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

app.use(helmet());
app.use(cors()); // TODO: restringir orígenes cuando el panel/app tengan dominio real
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
