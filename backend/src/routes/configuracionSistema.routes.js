import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";
import { obtenerConfig } from "../lib/config.js";

export const configuracionSistemaRouter = Router();

// ---------------------------------------------------------------------
// GET /configuracion-sistema/publico/apariencia — pública a propósito:
// la app cliente la necesita desde Bienvenida, antes de iniciar sesión
// (paleta de colores + logo), igual que /configuracion-recompensa/activa.
// Va antes del .use(requireStaffAuth) de abajo, que blinda todo lo demás.
// ---------------------------------------------------------------------
configuracionSistemaRouter.get(
  "/publico/apariencia",
  asyncHandler(async (req, res) => {
    res.json({ apariencia: await obtenerConfig("apariencia") });
  })
);

configuracionSistemaRouter.use(requireStaffAuth, requireRole("admin"));

/**
 * Claves conocidas y cómo validar su `valor` — ya usadas por otros
 * grupos (pedidos, movimientos, vigencias) desde que se construyeron,
 * pero nunca antes expuestas para que el admin las configure de verdad.
 * `pin_correccion` es la excepción: en texto plano a propósito (plan
 * §4 dice "verlo/regenerarlo" — es un código corto de mostrador, no una
 * contraseña, y bcrypt no deja "verlo" después de guardarlo).
 */
const CLAVES = {
  pedidos_gasto_minimo_mxn: (v) => typeof v.monto === "number" && v.monto >= 0,
  pedidos_en_linea_activos: (v) => typeof v.activo === "boolean",
  pedidos_tolerancia_minutos: (v) => Number.isInteger(v.minutos) && v.minutos > 0,
  horario_servicio: (v) => {
    const esHora = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    return typeof v.activo === "boolean" && esHora(v.apertura) && esHora(v.cierre) && v.apertura < v.cierre;
  },
  vigencia_aviso_previo_dias: (v) => Number.isInteger(v.dias) && v.dias > 0,
  pin_correccion: (v) => typeof v.pin === "string" && /^\d{4,6}$/.test(v.pin),
  apariencia: (v) => {
    const esHex = (s) => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
    const esUrlOpcional = (s) => s == null || (typeof s === "string" && s.trim().length > 0);
    return (
      esHex(v.color_fondo) &&
      esHex(v.color_texto) &&
      esHex(v.color_acento) &&
      esHex(v.color_superficie) &&
      typeof v.logo_url === "string" &&
      v.logo_url.trim().length > 0 &&
      esUrlOpcional(v.logo_qr_url) &&
      esUrlOpcional(v.taza_vacia_url) &&
      esUrlOpcional(v.taza_llena_url) &&
      esUrlOpcional(v.croissant_gris_url) &&
      esUrlOpcional(v.croissant_dorado_url)
    );
  },
};

// ---------------------------------------------------------------------
// GET /configuracion-sistema  — todas las claves conocidas de una vez
// (útil para la pantalla de ajustes del panel, en vez de 5 llamadas)
// ---------------------------------------------------------------------
configuracionSistemaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(`select clave, actualizado_en, actualizado_por from configuracion_sistema`);
    const metadatos = Object.fromEntries(rows.map((r) => [r.clave, r]));

    const configuracion = {};
    for (const clave of Object.keys(CLAVES)) {
      configuracion[clave] = {
        valor: clave === "pin_correccion" && !metadatos[clave] ? null : await obtenerConfig(clave),
        configurado: Boolean(metadatos[clave]),
        actualizado_en: metadatos[clave]?.actualizado_en || null,
      };
    }
    res.json({ configuracion });
  })
);

// ---------------------------------------------------------------------
// GET /configuracion-sistema/:clave
// ---------------------------------------------------------------------
configuracionSistemaRouter.get(
  "/:clave",
  asyncHandler(async (req, res) => {
    if (!CLAVES[req.params.clave]) throw notFound(`Clave desconocida: ${req.params.clave}`);
    const valor = await obtenerConfig(req.params.clave);
    res.json({ clave: req.params.clave, valor });
  })
);

// ---------------------------------------------------------------------
// PATCH /configuracion-sistema/:clave
// ---------------------------------------------------------------------
configuracionSistemaRouter.patch(
  "/:clave",
  asyncHandler(async (req, res) => {
    const { clave } = req.params;
    const validador = CLAVES[clave];
    if (!validador) throw notFound(`Clave desconocida: ${clave}`);

    const { valor } = req.body || {};
    if (!valor || typeof valor !== "object" || !validador(valor)) {
      throw badRequest(`El valor mandado no tiene la forma esperada para "${clave}"`);
    }

    const { rows } = await query(
      `insert into configuracion_sistema (clave, valor, actualizado_por, actualizado_en)
       values ($1, $2::jsonb, $3, now())
       on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por, actualizado_en = now()
       returning clave, valor, actualizado_en`,
      [clave, JSON.stringify(valor), req.staff.id]
    );
    res.json(rows[0]);
  })
);
