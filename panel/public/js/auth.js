const TOKEN_KEY = "lealtad_panel_token";
const USUARIO_KEY = "lealtad_panel_usuario";

export function guardarSesion(token, usuario) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
}

export function cerrarSesion() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
}

export function obtenerToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function obtenerUsuario() {
  try {
    return JSON.parse(localStorage.getItem(USUARIO_KEY) || "null");
  } catch {
    return null;
  }
}

export function estaAutenticado() {
  return Boolean(obtenerToken());
}
