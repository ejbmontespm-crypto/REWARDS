import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, abrirModal, cerrarModal, formatoFechaHora, formatoMXN } from "../ui.js";

const ETIQUETA_PERFIL = { alumno: "Alumno", docente: "Docente", otro: "Otro" };
const ETIQUETA_FILTRO = { clientes: "Clientes específicos", perfil: "Por tipo de perfil", todos: "Todos los clientes" };
const ETIQUETA_TIPO = { credito_mxn: "Crédito en pesos", bebida_gratis: "Bebida gratis" };

export async function render() {
  const content = renderShell("promos-saldo", "Saldo y recompensas");
  await cargarYPintar(content);
}

async function cargarYPintar(content) {
  content.innerHTML = spinner;
  try {
    const { promos } = await api.get("/promos-saldo");
    pintar(content, promos);
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function pintar(content, promos) {
  content.innerHTML = `
    <div class="banner banner-warning">
      <div>Esto NO es una regla que se evalúa sola (como la promo de cumpleaños) — al aplicar una campaña aquí, el saldo se carga de inmediato a los clientes que elijas, en el momento, sin forma de deshacerlo salvo ajustándolo a mano.</div>
    </div>
    <div class="toolbar">
      <div class="toolbar-title" style="font-size:14px;font-weight:600;">Campañas aplicadas</div>
      <button class="btn btn-primary" id="btn-nueva">Nueva campaña de saldo</button>
    </div>
    <div class="card" style="padding:0;">
      <table class="data">
        <tr><th>Fecha</th><th>Nombre</th><th>Tipo</th><th>Monto</th><th>A quién</th><th>Clientes</th><th>Por</th></tr>
        ${
          promos.length
            ? promos
                .map(
                  (p) => `
          <tr>
            <td class="muted">${formatoFechaHora(p.created_at)}</td>
            <td>${escapar(p.nombre)}</td>
            <td>${ETIQUETA_TIPO[p.tipo] || p.tipo}</td>
            <td class="mono-cell">${p.tipo === "bebida_gratis" ? escapar(p.producto_nombre || "—") : formatoMXN(p.monto_mxn)}</td>
            <td>${ETIQUETA_FILTRO[p.filtro_tipo]}${p.filtro_perfil ? ` (${ETIQUETA_PERFIL[p.filtro_perfil]})` : ""}</td>
            <td class="mono-cell">${p.cantidad_clientes}</td>
            <td class="muted">${escapar(p.creado_por_nombre || "—")}</td>
          </tr>`
                )
                .join("")
            : `<tr><td colspan="7" class="table-empty">Sin campañas aplicadas todavía.</td></tr>`
        }
      </table>
    </div>
  `;

  document.getElementById("btn-nueva").addEventListener("click", () => formularioPromo(content));
}

function formularioPromo(content) {
  let clientesSeleccionados = []; // [{id, nombre, apellido_paterno}]
  let productos = [];

  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">Nueva campaña de saldo</h2>
    <form id="form-promo">
      <div class="form-row">
        <label class="form-label">Nombre de la campaña</label>
        <input class="form-input" name="nombre" placeholder="Ej. Día del Maestro 2026" required />
      </div>

      <div class="form-row">
        <label class="form-label">Tipo</label>
        <select class="form-select" name="tipo" id="select-tipo">
          <option value="credito_mxn">Crédito en pesos</option>
          <option value="bebida_gratis">Bebida gratis</option>
        </select>
      </div>

      <div class="form-row" id="fila-monto">
        <label class="form-label">Monto por cliente (MXN)</label>
        <input class="form-input mono" type="number" step="0.01" min="0" name="monto_mxn" />
      </div>
      <div class="form-row" id="fila-producto" style="display:none;">
        <label class="form-label">Producto (su precio actual es lo que se carga)</label>
        <select class="form-select" name="producto_id" id="select-producto"><option value="">Cargando…</option></select>
      </div>

      <div class="form-row">
        <label class="form-label">¿A quién se le carga?</label>
        <select class="form-select" name="filtro_tipo" id="select-filtro">
          <option value="clientes">Clientes específicos</option>
          <option value="perfil">Por tipo de perfil</option>
          <option value="todos">Todos los clientes</option>
        </select>
      </div>

      <div class="form-row" id="fila-perfil" style="display:none;">
        <label class="form-label">Tipo de perfil</label>
        <select class="form-select" name="filtro_perfil">
          <option value="alumno">Alumno</option>
          <option value="docente">Docente</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div id="fila-clientes">
        <label class="form-label">Buscar clientes</label>
        <input class="form-input" id="input-buscar-cliente" placeholder="Nombre, teléfono o correo…" />
        <div id="resultados-busqueda" style="margin-top:6px;"></div>
        <div id="chips-clientes" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;"></div>
      </div>

      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Aplicar ahora</button>
      </div>
    </form>
  `);

  function pintarChips() {
    const cont = modal.querySelector("#chips-clientes");
    cont.innerHTML = clientesSeleccionados
      .map(
        (c) => `
      <span class="badge badge-neutral" style="display:inline-flex;align-items:center;gap:6px;">
        ${escapar(c.nombre)} ${escapar(c.apellido_paterno)}
        <span data-quitar="${c.id}" style="cursor:pointer;font-weight:700;">×</span>
      </span>`
      )
      .join("");
    cont.querySelectorAll("[data-quitar]").forEach((el) =>
      el.addEventListener("click", () => {
        clientesSeleccionados = clientesSeleccionados.filter((c) => c.id !== el.dataset.quitar);
        pintarChips();
      })
    );
  }

  modal.querySelector("#select-tipo").addEventListener("change", (ev) => {
    const esBebida = ev.target.value === "bebida_gratis";
    modal.querySelector("#fila-monto").style.display = esBebida ? "none" : "flex";
    modal.querySelector("#fila-producto").style.display = esBebida ? "flex" : "none";
    if (esBebida && productos.length === 0) {
      api
        .get("/productos")
        .then((d) => {
          productos = d.productos;
          modal.querySelector("#select-producto").innerHTML = productos
            .map((p) => `<option value="${p.id}">${escapar(p.nombre)} — ${formatoMXN(p.precio)}</option>`)
            .join("");
        })
        .catch(() => {});
    }
  });

  modal.querySelector("#select-filtro").addEventListener("change", (ev) => {
    const valor = ev.target.value;
    modal.querySelector("#fila-perfil").style.display = valor === "perfil" ? "flex" : "none";
    modal.querySelector("#fila-clientes").style.display = valor === "clientes" ? "block" : "none";
  });

  let buscandoTimeout = null;
  modal.querySelector("#input-buscar-cliente").addEventListener("input", (ev) => {
    clearTimeout(buscandoTimeout);
    const termino = ev.target.value.trim();
    const resultados = modal.querySelector("#resultados-busqueda");
    if (!termino) {
      resultados.innerHTML = "";
      return;
    }
    buscandoTimeout = setTimeout(async () => {
      try {
        const { clientes } = await api.get("/clientes", { query: { buscar: termino } });
        resultados.innerHTML = clientes
          .filter((c) => !clientesSeleccionados.some((s) => s.id === c.id))
          .slice(0, 8)
          .map((c) => `<div class="icon-btn" data-agregar='${JSON.stringify(c).replace(/'/g, "&apos;")}' style="cursor:pointer;padding:6px 4px;font-size:12.5px;">+ ${escapar(c.nombre)} ${escapar(c.apellido_paterno)} — ${escapar(c.correo || c.telefono || "")}</div>`)
          .join("");
        resultados.querySelectorAll("[data-agregar]").forEach((el) =>
          el.addEventListener("click", () => {
            clientesSeleccionados.push(JSON.parse(el.dataset.agregar));
            pintarChips();
            resultados.innerHTML = "";
            modal.querySelector("#input-buscar-cliente").value = "";
          })
        );
      } catch {
        /* se ignora, el staff puede reintentar la búsqueda */
      }
    }, 300);
  });

  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#form-promo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const tipo = form.get("tipo");
    const filtroTipo = form.get("filtro_tipo");

    if (filtroTipo === "clientes" && clientesSeleccionados.length === 0) {
      return (modal.querySelector("#modal-error").innerHTML = `<div class="form-error">Agrega al menos un cliente.</div>`);
    }
    if (!confirm(`¿Aplicar "${form.get("nombre")}" ya mismo? Esto carga el saldo de inmediato, no se puede deshacer solo.`)) return;

    const datos = {
      nombre: form.get("nombre"),
      tipo,
      filtro_tipo: filtroTipo,
      monto_mxn: tipo === "credito_mxn" ? Number(form.get("monto_mxn")) : undefined,
      producto_id: tipo === "bebida_gratis" ? form.get("producto_id") : undefined,
      filtro_perfil: filtroTipo === "perfil" ? form.get("filtro_perfil") : undefined,
      clientes_ids: filtroTipo === "clientes" ? clientesSeleccionados.map((c) => c.id) : undefined,
    };

    try {
      const { clientes_afectados } = await api.post("/promos-saldo/aplicar", datos);
      cerrarModal();
      toast(`✓ Saldo cargado a ${clientes_afectados} cliente${clientes_afectados === 1 ? "" : "s"}`);
      await cargarYPintar(content);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo aplicar la campaña.";
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    }
  });
}
