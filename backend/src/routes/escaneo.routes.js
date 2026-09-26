import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireStaffAuth } from "../middleware/auth.js";
import { verificarTokenQr } from "../lib/qrToken.js";

export const escaneoRouter = Router();

/**
 * Todo lo que el staff podría necesitar hacer con un cliente, en un solo
 * viaje (plan §7.1) — lo comparten el escaneo real (por QR) y la búsqueda
 * manual sin QR (fase7 §4, "útil si el cliente olvidó cómo mostrar su QR").
 */
async function resolverResultadoCliente(clienteId) {
  const { rows: clienteRows } = await query(
    `select c.*, s.creditos_disponibles, s.visitas_disponibles
     from clientes c
     left join saldos_cliente_v s on s.cliente_id = c.id
     where c.id = $1`,
    [clienteId]
  );
  const cliente = clienteRows[0];
  if (!cliente) return null;

  const [pedidosPendientes, solicitudesPendientes, ultimosMovimientos] = await Promise.all([
    query(
      `select id, estado, hora_pickup, total_mxn, creditos_aplicados_mxn
       from pedidos where cliente_id = $1 and estado in ('recibido', 'preparando', 'listo')
       order by hora_pickup`,
      [cliente.id]
    ),
    query(
      `select id, tipo, creado_en from solicitudes_canje where cliente_id = $1 and estado = 'pendiente' order by creado_en`,
      [cliente.id]
    ),
    query(
      `select id, monto, creditos_generados, cuenta_como_visita, created_at
       from movimientos where cliente_id = $1 order by created_at desc limit 3`,
      [cliente.id]
    ),
  ]);

  return {
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      apellido_paterno: cliente.apellido_paterno,
      apellido_materno: cliente.apellido_materno,
      tipo_perfil: cliente.tipo_perfil,
      notificaciones_activas: cliente.notificaciones_activas,
      creditos_disponibles: cliente.creditos_disponibles,
      visitas_disponibles: cliente.visitas_disponibles,
    },
    pedidos_pendientes: pedidosPendientes.rows,
    solicitudes_canje_pendientes: solicitudesPendientes.rows,
    ultimos_movimientos: ultimosMovimientos.rows,
  };
}

// ---------------------------------------------------------------------
// GET /staff/escaneo/cliente/:id — la misma pantalla de "Resultado", pero
// llegando por búsqueda manual (sin QR) en vez de cámara. Va ANTES de
// "/:qr_token" a propósito: si fuera después, ":qr_token" atraparía
// "cliente" como si fuera el token y nunca llegaría aquí.
// ---------------------------------------------------------------------
escaneoRouter.get(
  "/cliente/:id",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const resultado = await resolverResultadoCliente(req.params.id);
    if (!resultado) throw notFound("Cliente no encontrado");
    res.json(resultado);
  })
);

// ---------------------------------------------------------------------
// GET /staff/escaneo/:qr_token
// Pantalla unificada del plan §7.1 / fase7-app-staff.md §2: resuelve al
// cliente y todo lo que el staff podría necesitar hacer con él ahí mismo.
// ---------------------------------------------------------------------
escaneoRouter.get(
  "/:qr_token",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    let payload;
    try {
      payload = verificarTokenQr(req.params.qr_token);
    } catch {
      throw badRequest("Este código ya no es válido, pídele al cliente que lo actualice", "qr_invalido");
    }

    const { rows: versionRows } = await query(`select qr_secret_version from clientes where id = $1`, [payload.cliente_id]);
    // Si el cliente regeneró su QR (ej. sospecha que se lo compartieron),
    // qr_secret_version sube y los tokens viejos ya firmados dejan de servir.
    if (!versionRows[0] || versionRows[0].qr_secret_version !== payload.v) {
      throw badRequest("Este código ya no es válido, pídele al cliente que lo actualice", "qr_invalido");
    }

    const resultado = await resolverResultadoCliente(payload.cliente_id);
    if (!resultado) throw notFound("Cliente no encontrado");
    res.json(resultado);
  })
);
