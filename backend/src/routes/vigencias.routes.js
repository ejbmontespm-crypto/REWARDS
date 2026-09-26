import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, conflict } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";
import { ejecutarCiclosVigencia } from "../lib/cicloVigencia.js";

export const vigenciasRouter = Router();
vigenciasRouter.use(requireStaffAuth, requireRole("admin"));

const TIPOS = ["puntos_creditos_visitas", "confirmacion_cuenta"];

// ---------------------------------------------------------------------
// GET /ciclos-vigencia?tipo=
// ---------------------------------------------------------------------
vigenciasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const condicion = req.query.tipo ? `where tipo = $1` : "";
    const { rows } = await query(
      `select cv.*, u.nombre_completo as creado_por_nombre from ciclos_vigencia cv
       left join usuarios_staff u on u.id = cv.creado_por
       ${condicion} order by cv.created_at desc`,
      req.query.tipo ? [req.query.tipo] : []
    );
    res.json({ ciclos: rows });
  })
);

// ---------------------------------------------------------------------
// POST /ciclos-vigencia
// Captura la siguiente fecha límite (fase5 §"El admin captura la
// siguiente fecha manualmente"). Si ya hay una fila pendiente para ese
// tipo y todavía no arrancó ningún paso, la EDITA en vez de crear otra
// (el índice único solo permite una pendiente por tipo). Si ya arrancó
// (se mandó la invitación / el aviso previo), hay que esperar a que
// termine su ciclo antes de capturar la siguiente.
// ---------------------------------------------------------------------
vigenciasRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { tipo, fecha_limite, plazo_gracia_dias } = req.body || {};
    if (!TIPOS.includes(tipo)) throw badRequest(`tipo debe ser uno de: ${TIPOS.join(", ")}`);
    if (!fecha_limite || Number.isNaN(Date.parse(fecha_limite))) throw badRequest("fecha_limite inválida");
    if (tipo === "confirmacion_cuenta" && !(Number.isInteger(plazo_gracia_dias) && plazo_gracia_dias > 0)) {
      throw badRequest("confirmacion_cuenta necesita plazo_gracia_dias (entero positivo)");
    }

    const { rows: pendienteRows } = await query(`select * from ciclos_vigencia where tipo = $1 and ejecutado = false`, [tipo]);
    const pendiente = pendienteRows[0];

    if (pendiente) {
      if (pendiente.notificado_en || pendiente.aviso_previo_enviado_en) {
        throw conflict("Ya hay un ciclo en curso para este tipo (ya se mandó un aviso) — espera a que termine antes de capturar otra fecha");
      }
      const { rows } = await query(
        `update ciclos_vigencia set fecha_limite = $2, plazo_gracia_dias = $3 where id = $1 returning *`,
        [pendiente.id, fecha_limite, plazo_gracia_dias ?? null]
      );
      return res.json({ ciclo: rows[0], accion: "editado" });
    }

    const { rows } = await query(
      `insert into ciclos_vigencia (tipo, fecha_limite, plazo_gracia_dias, creado_por) values ($1, $2, $3, $4) returning *`,
      [tipo, fecha_limite, plazo_gracia_dias ?? null, req.staff.id]
    );
    res.status(201).json({ ciclo: rows[0], accion: "creado" });
  })
);

// ---------------------------------------------------------------------
// POST /ciclos-vigencia/ejecutar
// Corre el job manualmente (normalmente lo dispara el cron diario del
// servidor) — pensado para probar sin esperar fechas reales, y como red
// de seguridad si el cron no corrió por alguna razón.
// ---------------------------------------------------------------------
vigenciasRouter.post(
  "/ejecutar",
  asyncHandler(async (req, res) => {
    const resultados = await ejecutarCiclosVigencia();
    res.json({ resultados });
  })
);
