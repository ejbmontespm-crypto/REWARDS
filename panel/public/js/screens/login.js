import { api, ApiError } from "../api.js";
import { guardarSesion } from "../auth.js";
import { iconos } from "../icons.js";
import { escapar } from "../ui.js";

export function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <div class="login-brand">${iconos.menu(24)}<span class="login-brand-text">Lealtad Café</span></div>
        <h1 class="login-title">Entrar al panel</h1>
        <form id="form-login">
          <div class="form-row">
            <label class="form-label">Usuario</label>
            <input class="form-input" name="nombre_usuario" autocomplete="username" required />
          </div>
          <div class="form-row">
            <label class="form-label">Contraseña</label>
            <input class="form-input" type="password" name="password" autocomplete="current-password" required />
          </div>
          <div id="login-error"></div>
          <button class="btn btn-primary" type="submit" style="width:100%; justify-content:center; margin-top:6px;" id="btn-login">
            Entrar
          </button>
        </form>
        <div style="text-align:center;margin-top:16px;">
          <a href="#/recuperar" style="font-size:12.5px;color:#726c60;">¿Olvidaste tu contraseña?</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById("form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const boton = document.getElementById("btn-login");
    const errorBox = document.getElementById("login-error");
    errorBox.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Entrando…";

    const datos = Object.fromEntries(new FormData(ev.target));
    try {
      const respuesta = await api.post("/auth/staff/login", datos);
      guardarSesion(respuesta.token, respuesta.usuario);
      if (respuesta.debe_cambiar_password) {
        window.location.hash = "#/cambiar-password";
      } else {
        window.location.hash = "#/dashboard";
      }
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo iniciar sesión.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
  });
}
