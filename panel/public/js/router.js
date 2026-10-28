import { estaAutenticado } from "./auth.js";
import * as login from "./screens/login.js";
import * as recuperar from "./screens/recuperar.js";
import * as cambiarPassword from "./screens/cambiarPassword.js";
import * as dashboard from "./screens/dashboard.js";
import * as recompensa from "./screens/recompensa.js";
import * as menu from "./screens/menu.js";
import * as promociones from "./screens/promociones.js";
import * as vigencias from "./screens/vigencias.js";
import * as clientes from "./screens/clientes.js";
import * as cuentas from "./screens/cuentas.js";
import * as reportes from "./screens/reportes.js";
import * as apariencia from "./screens/apariencia.js";

const RUTAS_PUBLICAS = new Set(["login", "recuperar"]);

function rutaActual() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return hash || "dashboard";
}

async function despachar() {
  const ruta = rutaActual();

  if (!RUTAS_PUBLICAS.has(ruta) && !estaAutenticado()) {
    window.location.hash = "#/login";
    return;
  }

  if (ruta === "login") return login.render();
  if (ruta === "recuperar") return recuperar.render();
  if (ruta === "cambiar-password") return cambiarPassword.render();
  if (ruta === "dashboard") return dashboard.render();
  if (ruta === "recompensa") return recompensa.render();
  if (ruta === "menu") return menu.render();
  if (ruta === "promociones") return promociones.render();
  if (ruta === "vigencias") return vigencias.render();
  if (ruta === "clientes") return clientes.render();
  if (ruta === "cuentas") return cuentas.render();
  if (ruta === "reportes") return reportes.render();
  if (ruta === "apariencia") return apariencia.render();

  window.location.hash = "#/dashboard";
}

export function iniciarRouter() {
  window.addEventListener("hashchange", despachar);
  window.addEventListener("auth:no-autenticado", () => {
    window.location.hash = "#/login";
  });
  despachar();
}
