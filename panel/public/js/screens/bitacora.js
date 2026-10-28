import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, formatoFechaHora } from "../ui.js";

export async function render() {
  const content = renderShell("bitacora", "Bitácora (dev)");
  await cargarYPintar(content);
}

async function cargarYPintar(content) {
  content.innerHTML = spinner;
  try {
    const { errores } = await api.get("/log-errores");
    pintar(content, errores);
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function pintar(content, errores) {
  content.innerHTML = `
    <div class="banner banner-warning">
      <div>Esto es temporal, mientras dura el desarrollo — guarda el detalle real detrás de cualquier "Algo salió mal de nuestro lado" que vea un cliente o el staff. No es para usuarios finales.</div>
    </div>
    <div class="toolbar">
      <div class="toolbar-title" style="font-size:14px;font-weight:600;">${errores.length} error${errores.length === 1 ? "" : "es"} registrados</div>
      ${errores.length ? `<button class="btn btn-secondary" id="btn-limpiar">Limpiar bitácora</button>` : ""}
    </div>
    <div class="card" style="padding:0;">
      ${
        errores.length
          ? errores
              .map(
                (e, i) => `
          <div style="border-bottom:1px solid #eeece7;padding:14px 18px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div>
                <span class="mono" style="font-size:11.5px;color:#726c60;">${escapar(e.metodo)} ${escapar(e.ruta)}</span>
                <div style="font-size:13.5px;font-weight:600;margin-top:2px;">${escapar(e.mensaje)}</div>
              </div>
              <span style="font-size:11.5px;color:#726c60;white-space:nowrap;">${formatoFechaHora(e.created_at)}</span>
            </div>
            ${
              e.staff_nombre || e.cliente_nombre
                ? `<div style="font-size:11.5px;color:#726c60;margin-top:4px;">${e.staff_nombre ? `Staff: ${escapar(e.staff_nombre)}` : `Cliente: ${escapar(e.cliente_nombre)}`}</div>`
                : ""
            }
            ${
              e.stack
                ? `<button class="btn btn-ghost btn-sm" data-toggle="stack-${i}" style="margin-top:6px;">Ver detalle técnico</button>
                   <pre id="stack-${i}" style="display:none;font-size:11px;background:#f7f6f4;border:1px solid #e6e2db;border-radius:8px;padding:10px;margin-top:6px;overflow-x:auto;white-space:pre-wrap;">${escapar(e.stack)}</pre>`
                : ""
            }
          </div>`
              )
              .join("")
          : `<div class="table-empty">Sin errores registrados — buena señal.</div>`
      }
    </div>
  `;

  content.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const pre = document.getElementById(b.dataset.toggle);
      pre.style.display = pre.style.display === "none" ? "block" : "none";
    })
  );

  document.getElementById("btn-limpiar")?.addEventListener("click", async () => {
    if (!confirm("¿Borrar todos los errores registrados?")) return;
    try {
      await api.delete("/log-errores");
      toast("Bitácora limpiada");
      await cargarYPintar(content);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo limpiar.", "error");
    }
  });
}
