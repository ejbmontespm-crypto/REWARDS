import { api, ApiError } from "../api.js";
import { obtenerUsuario } from "../auth.js";
import { iconos } from "../icons.js";
import { escapar } from "../ui.js";

export function render() {
  const usuario = obtenerUsuario();
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <div class="login-brand">${iconos.candado(24)}<span class="login-brand-text">Lealtad Café</span></div>
        <h1 class="login-title">Cambia tu contraseña</h1>
        <p style="font-size:12.5px;color:#726c60;margin-top:-12px;margin-bottom:18px;">
          Entraste con una contraseña temporal — elige una nueva antes de continuar.
        </p>
        <form id="form-cambiar">
          <div class="form-row">
            <label class="form-label">Contraseña actual (la temporal)</label>
            <input class="form-input" type="password" name="password_actual" autocomplete="current-password" required />
          </div>
          <div class="form-row">
            <label class="form-label">Contraseña nueva</label>
            <input class="form-input" type="password" name="password_nueva" autocomplete="new-password" minlength="8" required />
            <span class="form-hint">Mínimo 8 caracteres.</span>
          </div>
          <div id="cambiar-error"></div>
          <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:6px;" id="btn-cambiar">
            Guardar y continuar
          </button>
        </form>
      </div>
    </div>
  `;

  if (!usuario) {
    window.location.hash = "#/login";
    return;
  }

  document.getElementById("form-cambiar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = document.getElementById("btn-cambiar");
    const errorBox = document.getElementById("cambiar-error");
    errorBox.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Guardando…";

    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      await api.post("/auth/staff/cambiar-password", datos);
      window.location.hash = "#/dashboard";
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
      boton.disabled = false;
      boton.textContent = "Guardar y continuar";
    }
  });
}
