/** Utilidades chicas compartidas por las pantallas — nada de framework, solo helpers. */

export function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

export function formatoMXN(valor) {
  const n = Number(valor ?? 0);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export function formatoFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatoFechaHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const spinner = `<div style="display:flex;justify-content:center;padding:40px;"><div class="spinner"></div></div>`;

export function mensajeVacio(texto) {
  return `<div class="table-empty">${escapar(texto)}</div>`;
}

/** Banner de error reutilizable — regresa el HTML, no hace nada por sí solo. */
export function bannerError(err) {
  return `<div class="banner banner-danger">
    ${'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'}
    <div>${escapar(err?.message || "Algo salió mal.")}</div>
  </div>`;
}

/** Dispara la descarga de un blob ya obtenido (ej. el .xlsx de un reporte). */
export function descargarArchivo(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Modal centrado reutilizable — para formularios chicos (categoría,
 * producto, extra). `contenidoHtml` ya trae su propio <form>; el
 * llamador conecta sus propios listeners después de que se monta.
 */
export function abrirModal(contenidoHtml) {
  cerrarModal();
  const overlay = document.createElement("div");
  overlay.id = "modal-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(32,30,26,0.32);display:flex;align-items:center;justify-content:center;z-index:500;";
  overlay.innerHTML = `<div id="modal-card" style="width:100%;max-width:480px;max-height:88vh;overflow-y:auto;background:#fff;border-radius:10px;box-shadow:0 24px 48px -18px rgba(32,30,26,0.35);padding:24px;">${contenidoHtml}</div>`;
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) cerrarModal();
  });
  document.body.appendChild(overlay);
  return document.getElementById("modal-card");
}

export function cerrarModal() {
  document.getElementById("modal-overlay")?.remove();
}

/** Toast simple, se autodestruye — para confirmaciones tipo "Guardado".
 *  Varios seguidos se apilan hacia arriba en vez de encimarse. */
export function toast(texto, tipo = "exito") {
  const el = document.createElement("div");
  const colores = { exito: "#15803d", error: "#b3261e" };
  el.textContent = texto;
  el.style.cssText = `position:fixed;right:24px;background:${colores[tipo] || colores.exito};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 8px 20px rgba(0,0,0,0.15);z-index:1000;transition:bottom .15s ease;`;
  document.body.appendChild(el);

  const acomodar = () => {
    let base = 24;
    for (const otro of document.querySelectorAll(".toast-lealtad")) {
      otro.style.bottom = `${base}px`;
      base += otro.offsetHeight + 10;
    }
  };
  el.classList.add("toast-lealtad");
  acomodar();

  setTimeout(() => {
    el.remove();
    acomodar();
  }, 3000);
}
