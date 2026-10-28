import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, abrirModal, cerrarModal, formatoFecha, formatoMXN } from "../ui.js";
import { iconos } from "../icons.js";

const PERFILES = [
  { valor: "alumno", texto: "Alumnos" },
  { valor: "docente", texto: "Docentes" },
  { valor: "otro", texto: "Otro" },
];

const DIAS_SEMANA = [
  { valor: 0, texto: "Dom" },
  { valor: 1, texto: "Lun" },
  { valor: 2, texto: "Mar" },
  { valor: 3, texto: "Mié" },
  { valor: 4, texto: "Jue" },
  { valor: 5, texto: "Vie" },
  { valor: 6, texto: "Sáb" },
];

function estadoPromo(p) {
  if (!p.activa) return { texto: "Pausada", clase: "badge-neutral" };
  const hoy = new Date().toISOString().slice(0, 10);
  if (p.fecha_inicio && p.fecha_inicio > hoy) return { texto: "Programada", clase: "badge-warning" };
  if (p.fecha_fin && p.fecha_fin < hoy) return { texto: "Vencida", clase: "badge-neutral" };
  return { texto: "Activa", clase: "badge-success" };
}

function textoVigencia(p) {
  if (!p.fecha_inicio && !p.fecha_fin) return "Sin fecha límite";
  if (p.fecha_inicio && p.fecha_fin) return `${formatoFecha(p.fecha_inicio)} – ${formatoFecha(p.fecha_fin)}`;
  if (p.fecha_inicio) return `Desde ${formatoFecha(p.fecha_inicio)}`;
  return `Hasta ${formatoFecha(p.fecha_fin)}`;
}

function textoSegmentos(segmentos) {
  if (!segmentos || !segmentos.length) return "Todos los perfiles";
  return segmentos.map((s) => PERFILES.find((p) => p.valor === s)?.texto || s).join(", ");
}

function textoVentana(p) {
  if (!p.hora_inicio) return null;
  const dias = p.dias_semana?.length ? p.dias_semana.map((d) => DIAS_SEMANA.find((x) => x.valor === d)?.texto).join(" ") : "Todos los días";
  return `${dias} · ${p.hora_inicio}–${p.hora_fin}`;
}

export async function render() {
  const content = renderShell("promociones", "Promociones");
  await cargarYPintar(content);
}

async function cargarYPintar(content) {
  content.innerHTML = spinner;
  try {
    const { promociones } = await api.get("/promociones", { query: { todas: "true" } });
    pintar(content, promociones);
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function pintar(content, promociones) {
  content.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-title" style="font-size:14px;font-weight:600;">${promociones.length} promoción${promociones.length === 1 ? "" : "es"}</div>
      <button class="btn btn-primary" id="btn-nueva">${iconos.mas(14)} Nueva promoción</button>
    </div>
    ${
      promociones.length
        ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
            ${promociones
              .map((p) => {
                const est = estadoPromo(p);
                return `
                <div class="card" style="padding:0;overflow:hidden;">
                  <div style="height:100px;background:#f1efe9;display:flex;align-items:center;justify-content:center;color:#a29b8d;border-bottom:1px solid #e6e2db;">
                    ${p.tipo_archivo === "pdf" ? iconos.archivo(26) : iconos.imagen(26)}
                  </div>
                  <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px;">
                    <div style="font-size:13.5px;font-weight:600;">${escapar(p.titulo)}</div>
                    <div style="font-size:11.5px;color:#726c60;">${escapar(p.tipo_archivo)} · ${escapar(textoVigencia(p))}</div>
                    <div style="font-size:11.5px;color:#726c60;">${escapar(textoSegmentos(p.segmentos))}</div>
                    ${
                      p.producto_id
                        ? `<div style="font-size:11.5px;color:#4338ca;font-weight:600;">Pedible desde el menú — ${formatoMXN(p.producto_precio)}</div>`
                        : ""
                    }
                    ${textoVentana(p) ? `<div style="font-size:11.5px;color:#726c60;">⏱ ${escapar(textoVentana(p))}</div>` : ""}
                    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid #eeece7;margin-top:2px;">
                      <span class="badge ${est.clase}">${est.texto}</span>
                      <div style="display:flex;gap:6px;">
                        <button class="toggle ${p.activa ? "on" : ""} btn-toggle-promo" data-id="${p.id}" data-activa="${p.activa}" title="Activar/pausar"><div class="knob"></div></button>
                        <button class="icon-btn btn-editar-promo" data-id="${p.id}">${iconos.lapiz(13)}</button>
                        <button class="icon-btn btn-borrar-promo" data-id="${p.id}" data-titulo="${escapar(p.titulo)}">${iconos.basura(13)}</button>
                      </div>
                    </div>
                  </div>
                </div>`;
              })
              .join("")}
          </div>`
        : `<div class="empty-state">Sin promociones todavía.</div>`
    }
  `;

  document.getElementById("btn-nueva").addEventListener("click", () => formularioPromocion(content));
  content.querySelectorAll(".btn-editar-promo").forEach((b) =>
    b.addEventListener("click", () => formularioPromocion(content, promociones.find((p) => p.id === b.dataset.id)))
  );
  content.querySelectorAll(".btn-borrar-promo").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar "${b.dataset.titulo}"? No se puede deshacer.`)) return;
      try {
        await api.delete(`/promociones/${b.dataset.id}`);
        toast("Eliminada");
        await cargarYPintar(content);
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );
  content.querySelectorAll(".btn-toggle-promo").forEach((b) =>
    b.addEventListener("click", async () => {
      const activarla = b.dataset.activa !== "true";
      if (activarla && !confirm("Al activarla se manda una notificación automática (app + correo) a los clientes que apliquen. ¿Continuar?")) return;
      try {
        await api.patch(`/promociones/${b.dataset.id}`, { activa: activarla });
        toast(activarla ? "Promoción activada" : "Promoción pausada");
        await cargarYPintar(content);
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );
}

async function formularioPromocion(content, promo) {
  const editando = Boolean(promo);
  const segmentosActuales = new Set(promo?.segmentos || []);

  let categorias = [];
  try {
    ({ categorias } = await api.get("/categorias-producto"));
  } catch {
    /* si falla, el selector queda vacío — no bloquea el resto del formulario */
  }

  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">${editando ? "Editar" : "Nueva"} promoción</h2>
    <form id="form-promo">
      <div class="form-row"><label class="form-label">Título</label><input class="form-input" name="titulo" value="${promo ? escapar(promo.titulo) : ""}" required /></div>
      <div class="form-row"><label class="form-label">Descripción</label><textarea class="form-input" name="descripcion" rows="2" style="resize:vertical;">${promo?.descripcion ? escapar(promo.descripcion) : ""}</textarea></div>
      <div class="form-row">
        <label class="form-label">Tipo de archivo</label>
        <select class="form-select" name="tipo_archivo">
          <option value="imagen" ${promo?.tipo_archivo === "imagen" || !promo ? "selected" : ""}>Imagen</option>
          <option value="pdf" ${promo?.tipo_archivo === "pdf" ? "selected" : ""}>PDF</option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">Archivo</label>
        <input type="file" id="archivo-promo" accept="image/png,image/jpeg,image/webp,application/pdf" />
        <input type="hidden" name="archivo_path" id="input-archivo-path" value="${promo ? escapar(promo.archivo_path) : ""}" />
        <div id="estado-subida-promo" style="font-size:12px;color:#726c60;margin-top:4px;">
          ${promo?.archivo_path ? `Archivo actual: <a href="${escapar(promo.archivo_path)}" target="_blank" rel="noopener">ver</a>` : ""}
        </div>
      </div>
      <div style="display:flex;gap:12px;">
        <div class="form-row" style="flex:1;"><label class="form-label">Fecha inicio (opcional)</label><input class="form-input" type="date" name="fecha_inicio" value="${promo?.fecha_inicio || ""}" /></div>
        <div class="form-row" style="flex:1;"><label class="form-label">Fecha fin (opcional)</label><input class="form-input" type="date" name="fecha_fin" value="${promo?.fecha_fin || ""}" /></div>
      </div>
      <div class="form-row">
        <label class="form-label">Segmentos (ninguno marcado = todos)</label>
        <div style="display:flex;gap:14px;">
          ${PERFILES.map(
            (p) => `
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;">
              <input type="checkbox" name="segmentos" value="${p.valor}" ${segmentosActuales.has(p.valor) ? "checked" : ""} /> ${p.texto}
            </label>`
          ).join("")}
        </div>
      </div>
      <div class="form-row">
        <label style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;">
          <input type="checkbox" name="activa" ${!promo || promo.activa ? "checked" : ""} /> Activa
        </label>
      </div>
      <div class="form-row">
        <label style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;">
          <input type="checkbox" id="check-pedible" name="pedible" ${promo?.producto_id ? "checked" : ""} /> Se puede pedir desde el menú
        </label>
        <span class="form-hint">Crea (o actualiza) un producto de catálogo con este mismo título, para que aparezca en Menú/Carrito.</span>
      </div>
      <div id="bloque-pedible" style="display:${promo?.producto_id ? "flex" : "none"};flex-direction:column;gap:8px;">
        <div style="display:flex;gap:12px;">
          <div class="form-row" style="flex:1;"><label class="form-label">Precio (MXN)</label><input class="form-input mono" type="number" step="0.01" min="0" name="precio" value="${promo?.producto_precio ?? ""}" /></div>
          <div class="form-row" style="flex:1;">
            <label class="form-label">Categoría</label>
            <select class="form-select" name="categoria_id" ${categorias.length ? "required" : "disabled"}>
              ${categorias.map((c) => `<option value="${c.id}" ${promo?.producto_categoria_id === c.id ? "selected" : ""}>${escapar(c.nombre)}</option>`).join("")}
            </select>
          </div>
        </div>
        ${
          categorias.length
            ? `<span class="form-hint">Un producto sin categoría no se muestra en el menú de la app — por eso es obligatoria aquí.</span>`
            : `<span class="form-hint" style="color:#b3261e;">Todavía no tienes categorías creadas en Menú — crea una primero para poder marcar esta promo como pedible.</span>`
        }
        <div style="border-top:1px solid #eeece7;margin-top:6px;padding-top:10px;">
          <label style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;">
            <input type="checkbox" id="check-ventana" name="ventana" ${promo?.hora_inicio ? "checked" : ""} /> Restringir a días/horario específico (ej. happy hour)
          </label>
          <div id="bloque-ventana" style="display:${promo?.hora_inicio ? "flex" : "none"};flex-direction:column;gap:8px;margin-top:8px;">
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${DIAS_SEMANA.map(
                (d) => `
                <label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;">
                  <input type="checkbox" name="dias_semana" value="${d.valor}" ${(promo?.dias_semana || []).includes(d.valor) ? "checked" : ""} /> ${d.texto}
                </label>`
              ).join("")}
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
              <input class="form-input mono" type="time" name="hora_inicio" value="${promo?.hora_inicio || ""}" style="width:110px;" />
              <span class="muted">a</span>
              <input class="form-input mono" type="time" name="hora_fin" value="${promo?.hora_fin || ""}" style="width:110px;" />
            </div>
            <span class="form-hint">Días sin marcar = todos los días. Con esta ventana activa, el pedido que incluya este producto debe recogerse máximo 30 minutos después de hacerlo.</span>
          </div>
        </div>
        <div style="border-top:1px solid #eeece7;margin-top:6px;padding-top:10px;">
          <label style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;">
            <input type="checkbox" id="check-cumpleanos" name="solo_cumpleanos" ${promo?.solo_cumpleanos ? "checked" : ""} /> Solo para cumpleañeros
          </label>
          <div id="bloque-cumpleanos" style="display:${promo?.solo_cumpleanos ? "flex" : "none"};gap:12px;align-items:flex-end;margin-top:8px;">
            <div class="form-row" style="margin:0;">
              <label class="form-label">Gasto mínimo mensual (MXN)</label>
              <input class="form-input mono" type="number" step="0.01" min="0" name="cumpleanos_gasto_minimo_mxn" value="${promo?.cumpleanos_gasto_minimo_mxn ?? ""}" style="width:130px;" />
            </div>
            <div class="form-row" style="margin:0;">
              <label class="form-label">Durante los últimos cuántos meses</label>
              <input class="form-input mono" type="number" step="1" min="1" name="cumpleanos_meses_historial" value="${promo?.cumpleanos_meses_historial ?? ""}" style="width:90px;" />
            </div>
          </div>
          <span class="form-hint" style="display:block;margin-top:4px;">Solo la ven clientes cuyo cumpleaños cae este mes Y que cumplieron ese gasto mínimo en CADA UNO de esos meses (no basta un mes bueno suelto).</span>
        </div>
      </div>
      <div class="banner banner-warning" style="margin-top:4px;">
        ${iconos.alerta(16)}
        <div>Al guardar con "Activa" marcada (o al pasar de pausada a activa), se manda una notificación automática a los clientes que apliquen.</div>
      </div>
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);

  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#check-pedible").addEventListener("change", (ev) => {
    modal.querySelector("#bloque-pedible").style.display = ev.target.checked ? "flex" : "none";
  });
  modal.querySelector("#check-ventana").addEventListener("change", (ev) => {
    modal.querySelector("#bloque-ventana").style.display = ev.target.checked ? "flex" : "none";
  });
  modal.querySelector("#check-cumpleanos").addEventListener("change", (ev) => {
    modal.querySelector("#bloque-cumpleanos").style.display = ev.target.checked ? "flex" : "none";
  });
  modal.querySelector("#archivo-promo").addEventListener("change", async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    const estadoTexto = modal.querySelector("#estado-subida-promo");
    estadoTexto.textContent = "Subiendo…";
    try {
      const { url } = await api.subirArchivo(archivo);
      modal.querySelector("#input-archivo-path").value = url;
      estadoTexto.innerHTML = `Subido: <a href="${escapar(url)}" target="_blank" rel="noopener">ver</a>`;
    } catch (err) {
      estadoTexto.textContent = err instanceof ApiError ? err.message : "No se pudo subir el archivo.";
    }
  });
  modal.querySelector("#form-promo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const activa = form.get("activa") === "on";
    const seActivaAhora = activa && !(editando && promo.activa);
    const pedible = form.get("pedible") === "on";
    const ventana = form.get("ventana") === "on";
    const soloCumpleanos = form.get("solo_cumpleanos") === "on";

    if (!form.get("archivo_path")) {
      return (modal.querySelector("#modal-error").innerHTML = `<div class="form-error">Sube un archivo (imagen o PDF) para la promoción.</div>`);
    }
    if (seActivaAhora && !confirm("Se va a mandar la notificación de esta promoción ahora mismo. ¿Confirmas?")) return;
    if (pedible && !form.get("precio")) {
      return (modal.querySelector("#modal-error").innerHTML = `<div class="form-error">Falta el precio para poder pedirla desde el menú.</div>`);
    }
    if (pedible && !form.get("categoria_id")) {
      return (modal.querySelector("#modal-error").innerHTML = `<div class="form-error">Elige una categoría — sin ella, el producto no aparece en el menú de la app.</div>`);
    }
    if (ventana && (!form.get("hora_inicio") || !form.get("hora_fin"))) {
      return (modal.querySelector("#modal-error").innerHTML = `<div class="form-error">Falta la hora de inicio o de fin de la ventana.</div>`);
    }
    if (soloCumpleanos && (!form.get("cumpleanos_gasto_minimo_mxn") || !form.get("cumpleanos_meses_historial"))) {
      return (modal.querySelector("#modal-error").innerHTML = `<div class="form-error">Falta el gasto mínimo o el número de meses para la promo de cumpleaños.</div>`);
    }

    const datos = {
      titulo: form.get("titulo"),
      descripcion: form.get("descripcion") || null,
      tipo_archivo: form.get("tipo_archivo"),
      archivo_path: form.get("archivo_path"),
      fecha_inicio: form.get("fecha_inicio") || null,
      fecha_fin: form.get("fecha_fin") || null,
      segmentos: form.getAll("segmentos"),
      activa,
    };
    if (pedible) {
      datos.precio = Number(form.get("precio"));
      datos.categoria_id = form.get("categoria_id") || null;
    }
    datos.dias_semana = ventana ? form.getAll("dias_semana").map(Number) : null;
    datos.hora_inicio = ventana ? form.get("hora_inicio") : null;
    datos.hora_fin = ventana ? form.get("hora_fin") : null;

    try {
      if (editando) await api.patch(`/promociones/${promo.id}`, datos);
      else await api.post("/promociones", datos);
      cerrarModal();
      toast("Guardado");
      await cargarYPintar(content);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    }
  });
}
