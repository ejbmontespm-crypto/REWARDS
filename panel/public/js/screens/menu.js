import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, abrirModal, cerrarModal, formatoMXN } from "../ui.js";
import { iconos } from "../icons.js";
import { ASSET_BASE_URL } from "../config.js";

function urlCompleta(url) {
  if (!url) return "";
  return /^https?:\/\//.test(url) ? url : `${ASSET_BASE_URL}${url}`;
}

let estadoActual = null; // { categorias, productos, extras, pedidosActivos, tolerancia }

export async function render() {
  const content = renderShell("menu", "Menú");
  await cargarYPintar(content);
}

async function cargarYPintar(content) {
  content.innerHTML = spinner;
  try {
    const [{ categorias }, { productos }, { extras }, cfgPedidos, cfgTolerancia, cfgHorario] = await Promise.all([
      api.get("/categorias-producto"),
      api.get("/productos"),
      api.get("/extras"),
      api.get("/configuracion-sistema/pedidos_en_linea_activos"),
      api.get("/configuracion-sistema/pedidos_tolerancia_minutos"),
      api.get("/configuracion-sistema/horario_servicio"),
    ]);
    estadoActual = {
      categorias,
      productos,
      extras,
      pedidosActivos: cfgPedidos.valor.activo,
      tolerancia: cfgTolerancia.valor.minutos,
      horario: cfgHorario.valor,
    };
    pintar(content);
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function nombreCategoria(id) {
  return estadoActual.categorias.find((c) => c.id === id)?.nombre || "—";
}

function pintar(content) {
  const { categorias, productos, extras, pedidosActivos, tolerancia, horario } = estadoActual;

  content.innerHTML = `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div class="card-title" style="margin:0;">Pedidos en línea</div>
        <div class="card-sub" style="margin:2px 0 0;">${pedidosActivos ? "Los clientes pueden pedir desde la app" : "Suspendidos — el mostrador sigue funcionando normal"}</div>
      </div>
      <button class="toggle ${pedidosActivos ? "on" : ""}" id="toggle-pedidos"><div class="knob"></div></button>
    </div>
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div class="card-title" style="margin:0;">Tolerancia de recogida</div>
        <div class="card-sub" style="margin:2px 0 0;">Minutos tras la hora de pickup antes de poder marcar un pedido como no recogido</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input class="form-input mono" id="input-tolerancia" type="number" min="1" value="${tolerancia}" style="width:80px;" />
        <button class="btn btn-secondary btn-sm" id="btn-tolerancia">Guardar</button>
      </div>
    </div>
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div class="card-title" style="margin:0;">Horario de servicio</div>
        <div class="card-sub" style="margin:2px 0 0;">${horario.activo ? "Los pedidos en línea solo se aceptan dentro de este horario" : "Desactivado — se aceptan pedidos en línea a cualquier hora"}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="toggle ${horario.activo ? "on" : ""}" id="toggle-horario"><div class="knob"></div></button>
        <input class="form-input mono" id="input-horario-apertura" type="time" value="${horario.apertura}" style="width:110px;" />
        <span class="muted">a</span>
        <input class="form-input mono" id="input-horario-cierre" type="time" value="${horario.cierre}" style="width:110px;" />
        <button class="btn btn-secondary btn-sm" id="btn-horario">Guardar</button>
      </div>
    </div>

    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
      <span>Categorías</span>
      <button class="btn btn-secondary btn-sm" id="btn-nueva-categoria">${iconos.mas(13)} Nueva categoría</button>
    </div>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:8px;">
      ${
        categorias.length
          ? categorias
              .map(
                (c) => `
            <span class="badge badge-neutral" style="padding:6px 10px;gap:8px;">
              ${escapar(c.nombre)}
              <button class="icon-btn btn-editar-cat" data-id="${c.id}" data-nombre="${escapar(c.nombre)}" data-orden="${c.orden}" style="width:18px;height:18px;border:none;background:none;padding:0;">${iconos.lapiz(12)}</button>
              <button class="icon-btn btn-borrar-cat" data-id="${c.id}" style="width:18px;height:18px;border:none;background:none;padding:0;color:#b3261e;">${iconos.cerrar(12)}</button>
            </span>`
              )
              .join("")
          : `<span style="font-size:12.5px;color:#a29b8d;">Sin categorías todavía.</span>`
      }
    </div>

    <div class="toolbar" style="margin-top:28px;">
      <div class="toolbar-title" style="font-size:14px;font-weight:600;">Productos</div>
      <button class="btn btn-primary" id="btn-nuevo-producto">${iconos.mas(14)} Nuevo producto</button>
    </div>
    <div class="card" style="padding:0;">
      ${
        productos.length
          ? `<table class="data" style="padding:0 20px;">
              <tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Disponible</th><th></th></tr>
              ${productos
                .map(
                  (p) => `
                <tr>
                  <td>${escapar(p.nombre)}</td>
                  <td class="muted">${escapar(p.categoria_nombre || "—")}</td>
                  <td class="mono-cell">${formatoMXN(p.precio)}</td>
                  <td><button class="toggle ${p.disponible ? "on" : ""} btn-toggle-prod" data-id="${p.id}"><div class="knob"></div></button></td>
                  <td>
                    <div style="display:flex;gap:6px;">
                      <button class="icon-btn btn-editar-prod" data-id="${p.id}">${iconos.lapiz(13)}</button>
                      <button class="icon-btn btn-borrar-prod" data-id="${p.id}" data-nombre="${escapar(p.nombre)}">${iconos.basura(13)}</button>
                    </div>
                  </td>
                </tr>`
                )
                .join("")}
            </table>`
          : `<div class="table-empty">Sin productos todavía.</div>`
      }
    </div>

    <div class="toolbar" style="margin-top:28px;">
      <div class="toolbar-title" style="font-size:14px;font-weight:600;">Extras</div>
      <button class="btn btn-secondary btn-sm" id="btn-nuevo-extra">${iconos.mas(13)} Nuevo extra</button>
    </div>
    <div class="card" style="padding:0;">
      ${
        extras.length
          ? `<table class="data" style="padding:0 20px;">
              <tr><th>Extra</th><th>Costo</th><th>Disponible</th><th></th></tr>
              ${extras
                .map(
                  (e) => `
                <tr>
                  <td>${escapar(e.nombre)}</td>
                  <td class="mono-cell">${formatoMXN(e.costo)}</td>
                  <td><button class="toggle ${e.disponible ? "on" : ""} btn-toggle-extra" data-id="${e.id}"><div class="knob"></div></button></td>
                  <td>
                    <div style="display:flex;gap:6px;">
                      <button class="icon-btn btn-editar-extra" data-id="${e.id}" data-nombre="${escapar(e.nombre)}" data-costo="${e.costo}">${iconos.lapiz(13)}</button>
                      <button class="icon-btn btn-borrar-extra" data-id="${e.id}" data-nombre="${escapar(e.nombre)}">${iconos.basura(13)}</button>
                    </div>
                  </td>
                </tr>`
                )
                .join("")}
            </table>`
          : `<div class="table-empty">Sin extras todavía.</div>`
      }
    </div>
  `;

  conectarEventos(content);
}

function conectarEventos(content) {
  document.getElementById("toggle-pedidos").addEventListener("click", async (ev) => {
    const activo = !estadoActual.pedidosActivos;
    ev.currentTarget.disabled = true;
    try {
      await api.patch("/configuracion-sistema/pedidos_en_linea_activos", { valor: { activo } });
      estadoActual.pedidosActivos = activo;
      pintar(content);
      toast(activo ? "Pedidos en línea activados" : "Pedidos en línea suspendidos");
    } catch (err) {
      toast(err.message, "error");
      ev.currentTarget.disabled = false;
    }
  });

  document.getElementById("btn-tolerancia").addEventListener("click", async () => {
    const minutos = Number(document.getElementById("input-tolerancia").value);
    try {
      await api.patch("/configuracion-sistema/pedidos_tolerancia_minutos", { valor: { minutos } });
      estadoActual.tolerancia = minutos;
      toast("Tolerancia actualizada");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  document.getElementById("toggle-horario").addEventListener("click", async (ev) => {
    const activo = !estadoActual.horario.activo;
    ev.currentTarget.disabled = true;
    try {
      const valor = { ...estadoActual.horario, activo };
      await api.patch("/configuracion-sistema/horario_servicio", { valor });
      estadoActual.horario = valor;
      pintar(content);
      toast(activo ? "Horario de servicio activado" : "Horario de servicio desactivado");
    } catch (err) {
      toast(err.message, "error");
      ev.currentTarget.disabled = false;
    }
  });

  document.getElementById("btn-horario").addEventListener("click", async () => {
    const apertura = document.getElementById("input-horario-apertura").value;
    const cierre = document.getElementById("input-horario-cierre").value;
    if (!apertura || !cierre || apertura >= cierre) {
      return toast("La apertura debe ser antes que el cierre.", "error");
    }
    try {
      const valor = { ...estadoActual.horario, apertura, cierre };
      await api.patch("/configuracion-sistema/horario_servicio", { valor });
      estadoActual.horario = valor;
      toast("Horario actualizado");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  document.getElementById("btn-nueva-categoria").addEventListener("click", () => formularioCategoria(content));
  content.querySelectorAll(".btn-editar-cat").forEach((b) =>
    b.addEventListener("click", () => formularioCategoria(content, { id: b.dataset.id, nombre: b.dataset.nombre, orden: b.dataset.orden }))
  );
  content.querySelectorAll(".btn-borrar-cat").forEach((b) =>
    b.addEventListener("click", () => borrar(content, `/categorias-producto/${b.dataset.id}`, "¿Borrar esta categoría?"))
  );

  document.getElementById("btn-nuevo-producto").addEventListener("click", () => formularioProducto(content));
  content.querySelectorAll(".btn-editar-prod").forEach((b) =>
    b.addEventListener("click", () => formularioProducto(content, estadoActual.productos.find((p) => p.id === b.dataset.id)))
  );
  content.querySelectorAll(".btn-borrar-prod").forEach((b) =>
    b.addEventListener("click", () => borrar(content, `/productos/${b.dataset.id}`, `¿Borrar "${b.dataset.nombre}"?`))
  );
  content.querySelectorAll(".btn-toggle-prod").forEach((b) =>
    b.addEventListener("click", async () => {
      const p = estadoActual.productos.find((x) => x.id === b.dataset.id);
      try {
        await api.patch(`/productos/${p.id}/disponibilidad`, { disponible: !p.disponible });
        await cargarYPintar(content);
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );

  document.getElementById("btn-nuevo-extra").addEventListener("click", () => formularioExtra(content));
  content.querySelectorAll(".btn-editar-extra").forEach((b) =>
    b.addEventListener("click", () => formularioExtra(content, { id: b.dataset.id, nombre: b.dataset.nombre, costo: b.dataset.costo }))
  );
  content.querySelectorAll(".btn-borrar-extra").forEach((b) =>
    b.addEventListener("click", () => borrar(content, `/extras/${b.dataset.id}`, `¿Borrar "${b.dataset.nombre}"?`))
  );
  content.querySelectorAll(".btn-toggle-extra").forEach((b) =>
    b.addEventListener("click", async () => {
      const e = estadoActual.extras.find((x) => x.id === b.dataset.id);
      try {
        await api.patch(`/extras/${e.id}/disponibilidad`, { disponible: !e.disponible });
        await cargarYPintar(content);
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );
}

async function borrar(content, ruta, pregunta) {
  if (!confirm(pregunta)) return;
  try {
    await api.delete(ruta);
    toast("Eliminado");
    await cargarYPintar(content);
  } catch (err) {
    toast(err.message, "error");
  }
}

function formularioCategoria(content, categoria) {
  const editando = Boolean(categoria);
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">${editando ? "Editar" : "Nueva"} categoría</h2>
    <form id="form-categoria">
      <div class="form-row"><label class="form-label">Nombre</label><input class="form-input" name="nombre" value="${categoria ? escapar(categoria.nombre) : ""}" required /></div>
      <div class="form-row"><label class="form-label">Orden</label><input class="form-input mono" type="number" name="orden" value="${categoria ? categoria.orden : 0}" /></div>
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);
  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#form-categoria").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(ev.target));
    datos.orden = Number(datos.orden) || 0;
    try {
      if (editando) await api.patch(`/categorias-producto/${categoria.id}`, datos);
      else await api.post("/categorias-producto", datos);
      cerrarModal();
      toast("Guardado");
      await cargarYPintar(content);
    } catch (err) {
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(err.message)}</div>`;
    }
  });
}

function formularioExtra(content, extra) {
  const editando = Boolean(extra);
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">${editando ? "Editar" : "Nuevo"} extra</h2>
    <form id="form-extra">
      <div class="form-row"><label class="form-label">Nombre</label><input class="form-input" name="nombre" value="${extra ? escapar(extra.nombre) : ""}" required /></div>
      <div class="form-row"><label class="form-label">Costo (MXN, 0 si es gratis)</label><input class="form-input mono" type="number" step="0.01" min="0" name="costo" value="${extra ? extra.costo : 0}" /></div>
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);
  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#form-extra").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      if (editando) await api.patch(`/extras/${extra.id}`, datos);
      else await api.post("/extras", datos);
      cerrarModal();
      toast("Guardado");
      await cargarYPintar(content);
    } catch (err) {
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(err.message)}</div>`;
    }
  });
}

async function formularioProducto(content, producto) {
  const editando = Boolean(producto);
  const { categorias, extras } = estadoActual;
  let extrasDelProducto = new Set();
  if (editando) {
    try {
      const { extras: asignados } = await api.get(`/productos/${producto.id}`);
      extrasDelProducto = new Set(asignados.map((e) => e.id));
    } catch {
      /* si falla, se guarda sin preseleccionar */
    }
  }

  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">${editando ? "Editar" : "Nuevo"} producto</h2>
    <form id="form-producto">
      <div class="form-row"><label class="form-label">Nombre</label><input class="form-input" name="nombre" value="${producto ? escapar(producto.nombre) : ""}" required /></div>
      <div class="form-row"><label class="form-label">Descripción</label><input class="form-input" name="descripcion" value="${producto?.descripcion ? escapar(producto.descripcion) : ""}" /></div>
      <div class="form-row"><label class="form-label">Precio (MXN)</label><input class="form-input mono" type="number" step="0.01" min="0" name="precio" value="${producto ? producto.precio : ""}" required /></div>
      <div class="form-row">
        <label class="form-label">Foto del platillo/bebida</label>
        <div style="display:flex;gap:14px;align-items:center;">
          <div style="width:56px;height:56px;flex-shrink:0;border:1px solid #e6e2db;border-radius:8px;overflow:hidden;background:#f1efe9;display:flex;align-items:center;justify-content:center;">
            <img id="preview-imagen-producto" src="${urlCompleta(producto?.imagen_path)}" style="max-width:100%;max-height:100%;object-fit:cover;" onerror="this.style.opacity=0.15" />
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" id="archivo-imagen-producto" style="font-size:12.5px;" />
        </div>
        <div id="estado-subida-imagen-producto" style="font-size:12px;color:#726c60;margin-top:4px;"></div>
      </div>
      <div class="form-row">
        <label class="form-label">Categoría</label>
        <select class="form-select" name="categoria_id">
          <option value="">Sin categoría</option>
          ${categorias.map((c) => `<option value="${c.id}" ${producto?.categoria_id === c.id ? "selected" : ""}>${escapar(c.nombre)}</option>`).join("")}
        </select>
      </div>
      ${
        extras.length
          ? `<div class="form-row">
              <label class="form-label">Extras aplicables</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${extras
                  .map(
                    (e) => `
                  <label style="display:inline-flex;align-items:center;gap:6px;border:1px solid #d6d1c7;border-radius:100px;padding:6px 12px;font-size:12.5px;">
                    <input type="checkbox" name="extra_ids" value="${e.id}" ${extrasDelProducto.has(e.id) ? "checked" : ""} /> ${escapar(e.nombre)}
                  </label>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);
  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#archivo-imagen-producto").addEventListener("change", async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    const estadoBox = modal.querySelector("#estado-subida-imagen-producto");
    estadoBox.textContent = "Subiendo…";
    try {
      const { url } = await api.subirArchivo(archivo);
      modal.querySelector("#preview-imagen-producto").src = urlCompleta(url);
      modal.querySelector("#form-producto").dataset.imagenPath = url;
      estadoBox.textContent = "Listo — se guarda junto con el producto.";
    } catch (err) {
      estadoBox.textContent = err instanceof ApiError ? err.message : "No se pudo subir la imagen.";
    }
  });
  modal.querySelector("#form-producto").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = new FormData(ev.target);
    const extraIds = form.getAll("extra_ids");
    const imagenPath = ev.target.dataset.imagenPath ?? producto?.imagen_path ?? null;
    const datos = { nombre: form.get("nombre"), descripcion: form.get("descripcion") || null, precio: Number(form.get("precio")), categoria_id: form.get("categoria_id") || null, imagen_path: imagenPath };
    try {
      let id = producto?.id;
      if (editando) await api.patch(`/productos/${id}`, datos);
      else {
        const { producto: creado } = await api.post("/productos", datos);
        id = creado.id;
      }
      await api.put(`/productos/${id}/extras`, { extra_ids: extraIds });
      cerrarModal();
      toast("Guardado");
      await cargarYPintar(content);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    }
  });
}
