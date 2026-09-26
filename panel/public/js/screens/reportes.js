import { api } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, formatoMXN, formatoFecha, formatoFechaHora, descargarArchivo } from "../ui.js";

const REPORTES = [
  {
    id: "ventas",
    titulo: "Ventas",
    endpoint: "/movimientos",
    clave: "movimientos",
    archivo: "ventas.xlsx",
    filtros: [
      { nombre: "fecha_desde", tipo: "date", label: "Desde" },
      { nombre: "fecha_hasta", tipo: "date", label: "Hasta" },
    ],
    columnas: [
      { header: "Fecha", get: (m) => formatoFechaHora(m.created_at) },
      { header: "Cliente", get: (m) => `${m.nombre} ${m.apellido_paterno}` },
      { header: "Monto", get: (m) => formatoMXN(m.monto) },
      { header: "Créditos", get: (m) => m.creditos_generados },
      { header: "Visita", get: (m) => (m.cuenta_como_visita ? "Sí" : "No") },
      { header: "Registrado por", get: (m) => m.registrado_por },
    ],
  },
  {
    id: "canjes",
    titulo: "Canjes",
    endpoint: "/canjes",
    clave: "canjes",
    archivo: "canjes.xlsx",
    filtros: [
      { nombre: "fecha_desde", tipo: "date", label: "Desde" },
      { nombre: "fecha_hasta", tipo: "date", label: "Hasta" },
      {
        nombre: "tipo",
        tipo: "select",
        label: "Tipo",
        opciones: [
          ["", "Todos"],
          ["credito_valor_mxn", "Créditos = $ MXN"],
          ["credito_umbral", "Créditos = premio"],
          ["visitas", "Visitas"],
          ["expiracion_creditos", "Expiración de créditos"],
          ["expiracion_visitas", "Expiración de visitas"],
          ["penalizacion_creditos", "Penalización de créditos"],
          ["penalizacion_visitas", "Penalización de visitas"],
        ],
      },
    ],
    columnas: [
      { header: "Fecha", get: (c) => formatoFechaHora(c.created_at) },
      { header: "Cliente", get: (c) => `${c.nombre} ${c.apellido_paterno}` },
      { header: "Tipo", get: (c) => c.tipo },
      { header: "Cantidad", get: (c) => c.cantidad_descontada },
      { header: "Producto", get: (c) => c.producto_nombre || "—" },
      { header: "Autorizado por", get: (c) => c.autorizado_por || "Sistema" },
    ],
  },
  {
    id: "clientes",
    titulo: "Clientes por estado",
    endpoint: "/clientes",
    clave: "clientes",
    archivo: "clientes.xlsx",
    filtros: [
      {
        nombre: "tipo_perfil",
        tipo: "select",
        label: "Perfil",
        opciones: [
          ["", "Todos"],
          ["alumno", "Alumno"],
          ["docente", "Docente"],
          ["otro", "Otro"],
        ],
      },
      {
        nombre: "confirmado",
        tipo: "select",
        label: "Confirmación",
        opciones: [
          ["", "Todos"],
          ["true", "Confirmados"],
          ["false", "Sin confirmar"],
        ],
      },
    ],
    columnas: [
      { header: "Nombre", get: (c) => `${c.nombre} ${c.apellido_paterno}` },
      { header: "Contacto", get: (c) => c.correo || c.telefono || "—" },
      { header: "Perfil", get: (c) => c.tipo_perfil },
      { header: "Confirmado", get: (c) => (c.confirmado_en_ciclo_actual ? "Sí" : "No") },
      { header: "Notificaciones", get: (c) => (c.notificaciones_activas ? "Activas" : "Inactivas") },
      { header: "Registrado", get: (c) => formatoFecha(c.created_at) },
    ],
  },
  {
    id: "notificaciones",
    titulo: "Notificaciones",
    endpoint: "/notificaciones/log",
    clave: "notificaciones",
    archivo: "notificaciones.xlsx",
    filtros: [
      { nombre: "fecha_desde", tipo: "date", label: "Desde" },
      { nombre: "fecha_hasta", tipo: "date", label: "Hasta" },
      {
        nombre: "canal",
        tipo: "select",
        label: "Canal",
        opciones: [
          ["", "Todos"],
          ["correo", "Correo"],
          ["push", "Push"],
        ],
      },
      {
        nombre: "estado",
        tipo: "select",
        label: "Estado",
        opciones: [
          ["", "Todos"],
          ["enviado", "Enviado"],
          ["fallido", "Fallido"],
        ],
      },
    ],
    columnas: [
      { header: "Fecha", get: (n) => formatoFechaHora(n.created_at) },
      { header: "Cliente", get: (n) => (n.nombre ? `${n.nombre} ${n.apellido_paterno}` : "—") },
      { header: "Canal", get: (n) => n.canal },
      { header: "Tipo", get: (n) => n.tipo },
      { header: "Estado", get: (n) => (n.estado === "enviado" ? `<span class="badge badge-success">Enviado</span>` : `<span class="badge badge-danger">Fallido</span>`), html: true },
    ],
  },
  {
    id: "pedidos",
    titulo: "Pedidos",
    endpoint: "/pedidos/reporte",
    clave: "pedidos",
    archivo: "pedidos.xlsx",
    filtros: [
      { nombre: "fecha_desde", tipo: "date", label: "Desde" },
      { nombre: "fecha_hasta", tipo: "date", label: "Hasta" },
      {
        nombre: "estado",
        tipo: "select",
        label: "Estado",
        opciones: [
          ["", "Todos"],
          ["recibido", "Recibido"],
          ["preparando", "Preparando"],
          ["listo", "Listo"],
          ["entregado", "Entregado"],
          ["cancelado", "Cancelado"],
          ["no_recogido", "No recogido"],
        ],
      },
    ],
    columnas: [
      { header: "Fecha", get: (p) => formatoFechaHora(p.created_at) },
      { header: "Cliente", get: (p) => `${p.nombre} ${p.apellido_paterno}` },
      { header: "Pickup", get: (p) => formatoFechaHora(p.hora_pickup) },
      { header: "Estado", get: (p) => p.estado },
      { header: "Total", get: (p) => formatoMXN(p.total_mxn) },
    ],
  },
];

let reporteActivo = REPORTES[0].id;

export async function render() {
  const content = renderShell("reportes", "Reportes");
  pintarChasis(content);
  await cargarYPintarTabla(content);
}

function pintarChasis(content) {
  content.innerHTML = `
    <div class="tabs">
      ${REPORTES.map((r) => `<div class="tab ${r.id === reporteActivo ? "active" : ""}" data-id="${r.id}" style="cursor:pointer;">${escapar(r.titulo)}</div>`).join("")}
    </div>
    <div class="toolbar" id="fila-filtros"></div>
    <div id="zona-tabla" class="card" style="padding:0;">${spinner}</div>
  `;
  content.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      reporteActivo = t.dataset.id;
      pintarChasis(content);
      cargarYPintarTabla(content);
    })
  );
}

function valoresFiltros(reporte) {
  const datos = {};
  reporte.filtros.forEach((f) => {
    const el = document.getElementById(`filtro-${f.nombre}`);
    if (el && el.value) datos[f.nombre] = el.value;
  });
  return datos;
}

async function cargarYPintarTabla(content) {
  const reporte = REPORTES.find((r) => r.id === reporteActivo);
  const filaFiltros = document.getElementById("fila-filtros");
  filaFiltros.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
      ${reporte.filtros
        .map((f) =>
          f.tipo === "select"
            ? `<div class="form-row" style="margin:0;"><label class="form-label">${escapar(f.label)}</label>
                <select class="form-select" id="filtro-${f.nombre}" style="width:auto;">${f.opciones.map(([v, t]) => `<option value="${v}">${escapar(t)}</option>`).join("")}</select></div>`
            : `<div class="form-row" style="margin:0;"><label class="form-label">${escapar(f.label)}</label><input class="form-input" type="date" id="filtro-${f.nombre}" /></div>`
        )
        .join("")}
      <button class="btn btn-secondary btn-sm" id="btn-filtrar">Filtrar</button>
    </div>
    <button class="btn btn-primary btn-sm" id="btn-exportar">Exportar a Excel</button>
  `;
  filaFiltros.style.display = "flex";
  filaFiltros.style.justifyContent = "space-between";
  filaFiltros.style.alignItems = "flex-end";

  document.getElementById("btn-filtrar").addEventListener("click", () => cargarTabla(reporte));
  document.getElementById("btn-exportar").addEventListener("click", () => exportar(reporte));

  await cargarTabla(reporte);
}

async function cargarTabla(reporte) {
  const zona = document.getElementById("zona-tabla");
  zona.innerHTML = spinner;
  try {
    const datos = await api.get(reporte.endpoint, { query: valoresFiltros(reporte) });
    const filas = datos[reporte.clave];
    zona.innerHTML = filas.length
      ? `<table class="data" style="padding:0 20px;">
          <tr>${reporte.columnas.map((c) => `<th>${escapar(c.header)}</th>`).join("")}</tr>
          ${filas
            .map((fila) => `<tr>${reporte.columnas.map((c) => `<td class="mono-cell">${c.html ? c.get(fila) : escapar(String(c.get(fila)))}</td>`).join("")}</tr>`)
            .join("")}
        </table>
        <div style="padding:10px 20px;font-size:11.5px;color:#a29b8d;">${filas.length} fila${filas.length === 1 ? "" : "s"}</div>`
      : `<div class="table-empty">Sin resultados para estos filtros.</div>`;
  } catch (err) {
    zona.innerHTML = bannerError(err);
  }
}

async function exportar(reporte) {
  const boton = document.getElementById("btn-exportar");
  boton.disabled = true;
  boton.textContent = "Exportando…";
  try {
    const blob = await api.get(reporte.endpoint, { query: { ...valoresFiltros(reporte), export: "xlsx" } });
    descargarArchivo(blob, reporte.archivo);
    toast("Descargado");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Exportar a Excel";
  }
}
