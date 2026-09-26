import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, abrirModal, cerrarModal, formatoFechaHora } from "../ui.js";
import { iconos } from "../icons.js";

const ETIQUETA_ROL = { admin: "Admin", staff: "Staff" };

export async function render() {
  const content = renderShell("cuentas", "Cuentas");
  await cargarYPintar(content);
}

async function cargarYPintar(content) {
  content.innerHTML = spinner;
  try {
    const [{ usuarios }, { solicitudes }, cfgPin] = await Promise.all([
      api.get("/usuarios-staff"),
      api.get("/password-reset-solicitudes", { query: { estado: "pendiente" } }),
      api.get("/configuracion-sistema/pin_correccion").catch(() => ({ valor: null })),
    ]);
    pintar(content, { usuarios, solicitudes, pin: cfgPin.valor?.pin || null });
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function pintar(content, { usuarios, solicitudes, pin }) {
  content.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-title" style="font-size:14px;font-weight:600;">Usuarios</div>
      <button class="btn btn-primary" id="btn-nueva-cuenta">${iconos.mas(14)} Nueva cuenta</button>
    </div>
    <div class="card" style="padding:0;">
      <table class="data">
        <tr><th>Nombre</th><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr>
        ${usuarios
          .map(
            (u) => `
          <tr>
            <td>${escapar(u.nombre_completo)}</td>
            <td class="mono-cell muted">${escapar(u.nombre_usuario)}</td>
            <td class="muted">${escapar(u.correo)}</td>
            <td><span class="badge ${u.rol === "admin" ? "badge-accent" : "badge-neutral"}">${ETIQUETA_ROL[u.rol]}</span></td>
            <td><button class="toggle ${u.activo ? "on" : ""} btn-toggle-activo" data-id="${u.id}"><div class="knob"></div></button></td>
            <td><button class="icon-btn btn-editar-usuario" data-id="${u.id}">${iconos.lapiz(13)}</button></td>
          </tr>`
          )
          .join("")}
      </table>
    </div>

    <div class="section-title">Solicitudes de reset pendientes</div>
    <div class="card" style="padding:${solicitudes.length ? "6px 22px" : "0"};">
      ${
        solicitudes.length
          ? solicitudes
              .map(
                (s) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eeece7;">
              <div>
                <div style="font-size:13px;font-weight:500;">${escapar(s.nombre_completo)}</div>
                <div style="font-size:11.5px;color:#726c60;">Solicitó restablecer su contraseña · ${formatoFechaHora(s.solicitado_en)}</div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-ghost btn-sm btn-rechazar" data-id="${s.id}">Rechazar</button>
                <button class="btn btn-primary btn-sm btn-aprobar" data-id="${s.id}" data-nombre="${escapar(s.nombre_completo)}">Aprobar</button>
              </div>
            </div>`
              )
              .join("")
          : `<div class="table-empty">Sin solicitudes pendientes.</div>`
      }
    </div>

    <div class="section-title">Seguridad</div>
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div class="card-title" style="margin:0;">PIN de corrección</div>
        <div class="card-sub" style="margin:2px 0 0;">Compartido con todo el staff, para autorizar ediciones/anulaciones de tickets</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="mono" id="valor-pin" style="font-size:18px;letter-spacing:0.25em;min-width:70px;text-align:right;">${pin ? "••••" : "sin definir"}</span>
        ${pin ? `<button class="btn btn-secondary btn-sm" id="btn-ver-pin">Ver</button>` : ""}
        <button class="btn btn-secondary btn-sm" id="btn-cambiar-pin">${pin ? "Cambiar" : "Definir"} PIN</button>
      </div>
    </div>
  `;

  document.getElementById("btn-ver-pin")?.addEventListener("click", (ev) => {
    const span = document.getElementById("valor-pin");
    if (span.textContent === "••••") {
      span.textContent = pin;
      ev.target.textContent = "Ocultar";
    } else {
      span.textContent = "••••";
      ev.target.textContent = "Ver";
    }
  });
  document.getElementById("btn-cambiar-pin").addEventListener("click", () => formularioPin(content));

  document.getElementById("btn-nueva-cuenta").addEventListener("click", () => formularioCuenta(content));
  content.querySelectorAll(".btn-editar-usuario").forEach((b) =>
    b.addEventListener("click", () => formularioCuenta(content, usuarios.find((u) => u.id === b.dataset.id)))
  );
  content.querySelectorAll(".btn-toggle-activo").forEach((b) =>
    b.addEventListener("click", async () => {
      const u = usuarios.find((x) => x.id === b.dataset.id);
      try {
        await api.patch(`/usuarios-staff/${u.id}`, { activo: !u.activo });
        await cargarYPintar(content);
        toast(u.activo ? "Cuenta desactivada" : "Cuenta activada");
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );
  content.querySelectorAll(".btn-aprobar").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        const { password_temporal } = await api.post(`/password-reset-solicitudes/${b.dataset.id}/aprobar`, {});
        mostrarPasswordTemporal(`Solicitud de ${b.dataset.nombre} aprobada`, password_temporal);
        await cargarYPintar(content);
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );
  content.querySelectorAll(".btn-rechazar").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Rechazar esta solicitud de reset?")) return;
      try {
        await api.post(`/password-reset-solicitudes/${b.dataset.id}/rechazar`, {});
        toast("Solicitud rechazada");
        await cargarYPintar(content);
      } catch (err) {
        toast(err.message, "error");
      }
    })
  );
}

function mostrarPasswordTemporal(titulo, password) {
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 10px;">${escapar(titulo)}</h2>
    <p style="font-size:12.5px;color:#726c60;margin:0 0 14px;">
      El envío real de correo (Resend) no está conectado todavía — comparte esta contraseña temporal directamente. No se vuelve a mostrar.
    </p>
    <div class="mono" style="background:#f7f6f4;border:1px solid #e6e2db;border-radius:8px;padding:14px;text-align:center;font-size:18px;letter-spacing:0.08em;margin-bottom:16px;">${escapar(password)}</div>
    <div class="form-actions" style="justify-content:center;">
      <button class="btn btn-primary" id="modal-cerrar-pass">Entendido</button>
    </div>
  `);
  modal.querySelector("#modal-cerrar-pass").addEventListener("click", cerrarModal);
}

function formularioCuenta(content, usuario) {
  const editando = Boolean(usuario);
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">${editando ? "Editar" : "Nueva"} cuenta</h2>
    <form id="form-cuenta">
      <div class="form-row"><label class="form-label">Nombre completo</label><input class="form-input" name="nombre_completo" value="${usuario ? escapar(usuario.nombre_completo) : ""}" required /></div>
      ${
        editando
          ? ""
          : `<div class="form-row"><label class="form-label">Nombre de usuario</label><input class="form-input" name="nombre_usuario" required /></div>`
      }
      <div class="form-row"><label class="form-label">Correo</label><input class="form-input" type="email" name="correo" value="${usuario ? escapar(usuario.correo) : ""}" required /></div>
      <div class="form-row">
        <label class="form-label">Rol</label>
        <select class="form-select" name="rol" id="select-rol">
          <option value="staff" ${!usuario || usuario.rol === "staff" ? "selected" : ""}>Staff</option>
          <option value="admin" ${usuario?.rol === "admin" ? "selected" : ""}>Admin</option>
        </select>
      </div>
      <div class="form-row" id="fila-correo-respaldo" style="display:${usuario?.rol === "admin" ? "flex" : "none"};">
        <label class="form-label">Correo de respaldo (recuperación de emergencia)</label>
        <input class="form-input" type="email" name="correo_respaldo" value="${usuario?.correo_respaldo ? escapar(usuario.correo_respaldo) : ""}" />
      </div>
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);

  modal.querySelector("#select-rol").addEventListener("change", (ev) => {
    modal.querySelector("#fila-correo-respaldo").style.display = ev.target.value === "admin" ? "flex" : "none";
  });
  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#form-cuenta").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      if (editando) {
        await api.patch(`/usuarios-staff/${usuario.id}`, datos);
        cerrarModal();
        toast("Guardado");
        await cargarYPintar(content);
      } else {
        const { password_temporal } = await api.post("/usuarios-staff", datos);
        cerrarModal();
        mostrarPasswordTemporal("Cuenta creada", password_temporal);
        await cargarYPintar(content);
      }
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    }
  });
}

function formularioPin(content) {
  const modal = abrirModal(`
    <h2 style="font-size:15px;margin:0 0 16px;">Nuevo PIN de corrección</h2>
    <form id="form-pin">
      <div class="form-row">
        <label class="form-label">PIN (4 a 6 dígitos)</label>
        <input class="form-input mono" name="pin" pattern="\\d{4,6}" inputmode="numeric" required />
      </div>
      <div id="modal-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  `);
  modal.querySelector("#modal-cancelar").addEventListener("click", cerrarModal);
  modal.querySelector("#form-pin").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const pin = new FormData(ev.target).get("pin");
    try {
      await api.patch("/configuracion-sistema/pin_correccion", { valor: { pin } });
      cerrarModal();
      toast("PIN actualizado");
      await cargarYPintar(content);
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      modal.querySelector("#modal-error").innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    }
  });
}
