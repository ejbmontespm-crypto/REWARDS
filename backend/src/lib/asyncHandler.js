/**
 * Envuelve un handler async para que cualquier rechazo de promesa caiga
 * en el errorHandler de Express en vez de colgar la respuesta.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
