import { Router } from "express";
import { query, getClient } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";

export const configuracionRecompensaRouter = Router();

const MODALIDADES = ["credito_valor_mxn", "credito_umbral", "visitas"];

/** Campos obligatorios por modalidad — refleja chk_parametros_por_modalidad del esquema,
 *  para dar un error claro antes de que lo rechace la base. */
function validarParametros(modalidad, body) {
  if (modalidad === "credito_valor_mxn") {
    if (body.porcentaje_acumulacion == null || body.valor_cd_mxn == null) {
      throw badRequest("credito_valor_mxn necesita porcentaje_acumulacion y valor_cd_mxn");
    }
  } else if (modalidad === "credito_umbral") {
    if (body.porcentaje_acumulacion == null || body.umbral_cd == null) {
      throw badRequest("credito_umbral necesita porcentaje_acumulacion y umbral_cd");
    }
    if (!Array.isArray(body.producto_ids) || body.producto_ids.length === 0) {
      throw badRequest("credito_umbral necesita al menos un producto elegible (producto_ids)");
    }
  } else if (modalidad === "visitas") {
    if (body.umbral_visitas == null || body.consumo_minimo_mxn == null) {
      throw badRequest("visitas necesita umbral_visitas y consumo_minimo_mxn");
    }
    if (!Array.isArray(body.producto_ids) || body.producto_ids.length === 0) {
      throw badRequest("visitas necesita al menos un producto elegible (producto_ids)");
    }
  }
}

async function conProductosElegibles(configs) {
  if (configs.length === 0) return configs;
  const ids = configs.map((c) => c.id);
  const { rows } = await query(
    `select cpe.configuracion_recompensa_id, p.id, p.nombre
     from configuracion_recompensa_productos_elegibles cpe
     join productos p on p.id = cpe.producto_id
     where cpe.configuracion_recompensa_id = any($1::uuid[])`,
    [ids]
  );
  return configs.map((c) => ({
    ...c,
    productos_elegibles: rows.filter((r) => r.configuracion_recompensa_id === c.id).map((r) => ({ id: r.id, nombre: r.nombre })),
  }));
}

// ---------------------------------------------------------------------
// GET /configuracion-recompensa/activa
// Pública a propósito: no es información sensible (se muestra en la app
// a cualquier cliente) y así no queda bloqueada por la sesión de cliente,
// que todavía no está conectada (falta la service role key).
// ---------------------------------------------------------------------
configuracionRecompensaRouter.get(
  "/activa",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select * from configuracion_recompensa where vigente_hasta is null`);
    if (!rows[0]) return res.json({ configuracion: null });
    const [conFull] = await conProductosElegibles(rows);
    res.json({ configuracion: conFull });
  })
);

// ---------------------------------------------------------------------
// GET /configuracion-recompensa/historial  (admin)
// ---------------------------------------------------------------------
configuracionRecompensaRouter.get(
  "/historial",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select cr.*, u.nombre_completo as creado_por_nombre
       from configuracion_recompensa cr
       left join usuarios_staff u on u.id = cr.creado_por
       order by cr.vigente_desde desc`
    );
    const conFull = await conProductosElegibles(rows);
    res.json({ historial: conFull });
  })
);

// ---------------------------------------------------------------------
// POST /configuracion-recompensa  (admin — cambia la regla activa)
// ---------------------------------------------------------------------
configuracionRecompensaRouter.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { modalidad, porcentaje_acumulacion, valor_cd_mxn, umbral_cd, umbral_visitas, consumo_minimo_mxn, producto_ids } =
      req.body || {};

    if (!MODALIDADES.includes(modalidad)) throw badRequest(`modalidad debe ser una de: ${MODALIDADES.join(", ")}`);
    validarParametros(modalidad, req.body || {});

    const client = await getClient();
    try {
      await client.query("begin");

      // Cierra la regla activa anterior, si hay una.
      await client.query(`update configuracion_recompensa set vigente_hasta = now() where vigente_hasta is null`);

      const { rows } = await client.query(
        `insert into configuracion_recompensa
           (modalidad, porcentaje_acumulacion, valor_cd_mxn, umbral_cd, umbral_visitas, consumo_minimo_mxn, creado_por)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [modalidad, porcentaje_acumulacion ?? null, valor_cd_mxn ?? null, umbral_cd ?? null, umbral_visitas ?? null, consumo_minimo_mxn ?? null, req.staff.id]
      );
      const nueva = rows[0];

      if (Array.isArray(producto_ids)) {
        for (const productoId of producto_ids) {
          await client.query(
            `insert into configuracion_recompensa_productos_elegibles (configuracion_recompensa_id, producto_id) values ($1, $2)`,
            [nueva.id, productoId]
          );
        }
      }

      await client.query("commit");
      const [conFull] = await conProductosElegibles([nueva]);
      res.status(201).json({ configuracion: conFull });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  })
);
