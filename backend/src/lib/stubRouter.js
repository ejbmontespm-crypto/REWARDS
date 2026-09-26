import { Router } from "express";
import { notImplemented } from "./errors.js";

/**
 * Crea un router que responde 501 a cualquier ruta bajo él — deja el
 * grupo de recursos "montado" en la API (aparece en el mapa, se puede
 * probar que existe) mientras se construye de verdad, siguiendo
 * fase6-backend-api.md y roadmap-construccion.md.
 */
export function stubRouter(nombreGrupo) {
  const router = Router();
  router.all(/.*/, (req, res, next) => {
    next(notImplemented(`Grupo "${nombreGrupo}" — pendiente en el roadmap (bloque 2, backend/API)`));
  });
  return router;
}
