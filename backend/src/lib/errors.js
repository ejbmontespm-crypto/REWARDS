/**
 * Error de API con forma conocida — el errorHandler lo convierte en
 * { error: { code, message } } tal como quedó definido en fase6-backend-api.md.
 */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = "solicitud_invalida") => new ApiError(400, code, message);
export const unauthorized = (message = "No autenticado", code = "no_autenticado") => new ApiError(401, code, message);
export const forbidden = (message = "No autorizado", code = "no_autorizado") => new ApiError(403, code, message);
export const notFound = (message = "No encontrado", code = "no_encontrado") => new ApiError(404, code, message);
export const conflict = (message, code = "conflicto") => new ApiError(409, code, message);
export const notImplemented = (message = "Todavía no construido — ver roadmap-construccion.md") =>
  new ApiError(501, "no_implementado", message);
