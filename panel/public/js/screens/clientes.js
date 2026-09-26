import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, formatoMXN, formatoFecha, formatoFechaHora, abrirModal, cerrarModal } from "../ui.js";
import { iconos } from "../icons.js";

const PERFILES = ["alumno", "docente", "otro"];
const ETIQUETA_PERFIL = { alumno: "Alumno", docente: "Docente", otro: "Otro" };

export async function render() {
  const content = renderShell("clientes", "Clientes");
  content.innerHTML = `
    <div class="toolbar">
      <div class="search-input" style="max-width:460px;">
        ${iconos.buscar(16)}
        <input id="input-buscar" placeholder="Buscar por nombre, teléfono o correo…" />
      </div>
      <button class="btn btn-primary btn-sm" id="btn-nuevo-cliente">${iconos.mas(14)} Nuevo cliente</button>
    </div>
    <div id="resultados-count" style="font-size:12px;color:#a29b8d;margin-bottom:14px;"></div>
    <div class="card" id="tabla-clientes" style="padding:0;position:relative;">${spinner}</div>
  `;

  let temporizador;
  document.getElementById("input-buscar").addEventListener("input", (ev) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cargarLista(content, ev.target.value.trim()), 300);
  });
  document.getElementById("btn-nuevo-cliente").addEventListener("click", () => formularioCliente(content));

  await cargarLista(content, "");
}

function formularioCliente(content) {
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">Nuevo cliente</h2>
    <form id="form-cliente">
      <div class="form-row"><label class="form-label">Nombre</label><input class="form-input" name="nombre" required /></div>
      <div class="form-row"><label class="form-label">Apellido paterno</label><input class="form-input" name="apellido_paterno" required /></div>
      <div class="form-row"><label class="form-label">Apellido materno</label><input class="form-input" name="apellido_materno" /></div>
      <div class="form-row"><label class="form-label">Teléfono</label><input class="form-input mono" name="telefono" required /></div>
      <div class="form-row"><label class="form-label">Correo</label><input class="form-input" type="email" name="correo" required /></div>
      <div class="form-row">
        <label class="form-label">Tipo de perfil</label>
        <select class="form-select" name="tipo_perfil">
          ${PERFILES.map((p) => `<option value="${p}">${ETIQUETA_PERFIL[p]}</option>`).join("")}
        </select>
      </div>
      <span class="form-hint">Alta manual (mostrador). El cliente aún no podrá iniciar sesión en la app hasta que esté conectado el login por OTP.</span>
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);
  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#form-cliente").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      await api.post("/clientes", datos);
      cerrarModal();
      toast("Cliente creado");
      cargarListaActual(content);
    } catch (err) {
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(err.message)}</div>`;
    }
  });
}

async function cargarLista(content, termino) {
  const tabla = document.getElementById("tabla-clientes");
  try {
    const { clientes } = await api.get("/clientes", { query: { buscar: termino } });
    document.getElementById("resultados-count").textContent = termino
      ? `${clientes.length} resultado${clientes.length === 1 ? "" : "s"} para "${termino}"`
      : `${clientes.length} clientes recientes`;

    tabla.innerHTML = clientes.length
      ? `<table class="data">
          <tr><th>Cliente</th><th>Perfil</th><th>Contacto</th><th>Notificaciones</th><th></th></tr>
          ${clientes
            .map(
              (c) => `
            <tr class="fila-cliente" data-id="${c.id}" style="cursor:pointer;">
              <td>${escapar(c.nombre)} ${escapar(c.apellido_paterno)}</td>
              <td><span class="badge badge-accent">${ETIQUETA_PERFIL[c.tipo_perfil] || c.tipo_perfil}</span></td>
              <td class="muted mono-cell">${escapar(c.telefono || c.correo || "—")}</td>
              <td>${c.notificaciones_activas ? `<span class="badge badge-success">Activas</span>` : `<span class="badge badge-neutral">Inactivas</span>`}</td>
              <td style="text-align:right;color:#a29b8d;">›</td>
            </tr>`
            )
            .join("")}
        </table>`
      : `<div class="table-empty">Sin resultados.</div>`;

    tabla.querySelectorAll(".fila-cliente").forEach((fila) =>
      fila.addEventListener("click", () => abrirFicha(content, fila.dataset.id))
    );
  } catch (err) {
    tabla.innerHTML = bannerError(err);
  }
}

async function abrirFicha(content, id) {
  document.getElementById("panel-cliente")?.remove();
  const panel = document.createElement("div");
  panel.id = "panel-cliente";
  panel.style.cssText =
    "position:fixed;top:0;right:0;bottom:0;width:400px;background:#fff;border-left:1px solid #e6e2db;box-shadow:-10px 0 26px rgba(32,30,26,0.12);z-index:400;overflow-y:auto;padding:22px;";
  panel.innerHTML = spinner;
  document.body.appendChild(panel);

  try {
    const [{ cliente }, { movimientos }] = await Promise.all([
      api.get(`/clientes/${id}`),
      api.get(`/clientes/${id}/movimientos`, { query: { limite: 10 } }),
    ]);
    pintarFicha(content, panel, cliente, movimientos);
  } catch (err) {
    panel.innerHTML = bannerError(err);
  }
}

function pintarFicha(content, panel, cliente, movimientos) {
  const iniciales = `${cliente.nombre[0] || ""}${cliente.apellido_paterno[0] || ""}`.toUpperCase();
  const confirmado = cliente.confirmado_en_ciclo_actual;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
      <div style="display:flex;gap:12px;">
        <div class="avatar" style="width:44px;height:44px;font-size:15px;">${escapar(iniciales)}</div>
        <div>
          <div style="font-size:14.5px;font-weight:600;">${escapar(cliente.nombre)} ${escapar(cliente.apellido_paterno)} ${cliente.apellido_materno ? escapar(cliente.apellido_materno) : ""}</div>
          <div style="font-size:11.5px;color:#726c60;margin-top:2px;">Registrado el ${formatoFecha(cliente.created_at)}</div>
        </div>
      </div>
      <button class="icon-btn" id="cerrar-ficha">${iconos.cerrar(14)}</button>
    </div>

    ${
      !cliente.notificaciones_activas
        ? `<div class="banner banner-warning" style="margin-bottom:16px;">Sus notificaciones están desactivadas — no recibe avisos de promociones. Conserva su saldo e historial completos.</div>`
        : !confirmado
          ? `<div class="banner banner-warning" style="margin-bottom:16px;">Tiene un ciclo de confirmación pendiente.</div>`
          : ""
    }

    <div class="section-title" style="margin-top:0;">Datos</div>
    <div style="display:flex;flex-direction:column;gap:9px;font-size:12.5px;margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:#726c60;">Teléfono</span><span class="mono-cell">${escapar(cliente.telefono || "—")}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#726c60;">Correo</span><span class="mono-cell">${escapar(cliente.correo || "—")}</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#726c60;">Tipo de perfil</span>
        <select class="form-select" id="select-perfil" style="width:auto;padding:5px 8px;font-size:12.5px;">
          ${PERFILES.map((p) => `<option value="${p}" ${cliente.tipo_perfil === p ? "selected" : ""}>${ETIQUETA_PERFIL[p]}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#726c60;">Créditos disponibles</span><span class="mono-cell">${cliente.creditos_disponibles ?? 0}</span></div>
      <div style="display:flex;justify-content:space-between;"><span style="color:#726c60;">Visitas disponibles</span><span class="mono-cell">${cliente.visitas_disponibles ?? 0}</span></div>
    </div>

    <div class="section-title">Historial reciente</div>
    ${
      movimientos.length
        ? `<table class="data" style="font-size:12px;">
            <tr><th>Fecha</th><th>Monto</th><th>Créditos</th></tr>
            ${movimientos
              .map(
                (m) => `<tr><td class="muted mono-cell">${formatoFechaHora(m.created_at)}</td><td class="mono-cell">${formatoMXN(m.monto)}</td><td class="mono-cell">+${m.creditos_generados}${m.cuenta_como_visita ? " · visita" : ""}</td></tr>`
              )
              .join("")}
          </table>`
        : `<div style="font-size:12px;color:#a29b8d;">Sin movimientos todavía.</div>`
    }

    <div class="section-title">Acciones</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-primary" id="btn-reactivar" ${cliente.notificaciones_activas && confirmado ? "disabled" : ""} style="width:100%;justify-content:center;">
        ${cliente.notificaciones_activas && confirmado ? "Cuenta al corriente" : "Reactivar cuenta"}
      </button>
      <button class="btn btn-secondary" id="btn-acceso-asistido" style="width:100%;justify-content:center;">
        Generar código de acceso asistido
      </button>
      <span class="form-hint">Para quien no tiene correo o nunca le llega el OTP — genera un código de un solo uso y compártelo en persona. Vence en 10 minutos.</span>
    </div>
  `;

  document.getElementById("cerrar-ficha").addEventListener("click", () => panel.remove());

  document.getElementById("btn-acceso-asistido").addEventListener("click", async (ev) => {
    const boton = ev.currentTarget;
    boton.disabled = true;
    try {
      const { codigo } = await api.post(`/clientes/${cliente.id}/acceso-asistido`, {});
      mostrarCodigoAsistido(cliente, codigo);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById("select-perfil").addEventListener("change", async (ev) => {
    try {
      await api.patch(`/clientes/${cliente.id}`, { tipo_perfil: ev.target.value });
      toast("Perfil actualizado");
      cargarListaActual(content);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  const btnReactivar = document.getElementById("btn-reactivar");
  if (!btnReactivar.disabled) {
    btnReactivar.addEventListener("click", async () => {
      try {
        await api.patch(`/clientes/${cliente.id}`, { notificaciones_activas: true, confirmado_en_ciclo_actual: true });
        toast("Cuenta reactivada");
        panel.remove();
        cargarListaActual(content);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }
}

function mostrarCodigoAsistido(cliente, codigo) {
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 10px;">Código de acceso asistido</h2>
    <p style="font-size:12.5px;color:#726c60;margin:0 0 14px;">
      Compártelo en persona con ${escapar(cliente.nombre)} — lo captura en la pantalla de código de la app. Vence en 10 minutos y solo sirve una vez. No se vuelve a mostrar.
    </p>
    <div class="mono" style="background:#f7f6f4;border:1px solid #e6e2db;border-radius:8px;padding:14px;text-align:center;font-size:22px;letter-spacing:0.15em;margin-bottom:16px;">${escapar(codigo)}</div>
    <div class="form-actions" style="justify-content:center;">
      <button class="btn btn-primary" id="modal-cerrar-codigo">Entendido</button>
    </div>
  `);
  modal.querySelector("#modal-cerrar-codigo").addEventListener("click", cerrarModal);
}

function cargarListaActual(content) {
  const termino = document.getElementById("input-buscar")?.value.trim() || "";
  cargarLista(content, termino);
}
