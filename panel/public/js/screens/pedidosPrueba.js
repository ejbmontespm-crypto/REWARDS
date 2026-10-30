// PROVISIONAL — pantalla solo para pruebas: crea un pedido directo sin
// tener que loguearse como cliente y como staff por separado. Quitar
// (archivo + entrada en layout.js/router.js + endpoint en el backend)
// cuando ya no se necesite para probar el flujo de cocina/impresión.
import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, formatoMXN } from "../ui.js";

export async function render() {
  const content = renderShell("pedidos-prueba", "Crear pedido de prueba");
  content.innerHTML = spinner;
  try {
    const [{ productos }, { categorias }] = await Promise.all([api.get("/productos"), api.get("/categorias-producto")]);
    pintar(content, productos, categorias);
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function pintar(content, productos, categorias) {
  let clienteElegido = null;
  const cantidades = {}; // producto_id -> cantidad

  const nombreCategoria = (id) => categorias.find((c) => c.id === id)?.nombre || "Sin categoría";

  content.innerHTML = `
    <div class="banner banner-warning">
      <div>Provisional, solo para pruebas — crea un pedido real en la base de datos directo desde el panel (sin elegibilidad, horario ni monedero), para poder probar el flujo de cocina/impresión sin tener que entrar como cliente y como staff por separado.</div>
    </div>

    <div class="card" style="max-width:640px;">
      <div class="form-row">
        <label class="form-label">Cliente</label>
        <input class="form-input" id="input-buscar-cliente" placeholder="Nombre, teléfono o correo…" />
        <div id="resultados-busqueda" style="margin-top:6px;"></div>
        <div id="chip-cliente" style="margin-top:10px;"></div>
      </div>

      <div class="form-row">
        <label class="form-label">Hora de recolección (opcional — si se deja vacío, en 15 min)</label>
        <input class="form-input" type="datetime-local" id="input-pickup" />
      </div>

      <div class="form-row">
        <label class="form-label">Productos</label>
        <div id="lista-productos" style="display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto;border:1px solid #e6e2db;border-radius:8px;padding:10px;">
          ${productos
            .map(
              (p) => `
            <div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid #f1efe9;">
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:600;">${escapar(p.nombre)}</div>
                <div style="font-size:11px;color:#726c60;">${escapar(nombreCategoria(p.categoria_id))} · ${formatoMXN(p.precio)}${p.disponible ? "" : " · agotado"}</div>
              </div>
              <input class="form-input mono" type="number" min="0" step="1" value="0" data-producto="${p.id}" style="width:64px;" ${p.disponible ? "" : "disabled"} />
            </div>`
            )
            .join("")}
        </div>
      </div>

      <div id="form-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" id="btn-crear">Crear pedido de prueba</button>
      </div>
    </div>
  `;

  function pintarChipCliente() {
    const cont = content.querySelector("#chip-cliente");
    if (!clienteElegido) {
      cont.innerHTML = `<span class="muted" style="font-size:12.5px;">Ningún cliente elegido todavía.</span>`;
      return;
    }
    cont.innerHTML = `
      <span class="badge badge-neutral" style="display:inline-flex;align-items:center;gap:6px;">
        ${escapar(clienteElegido.nombre)} ${escapar(clienteElegido.apellido_paterno)}
        <span id="quitar-cliente" style="cursor:pointer;font-weight:700;">×</span>
      </span>`;
    content.querySelector("#quitar-cliente").addEventListener("click", () => {
      clienteElegido = null;
      pintarChipCliente();
    });
  }
  pintarChipCliente();

  let buscandoTimeout = null;
  content.querySelector("#input-buscar-cliente").addEventListener("input", (ev) => {
    clearTimeout(buscandoTimeout);
    const termino = ev.target.value.trim();
    const resultados = content.querySelector("#resultados-busqueda");
    if (!termino) {
      resultados.innerHTML = "";
      return;
    }
    buscandoTimeout = setTimeout(async () => {
      try {
        const { clientes } = await api.get("/clientes", { query: { buscar: termino } });
        resultados.innerHTML = clientes
          .slice(0, 8)
          .map(
            (c) =>
              `<div class="icon-btn" data-cliente='${JSON.stringify(c).replace(/'/g, "&apos;")}' style="cursor:pointer;padding:6px 4px;font-size:12.5px;">${escapar(c.nombre)} ${escapar(c.apellido_paterno)} — ${escapar(c.correo || c.telefono || "")}</div>`
          )
          .join("");
        resultados.querySelectorAll("[data-cliente]").forEach((el) =>
          el.addEventListener("click", () => {
            clienteElegido = JSON.parse(el.dataset.cliente);
            pintarChipCliente();
            resultados.innerHTML = "";
            content.querySelector("#input-buscar-cliente").value = "";
          })
        );
      } catch {
        /* se ignora, se puede reintentar la búsqueda */
      }
    }, 300);
  });

  content.querySelectorAll("#lista-productos input[data-producto]").forEach((input) =>
    input.addEventListener("change", (ev) => {
      cantidades[ev.target.dataset.producto] = Number(ev.target.value) || 0;
    })
  );

  content.querySelector("#btn-crear").addEventListener("click", async () => {
    const errorBox = content.querySelector("#form-error");
    errorBox.innerHTML = "";

    if (!clienteElegido) return (errorBox.innerHTML = `<div class="form-error">Elige un cliente.</div>`);
    const items = Object.entries(cantidades)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
    if (items.length === 0) return (errorBox.innerHTML = `<div class="form-error">Agrega al menos un producto con cantidad mayor a 0.</div>`);

    const pickupInput = content.querySelector("#input-pickup").value;
    const datos = {
      cliente_id: clienteElegido.id,
      items,
      hora_pickup: pickupInput ? new Date(pickupInput).toISOString() : undefined,
    };

    try {
      const { pedido } = await api.post("/pedidos/admin-crear", datos);
      toast(`✓ Pedido creado — folio ${pedido.folio}`);
      await render();
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo crear el pedido.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    }
  });
}
