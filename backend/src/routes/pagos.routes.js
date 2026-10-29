import { Router } from "express";
import { Preference, Payment, Point } from "mercadopago";
import { query } from "../config/db.js";
import { obtenerClienteMercadoPago } from "../config/mercadopago.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound, conflict, forbidden } from "../lib/errors.js";
import { requireClienteOStaffAuth, requireStaffAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

export const pagosRouter = Router();

/**
 * Mercado Pago (fase A, ronda 4, punto 9) — dos formas de cobrar en línea,
 * ADITIVAS al flujo existente de "cobrar en caja" (nunca lo reemplazan):
 *   1. Liga de pago (Checkout Pro): el cliente paga desde su casa/celular
 *      con una URL; se confirma sola vía webhook cuando Mercado Pago avisa.
 *   2. Terminal física (Point): el staff cobra en caja con la terminal
 *      inalámbrica — pendiente de que exista el equipo (device_id), pero
 *      el código ya queda listo para conectarse en cuanto llegue.
 * Ninguna de las dos bloquea la entrega: el staff sigue viendo y pudiendo
 * cobrar en caja igual que siempre si el cliente no pagó por adelantado.
 */

async function obtenerPedidoParaCobrar(pedidoId, req) {
  const { rows } = await query(`select * from pedidos where id = $1`, [pedidoId]);
  const pedido = rows[0];
  if (!pedido) throw notFound("Pedido no encontrado");
  if (req.cliente && pedido.cliente_id !== req.cliente.id) throw forbidden("Ese pedido no es tuyo");
  if (["cancelado", "no_recogido"].includes(pedido.estado)) throw conflict(`Ese pedido ya está en estado "${pedido.estado}"`);
  if (pedido.pago_confirmado) throw conflict("Ese pedido ya está pagado");

  const porPagar =
    Math.round((Number(pedido.total_mxn) - Number(pedido.creditos_aplicados_mxn || 0) - Number(pedido.monedero_aplicado_mxn || 0)) * 100) / 100;
  if (porPagar <= 0) throw conflict("Este pedido ya está cubierto por completo con créditos/saldo — no hay nada que pagar en línea");
  return { pedido, porPagar };
}

// ---------------------------------------------------------------------
// POST /pagos/mercadopago/liga/:pedidoId — genera la liga de pago
// (Checkout Pro) por el monto que falta pagar (total - créditos aplicados).
// ---------------------------------------------------------------------
pagosRouter.post(
  "/mercadopago/liga/:pedidoId",
  requireClienteOStaffAuth,
  asyncHandler(async (req, res) => {
    const cliente = obtenerClienteMercadoPago();
    if (!cliente) throw conflict("Mercado Pago todavía no está conectado — falta MERCADOPAGO_ACCESS_TOKEN en el backend", "mp_no_conectado");

    const { pedido, porPagar } = await obtenerPedidoParaCobrar(req.params.pedidoId, req);
    // La forma de pago se fija al crear el pedido (Carrito) — si eligió
    // pagar en caja, no se puede "cambiar de opinión" y generar una liga
    // en línea para ese mismo pedido después.
    if (pedido.metodo_pago === "caja") {
      throw conflict("Este pedido ya quedó marcado para pagarse en caja — la forma de pago no se puede cambiar", "metodo_pago_fijo");
    }

    // El puente /pago-retorno (app.js) es lo que de verdad regresa a la app
    // nativa — Mercado Pago no acepta un esquema lealtadcafe:// directo como
    // back_url, exige http/https. auto_return: "all" evita que el cliente
    // tenga que tocar "volver al sitio" él mismo, pase lo que pase con el pago.
    const urlRetorno = `${env.mercadopagoBackUrl || `${req.protocol}://${req.get("host")}`}/pago-retorno?pedido=${pedido.id}`;
    const preferencia = new Preference(cliente);
    const resultado = await preferencia.create({
      body: {
        items: [{ title: `Pedido Lealtad Café #${pedido.id.slice(0, 8)}`, quantity: 1, unit_price: porPagar, currency_id: "MXN" }],
        external_reference: pedido.id,
        notification_url: env.mercadopagoNotificationUrl || undefined,
        back_urls: { success: urlRetorno, failure: urlRetorno, pending: urlRetorno },
        auto_return: "all",
      },
    });

    await query(`update pedidos set metodo_pago = 'liga_mp', mercadopago_preference_id = $2 where id = $1`, [pedido.id, resultado.id]);

    res.status(201).json({ url: resultado.init_point, preference_id: resultado.id });
  })
);

// ---------------------------------------------------------------------
// POST /pagos/mercadopago/webhook — Mercado Pago llama aquí solo (público,
// sin sesión) cuando cambia el estado de un pago. Se valida el pago de
// verdad con la API (nunca se confía en lo que venga en la notificación
// misma, puede ser falsificada) antes de marcar el pedido como pagado.
// ---------------------------------------------------------------------
pagosRouter.post(
  "/mercadopago/webhook",
  asyncHandler(async (req, res) => {
    // Siempre 200 salvo error real del servidor — si no, Mercado Pago
    // reintenta sin parar notificaciones que nunca vamos a poder procesar
    // (ej. tipo "merchant_order", que no nos interesa).
    const cliente = obtenerClienteMercadoPago();
    if (!cliente) return res.sendStatus(200);

    const tipo = req.query.type || req.body?.type;
    const paymentId = req.query["data.id"] || req.body?.data?.id;
    if (tipo !== "payment" || !paymentId) return res.sendStatus(200);

    try {
      const pago = await new Payment(cliente).get({ id: paymentId });
      if (pago.status === "approved" && pago.external_reference) {
        // "pendiente_pago" -> "recibido" solo pasa aquí (o si el cliente se
        // rinde y elige pagar en caja, ver POST /pedidos/:id/pagar-en-caja)
        // — nunca estaba en la Cola del staff antes de este momento.
        await query(
          `update pedidos set pago_confirmado = true, mercadopago_payment_id = $2,
                  estado = case when estado = 'pendiente_pago' then 'recibido' else estado end
           where id = $1 and pago_confirmado = false`,
          [pago.external_reference, String(paymentId)]
        );
      }
    } catch (err) {
      console.error("Error procesando webhook de Mercado Pago:", err.message);
      query(`insert into log_errores (metodo, ruta, mensaje, stack) values ($1, $2, $3, $4)`, [
        "POST",
        "/pagos/mercadopago/webhook",
        err.message || String(err),
        err.stack || null,
      ]).catch(() => {});
    }
    res.sendStatus(200);
  })
);

// ---------------------------------------------------------------------
// POST /pagos/mercadopago/terminal/:pedidoId (staff) — cobro con terminal
// física (Point). PENDIENTE del equipo real: sin MERCADOPAGO_POINT_DEVICE_ID
// configurado, regresa un error claro en vez de intentarlo a ciegas.
// ---------------------------------------------------------------------
pagosRouter.post(
  "/mercadopago/terminal/:pedidoId",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const cliente = obtenerClienteMercadoPago();
    if (!cliente) throw conflict("Mercado Pago todavía no está conectado — falta MERCADOPAGO_ACCESS_TOKEN en el backend", "mp_no_conectado");
    if (!env.mercadopagoPointDeviceId) {
      throw conflict(
        "Todavía no hay una terminal Point configurada — falta MERCADOPAGO_POINT_DEVICE_ID en el backend (se obtiene al vincular el equipo físico)",
        "mp_sin_terminal"
      );
    }

    const { pedido, porPagar } = await obtenerPedidoParaCobrar(req.params.pedidoId, req);

    const resultado = await new Point(cliente).createPaymentIntent({
      body: { amount: Math.round(porPagar * 100), additional_info: { external_reference: pedido.id }, print_on_terminal: true },
      requestOptions: { deviceId: env.mercadopagoPointDeviceId },
    });

    await query(`update pedidos set metodo_pago = 'terminal_mp' where id = $1`, [pedido.id]);
    res.status(201).json({ payment_intent: resultado });
  })
);

// ---------------------------------------------------------------------
// GET /pagos/mercadopago/terminal/dispositivos (admin) — para ayudar a
// encontrar el device_id real de la terminal la primera vez que se conecte.
// ---------------------------------------------------------------------
pagosRouter.get(
  "/mercadopago/terminal/dispositivos",
  requireStaffAuth,
  asyncHandler(async (req, res) => {
    const cliente = obtenerClienteMercadoPago();
    if (!cliente) throw conflict("Mercado Pago todavía no está conectado — falta MERCADOPAGO_ACCESS_TOKEN en el backend", "mp_no_conectado");
    const resultado = await new Point(cliente).getDevices({});
    res.json(resultado);
  })
);
