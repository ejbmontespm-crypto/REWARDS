let listener = null;
let contador = 0;

/** Muestra un toast breve en cualquier pantalla — sin tener que pasar props
 *  ni montar nada extra donde se llama, mismo patrón pub-sub que bandejaStaff. */
export function mostrarToast(mensaje) {
  const id = ++contador;
  listener?.({ id, mensaje });
}

/** Uso interno de <ToastHost/> — un solo host montado en la raíz. */
export function suscribirseToast(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
