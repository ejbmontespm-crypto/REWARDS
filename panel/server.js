import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

// SPA con enrutado por hash (#/dashboard, etc.) — cualquier ruta que no
// sea un archivo estático cae en index.html, el router de public/js hace
// el resto en el navegador. No necesita build step, es JS plano.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Panel escuchando en http://localhost:${PORT}`);
});
