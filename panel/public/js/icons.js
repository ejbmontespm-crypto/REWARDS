// Íconos SVG en línea (trazo, sin relleno) — mismos del boceto, como
// funciones que regresan el markup listo para insertar.
const base = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const iconos = {
  dashboard: (s) => base(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`, s),
  recompensa: (s) => base(`<line x1="19" y1="5" x2="5" y2="19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>`, s),
  menu: (s) => base(`<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/>`, s),
  promociones: (s) => base(`<path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4l-3 5H5a2 2 0 0 0-2 2z"/><path d="M13 8a4 4 0 0 1 0 8"/><path d="M17 5a8 8 0 0 1 0 14"/>`, s),
  vigencias: (s) => base(`<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/>`, s),
  clientes: (s) => base(`<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17" cy="9" r="2.5"/><path d="M21 20v-1a4 4 0 0 0-3-3.87"/>`, s),
  cuentas: (s) => base(`<circle cx="7" cy="15" r="4"/><line x1="10.5" y1="11.5" x2="20" y2="2"/><line x1="16" y1="6" x2="19" y2="9"/><line x1="13" y1="9" x2="16" y2="12"/>`, s),
  reportes: (s) => base(`<line x1="4" y1="20" x2="4" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="20" y1="20" x2="20" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>`, s),
  paleta: (s) => base(`<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 2-2v-.5a1.5 1.5 0 0 1 1.5-1.5H18a3 3 0 0 0 3-3 9 9 0 0 0-9-11z"/><circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.2" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>`, s),
  buscar: (s) => base(`<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/>`, s),
  cerrar: (s) => base(`<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>`, s),
  check: (s) => base(`<polyline points="4 12 9 17 20 6"/>`, s),
  mas: (s) => base(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`, s),
  lapiz: (s) => base(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`, s),
  basura: (s) => base(`<polyline points="3 6 5 6 21 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`, s),
  alerta: (s) => base(`<path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>`, s),
  flechaIzq: (s) => base(`<line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/>`, s),
  imagen: (s) => base(`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`, s),
  archivo: (s) => base(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`, s),
  candado: (s) => base(`<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`, s),
  descargar: (s) => base(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`, s),
};
