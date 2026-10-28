import { api, ApiError } from "../api.js";
import { iconos } from "../icons.js";
import { escapar } from "../ui.js";

export function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <div class="login-brand">${iconos.candado(24)}<span class="login-brand-text">Lealtad Café</span></div>
        <h1 class="login-title">Recuperar acceso</h1>

        <div class="form-row" style="display:flex;gap:8px;margin-bottom:18px;">
          <button class="btn btn-secondary btn-sm" id="tab-staff" style="flex:1;justify-content:center;">Soy staff</button>
          <button class="btn btn-secondary btn-sm" id="tab-admin" style="flex:1;justify-content:center;">Soy admin</button>
        </div>

        <div id="panel-staff">
          <p style="font-size:12.5px;color:#726c60;margin-top:-6px;margin-bottom:16px;">
            Se le avisa a un admin para que apruebe tu solicitud y te dé una contraseña temporal.
          </p>
          <form id="form-staff">
            <div class="form-row">
              <label class="form-label">Usuario</label>
              <input class="form-input" name="nombre_usuario" autocomplete="username" required />
            </div>
            <div id="staff-error"></div>
            <div id="staff-exito"></div>
            <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:6px;" id="btn-staff">
              Pedir aprobación
            </button>
          </form>
        </div>

        <div id="panel-admin" style="display:none;">
          <p style="font-size:12.5px;color:#726c60;margin-top:-6px;margin-bottom:16px;">
            Te mandamos un código de 6 dígitos a tu correo de respaldo, válido 15 minutos.
          </p>
          <form id="form-admin-pedir">
            <div class="form-row">
              <label class="form-label">Usuario</label>
              <input class="form-input" name="nombre_usuario" autocomplete="username" required />
            </div>
            <div id="admin-pedir-error"></div>
            <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:6px;" id="btn-admin-pedir">
              Enviar código
            </button>
          </form>

          <form id="form-admin-verificar" style="display:none;margin-top:14px;">
            <div class="form-row">
              <label class="form-label">Código recibido</label>
              <input class="form-input mono" name="codigo" inputmode="numeric" pattern="\\d{6}" maxlength="6" required />
            </div>
            <div class="form-row">
              <label class="form-label">Contraseña nueva</label>
              <input class="form-input" type="password" name="password_nueva" autocomplete="new-password" minlength="8" required />
              <span class="form-hint">Mínimo 8 caracteres.</span>
            </div>
            <div id="admin-verificar-error"></div>
            <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:6px;" id="btn-admin-verificar">
              Cambiar contraseña
            </button>
          </form>
        </div>

        <div style="text-align:center;margin-top:18px;">
          <a href="#/login" style="font-size:12.5px;color:#726c60;">← Volver a entrar</a>
        </div>
      </div>
    </div>
  `;

  const tabStaff = document.getElementById("tab-staff");
  const tabAdmin = document.getElementById("tab-admin");
  const panelStaff = document.getElementById("panel-staff");
  const panelAdmin = document.getElementById("panel-admin");

  function mostrarTab(cual) {
    const esStaff = cual === "staff";
    panelStaff.style.display = esStaff ? "block" : "none";
    panelAdmin.style.display = esStaff ? "none" : "block";
    tabStaff.className = `btn btn-sm ${esStaff ? "btn-primary" : "btn-secondary"}`;
    tabAdmin.className = `btn btn-sm ${esStaff ? "btn-secondary" : "btn-primary"}`;
    tabStaff.style.cssText += "flex:1;justify-content:center;";
    tabAdmin.style.cssText += "flex:1;justify-content:center;";
  }
  tabStaff.addEventListener("click", () => mostrarTab("staff"));
  tabAdmin.addEventListener("click", () => mostrarTab("admin"));
  mostrarTab("staff");

  // --- Staff: solicitud de aprobación por un admin ---
  document.getElementById("form-staff").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = document.getElementById("btn-staff");
    const errorBox = document.getElementById("staff-error");
    const exitoBox = document.getElementById("staff-exito");
    errorBox.innerHTML = "";
    exitoBox.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Enviando…";

    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      const { mensaje } = await api.post("/auth/staff/forgot-password", datos);
      exitoBox.innerHTML = `<div class="form-hint" style="color:#2f7a4a;">${escapar(mensaje)}</div>`;
      ev.target.reset();
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo enviar la solicitud.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    } finally {
      boton.disabled = false;
      boton.textContent = "Pedir aprobación";
    }
  });

  // --- Admin: código por correo de respaldo ---
  let nombreUsuarioAdmin = "";
  document.getElementById("form-admin-pedir").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = document.getElementById("btn-admin-pedir");
    const errorBox = document.getElementById("admin-pedir-error");
    errorBox.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Enviando…";

    const datos = Object.fromEntries(new FormData(ev.target));
    nombreUsuarioAdmin = datos.nombre_usuario;
    try {
      const { mensaje } = await api.post("/auth/admin/backup-code/solicitar", datos);
      errorBox.innerHTML = `<div class="form-hint" style="color:#2f7a4a;">${escapar(mensaje)}</div>`;
      document.getElementById("form-admin-verificar").style.display = "block";
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo enviar el código.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    } finally {
      boton.disabled = false;
      boton.textContent = "Enviar código";
    }
  });

  document.getElementById("form-admin-verificar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = document.getElementById("btn-admin-verificar");
    const errorBox = document.getElementById("admin-verificar-error");
    errorBox.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Guardando…";

    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      await api.post("/auth/admin/backup-code/verificar", { ...datos, nombre_usuario: nombreUsuarioAdmin });
      window.location.hash = "#/login";
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
      boton.disabled = false;
      boton.textContent = "Cambiar contraseña";
    }
  });
}
