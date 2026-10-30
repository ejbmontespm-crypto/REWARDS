import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { clientesRouter } from "./clientes.routes.js";
import { escaneoRouter } from "./escaneo.routes.js";
import { movimientosRouter } from "./movimientos.routes.js";
import { configuracionRecompensaRouter } from "./configuracionRecompensa.routes.js";
import { solicitudesCanjeRouter } from "./solicitudesCanje.routes.js";
import { canjesRouter } from "./canjes.routes.js";
import { categoriasProductoRouter } from "./categoriasProducto.routes.js";
import { productosRouter } from "./productos.routes.js";
import { extrasRouter } from "./extras.routes.js";
import { pedidosRouter } from "./pedidos.routes.js";
import { promocionesRouter } from "./promociones.routes.js";
import { vigenciasRouter } from "./vigencias.routes.js";
import { notificacionesRouter } from "./notificaciones.routes.js";
import { usuariosStaffRouter } from "./usuariosStaff.routes.js";
import { passwordResetSolicitudesRouter } from "./passwordResetSolicitudes.routes.js";
import { configuracionSistemaRouter } from "./configuracionSistema.routes.js";
import { uploadsRouter } from "./uploads.routes.js";
import { pagosRouter } from "./pagos.routes.js";
import { logErroresRouter } from "./logErrores.routes.js";

/**
 * Mapa de rutas — mismos grupos y nombres que fase6-backend-api.md.
 * Cada recurso se monta en su propia ruta EXACTA (nunca compartiendo "/"
 * con otro grupo): un stub montado en una ruta genérica atraparía
 * peticiones de sus vecinos que no encontraron coincidencia en su propio
 * router (así se descubrió el bug del 24 sep 2026 — ver roadmap).
 */
export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/clientes", clientesRouter);
apiRouter.use("/staff/escaneo", escaneoRouter);
apiRouter.use("/movimientos", movimientosRouter);
apiRouter.use("/configuracion-recompensa", configuracionRecompensaRouter);
apiRouter.use("/solicitudes-canje", solicitudesCanjeRouter);
apiRouter.use("/canjes", canjesRouter);
apiRouter.use("/categorias-producto", categoriasProductoRouter);
apiRouter.use("/productos", productosRouter);
apiRouter.use("/extras", extrasRouter);
apiRouter.use("/pedidos", pedidosRouter);
apiRouter.use("/promociones", promocionesRouter);
apiRouter.use("/ciclos-vigencia", vigenciasRouter);
apiRouter.use("/notificaciones", notificacionesRouter);
apiRouter.use("/usuarios-staff", usuariosStaffRouter);
apiRouter.use("/password-reset-solicitudes", passwordResetSolicitudesRouter);
apiRouter.use("/configuracion-sistema", configuracionSistemaRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/pagos", pagosRouter);
apiRouter.use("/log-errores", logErroresRouter);
