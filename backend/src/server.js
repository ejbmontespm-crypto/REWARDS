import cron from "node-cron";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { ejecutarCiclosVigencia } from "./lib/cicloVigencia.js";

app.listen(env.port, () => {
  console.log(`API escuchando en http://localhost:${env.port}  (salud: /salud)`);
});

// Job diario de vigencias (fase5-ciclos-vigencia.md) — 3:00 am hora de México.
// Es seguro correrlo más de una vez: cada paso revisa sus propias
// banderas antes de actuar. POST /ciclos-vigencia/ejecutar hace lo mismo
// a mano, por si el servidor estuvo caído a esa hora o para pruebas.
cron.schedule(
  "0 3 * * *",
  async () => {
    try {
      const resultados = await ejecutarCiclosVigencia();
      if (resultados.length) console.log("Ciclos de vigencia ejecutados:", resultados);
    } catch (err) {
      console.error("Error corriendo el job de ciclos de vigencia:", err);
    }
  },
  { timezone: "America/Mexico_City" }
);
