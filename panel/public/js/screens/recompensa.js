import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, formatoFechaHora, escapar, toast } from "../ui.js";

const ETIQUETA_MODALIDAD = {
  credito_valor_mxn: "Créditos = $ MXN",
  credito_umbral: "Créditos = producto gratis",
  visitas: "Visitas",
};

function resumenLlano(cfg) {
  if (cfg.modalidad === "credito_valor_mxn") {
    return `Los clientes acumulan ${cfg.porcentaje_acumulacion}% del ticket en créditos. Cada crédito vale $${cfg.valor_cd_mxn} MXN y cubre hasta el 100% del costo de una bebida elegible.`;
  }
  if (cfg.modalidad === "credito_umbral") {
    return `Los clientes acumulan ${cfg.porcentaje_acumulacion}% del ticket en créditos. Al llegar a ${cfg.umbral_cd} cd, pueden canjear gratis uno de ${cfg.productos_elegibles?.length || 0} productos elegibles.`;
  }
  return `Cada visita con consumo mínimo de $${cfg.consumo_minimo_mxn} cuenta (máx. 1 al día). Al llegar a ${cfg.umbral_visitas} visitas, se habilita un producto gratis de ${cfg.productos_elegibles?.length || 0} elegibles.`;
}

function parametrosCorto(cfg) {
  if (cfg.modalidad === "credito_valor_mxn") return `${cfg.porcentaje_acumulacion}% · 1 cd = $${cfg.valor_cd_mxn}`;
  if (cfg.modalidad === "credito_umbral") return `${cfg.porcentaje_acumulacion}% · ${cfg.umbral_cd} cd = premio`;
  return `${cfg.umbral_visitas} visitas · mín. $${cfg.consumo_minimo_mxn}`;
}

export async function render() {
  const content = renderShell("recompensa", "Regla de recompensa");
  await renderVista(content);
}

async function renderVista(content) {
  content.innerHTML = spinner;
  try {
    const [{ configuracion: activa }, { historial }] = await Promise.all([
      api.get("/configuracion-recompensa/activa"),
      api.get("/configuracion-recompensa/historial"),
    ]);

    content.innerHTML = `
      <div class="card">
        ${
          activa
            ? `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <span class="badge badge-accent" style="margin-bottom:8px;">Modalidad activa · ${escapar(ETIQUETA_MODALIDAD[activa.modalidad])}</span>
              <div class="card-title" style="margin-top:8px;">${escapar(ETIQUETA_MODALIDAD[activa.modalidad])}</div>
              <div class="card-sub">Vigente desde el ${formatoFechaHora(activa.vigente_desde)}</div>
            </div>
            <button class="btn btn-primary" id="btn-cambiar">Cambiar regla</button>
          </div>
          <div style="font-size:13px;color:#524c42;line-height:1.6;background:#f7f6f4;border-radius:6px;padding:12px 14px;margin-top:14px;">
            ${escapar(resumenLlano(activa))}
          </div>`
            : `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="card-title">No hay ninguna regla activa todavía</div>
              <div class="card-sub">Nada se acumula ni se puede redimir hasta que configures una.</div>
            </div>
            <button class="btn btn-primary" id="btn-cambiar">Configurar regla</button>
          </div>`
        }
      </div>

      <div class="section-title">Historial de configuraciones</div>
      <div class="card" style="padding:0;">
        ${
          historial.length
            ? `<table class="data" style="padding:0 20px;">
                <tr><th>Modalidad</th><th>Parámetros</th><th>Vigente desde</th><th>Vigente hasta</th><th>Creado por</th></tr>
                ${historial
                  .map(
                    (h) => `
                  <tr>
                    <td>${escapar(ETIQUETA_MODALIDAD[h.modalidad])}</td>
                    <td class="mono-cell">${escapar(parametrosCorto(h))}</td>
                    <td class="muted mono-cell">${formatoFechaHora(h.vigente_desde)}</td>
                    <td>${h.vigente_hasta ? `<span class="muted mono-cell">${formatoFechaHora(h.vigente_hasta)}</span>` : `<span class="badge badge-success">Activa</span>`}</td>
                    <td class="muted">${escapar(h.creado_por_nombre || "—")}</td>
                  </tr>`
                  )
                  .join("")}
              </table>`
            : `<div class="table-empty">Sin historial todavía.</div>`
        }
      </div>
    `;

    document.getElementById("btn-cambiar").addEventListener("click", () => renderFormulario(content, activa));
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

async function renderFormulario(content, activa) {
  content.innerHTML = spinner;
  let productos = [];
  try {
    ({ productos } = await api.get("/productos"));
  } catch (err) {
    content.innerHTML = bannerError(err);
    return;
  }

  let modalidad = activa?.modalidad || "credito_valor_mxn";
  const productosSeleccionados = new Set((activa?.productos_elegibles || []).map((p) => p.id));

  function camposPorModalidad() {
    if (modalidad === "credito_valor_mxn") {
      return `
        <div class="form-row">
          <label class="form-label">% de acumulación por ticket</label>
          <input class="form-input mono" type="number" step="0.01" min="0" max="100" name="porcentaje_acumulacion" value="${activa?.modalidad === modalidad ? activa.porcentaje_acumulacion : ""}" required />
        </div>
        <div class="form-row">
          <label class="form-label">Valor de 1 crédito (MXN)</label>
          <input class="form-input mono" type="number" step="0.01" min="0" name="valor_cd_mxn" value="${activa?.modalidad === modalidad ? activa.valor_cd_mxn : ""}" required />
        </div>`;
    }
    if (modalidad === "credito_umbral") {
      return `
        <div class="form-row">
          <label class="form-label">% de acumulación por ticket</label>
          <input class="form-input mono" type="number" step="0.01" min="0" max="100" name="porcentaje_acumulacion" value="${activa?.modalidad === modalidad ? activa.porcentaje_acumulacion : ""}" required />
        </div>
        <div class="form-row">
          <label class="form-label">Umbral de créditos para el premio</label>
          <input class="form-input mono" type="number" step="0.01" min="0" name="umbral_cd" value="${activa?.modalidad === modalidad ? activa.umbral_cd : ""}" required />
        </div>
        ${selectorProductos()}`;
    }
    return `
      <div class="form-row">
        <label class="form-label">Umbral de visitas para el premio</label>
        <input class="form-input mono" type="number" step="1" min="1" name="umbral_visitas" value="${activa?.modalidad === modalidad ? activa.umbral_visitas : ""}" required />
      </div>
      <div class="form-row">
        <label class="form-label">Consumo mínimo por visita (MXN)</label>
        <input class="form-input mono" type="number" step="0.01" min="0" name="consumo_minimo_mxn" value="${activa?.modalidad === modalidad ? activa.consumo_minimo_mxn : ""}" required />
        <span class="form-hint">Máximo 1 visita contada por día, sin importar cuántas compras haga.</span>
      </div>
      ${selectorProductos()}`;
  }

  function selectorProductos() {
    if (!productos.length) {
      return `<div class="form-row"><span class="form-hint">No hay productos cargados todavía — agrégalos en Menú antes de usar esta modalidad.</span></div>`;
    }
    return `
      <div class="form-row">
        <label class="form-label">Productos elegibles para el canje</label>
        <div id="chips-productos" style="display:flex;flex-wrap:wrap;gap:8px;">
          ${productos
            .map(
              (p) => `
            <button type="button" class="chip-producto" data-id="${p.id}" style="display:inline-flex;align-items:center;gap:6px;border:1.5px solid ${productosSeleccionados.has(p.id) ? "#4338ca" : "#d6d1c7"};background:${productosSeleccionados.has(p.id) ? "#eef0fd" : "#fff"};color:${productosSeleccionados.has(p.id) ? "#332b9e" : "#524c42"};border-radius:100px;padding:6px 12px;font-size:12.5px;font-weight:600;">
              ${escapar(p.nombre)}
            </button>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function pintar() {
    content.innerHTML = `
      <div style="max-width:640px;">
        <div class="card">
          <div class="card-title">1. Elige la modalidad</div>
          <div class="card-sub">Solo una regla puede estar activa a la vez en todo el negocio.</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:6px;">
            ${["credito_valor_mxn", "credito_umbral", "visitas"]
              .map(
                (m) => `
              <button type="button" class="radio-modalidad" data-modalidad="${m}" style="text-align:left;border:1.5px solid ${m === modalidad ? "#4338ca" : "#e6e2db"};background:${m === modalidad ? "#eef0fd" : "#fff"};border-radius:8px;padding:14px;">
                <div style="font-size:12.5px;font-weight:600;color:${m === modalidad ? "#332b9e" : "#201e1a"};">${escapar(ETIQUETA_MODALIDAD[m])}</div>
              </button>`
              )
              .join("")}
          </div>
        </div>

        <div class="card">
          <div class="card-title">2. Parámetros</div>
          <form id="form-recompensa">${camposPorModalidad()}</form>
        </div>

        <div class="banner banner-warning">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div><strong>Este cambio aplica a todo el negocio desde ahora.</strong> Los saldos ya acumulados bajo la regla anterior se conservan; solo dejan de crecer hasta que se reactive esa modalidad.</div>
        </div>

        <div id="form-error"></div>
        <div class="form-actions">
          <button class="btn btn-secondary" id="btn-cancelar" type="button">Cancelar</button>
          <button class="btn btn-primary" id="btn-guardar" type="button">Guardar cambio</button>
        </div>
      </div>
    `;

    content.querySelectorAll(".radio-modalidad").forEach((btn) =>
      btn.addEventListener("click", () => {
        modalidad = btn.dataset.modalidad;
        pintar();
      })
    );
    content.querySelectorAll(".chip-producto").forEach((chip) =>
      chip.addEventListener("click", () => {
        const id = chip.dataset.id;
        if (productosSeleccionados.has(id)) productosSeleccionados.delete(id);
        else productosSeleccionados.add(id);
        pintar();
      })
    );
    document.getElementById("btn-cancelar").addEventListener("click", () => renderVista(content));
    document.getElementById("btn-guardar").addEventListener("click", guardar);
  }

  async function guardar() {
    const form = document.getElementById("form-recompensa");
    const datos = Object.fromEntries(new FormData(form));
    const cuerpo = { modalidad, ...datos };
    if (modalidad !== "credito_valor_mxn") cuerpo.producto_ids = [...productosSeleccionados];

    if (!confirm("¿Aplicar este cambio de regla a todo el negocio ahora mismo?")) return;

    const boton = document.getElementById("btn-guardar");
    boton.disabled = true;
    boton.textContent = "Guardando…";
    try {
      await api.post("/configuracion-recompensa", cuerpo);
      toast("Regla actualizada");
      renderVista(content);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      document.getElementById("form-error").innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
      boton.disabled = false;
      boton.textContent = "Guardar cambio";
    }
  }

  pintar();
}
