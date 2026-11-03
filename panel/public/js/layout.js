import { iconos } from "./icons.js";
import { obtenerUsuario, cerrarSesion } from "./auth.js";

const NAV = [
  { ruta: "dashboard", texto: "Dashboard", icono: "dashboard" },
  { ruta: "recompensa", texto: "Regla de recompensa", icono: "recompensa" },
  { ruta: "menu", texto: "Menú", icono: "menu" },
  { ruta: "promociones", texto: "Promociones", icono: "promociones" },
  { ruta: "vigencias", texto: "Vigencias", icono: "vigencias" },
  { ruta: "clientes", texto: "Clientes", icono: "clientes" },
  { ruta: "cuentas", texto: "Cuentas", icono: "cuentas" },
  { ruta: "reportes", texto: "Reportes", icono: "reportes" },
  { ruta: "apariencia", texto: "Apariencia", icono: "paleta" },
  { ruta: "bitacora", texto: "Bitácora (dev)", icono: "alerta" },
  { ruta: "pedidos-prueba", texto: "Crear pedido (prueba)", icono: "alerta" },
];

function iniciales(nombreCompleto) {
  return (nombreCompleto || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/**
 * Dibuja el armazón (sidebar + header) dentro de #app y regresa el
 * elemento .content donde cada pantalla debe montar lo suyo.
 */
export function renderShell(rutaActiva, tituloHeader) {
  const usuario = obtenerUsuario();
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="app-shell" id="app-shell">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <div class="sidebar">
        <div class="sidebar-brand">
          ${iconos.menu(22)}
          <span class="sidebar-brand-text">Lealtad Café</span>
        </div>
        <div class="nav" id="nav">
          ${NAV.map(
            (item) => `
            <a class="nav-item ${item.ruta === rutaActiva ? "active" : ""}" href="#/${item.ruta}">
              ${iconos[item.icono](18)}${item.texto}
            </a>`
          ).join("")}
        </div>
      </div>
      <div class="main">
        <div class="header">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <button type="button" class="sidebar-toggle" id="sidebar-toggle" aria-label="Abrir menú">${iconos.hamburguesa(18)}</button>
            <div class="header-title">${tituloHeader}</div>
          </div>
          <div class="header-user">
            <div class="avatar">${iniciales(usuario?.nombre_completo)}</div>
            <div>
              <div class="header-user-name">${usuario?.nombre_completo || "—"}</div>
              <div class="header-user-role" id="cerrar-sesion" title="Cerrar sesión">${usuario?.rol === "admin" ? "Admin" : "Staff"} · salir</div>
            </div>
          </div>
        </div>
        <div class="content" id="content"></div>
      </div>
    </div>
  `;

  document.getElementById("cerrar-sesion").addEventListener("click", () => {
    cerrarSesion();
    window.location.hash = "#/login";
  });

  // Cajón deslizable en pantallas angostas (ver @media en styles.css) — en
  // escritorio estos elementos existen igual mas la CSS no les hace nada.
  const shell = document.getElementById("app-shell");
  const abrirCajon = () => shell.classList.add("sidebar-abierta");
  const cerrarCajon = () => shell.classList.remove("sidebar-abierta");
  document.getElementById("sidebar-toggle").addEventListener("click", abrirCajon);
  document.getElementById("sidebar-backdrop").addEventListener("click", cerrarCajon);
  document.getElementById("nav").addEventListener("click", cerrarCajon);

  return document.getElementById("content");
}
