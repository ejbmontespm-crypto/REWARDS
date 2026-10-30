// Construye el HTML de la(s) etiqueta(s) de un pedido a tamaño físico real
// (40mm x 60mm, las que va a comprar el negocio) — se usa tanto para la
// vista previa en PDF (mientras no hay impresora todavía) como, más
// adelante, para mandarlo tal cual al driver real de la impresora.
//
// Si la lista de productos no cabe en una sola etiqueta, se pagina en
// "1/2", "2/2", etc. — el QR (la única parte que de verdad hace falta para
// el escaneo de entrega) solo va en la primera página.
//
// El QR se genera aquí mismo como SVG puro (vía el paquete `qrcode`, el
// mismo que usa react-native-qrcode-svg por debajo) — nada de montar un
// componente y esperar un ref: así también sirve para la impresión
// automática al pasar a "preparando", sin pantalla visible de por medio.
import QRCode from "qrcode";

const MAX_LINEAS_POR_PAGINA = 7;

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lineasDeItems(items) {
  return (items || []).flatMap((item) => {
    const base = `${item.cantidad}× ${item.producto_nombre}`;
    const extras = item.extras?.length ? item.extras.map((e) => e.extra_nombre).join(", ") : null;
    return extras ? [base, `  + ${extras}`] : [base];
  });
}

/** Solo primer nombre + apellido paterno — ni el nombre completo (puede
 *  traer varios nombres de pila) ni el apellido materno hacen falta para
 *  que el cliente reconozca su etiqueta, y es menos dato personal expuesto
 *  pegado a un vaso que cualquiera puede ver. */
function nombreCorto(pedido) {
  const primerNombre = (pedido.nombre || "").trim().split(/\s+/)[0] || "";
  return `${primerNombre} ${pedido.apellido_paterno || ""}`.trim();
}

export async function construirHtmlEtiqueta(pedido, { logoUrl } = {}) {
  const qrSvg = await QRCode.toString(pedido.id, { type: "svg", margin: 0 });
  const lineas = lineasDeItems(pedido.items);
  const paginas = [];
  for (let i = 0; i < lineas.length; i += MAX_LINEAS_POR_PAGINA) {
    paginas.push(lineas.slice(i, i + MAX_LINEAS_POR_PAGINA));
  }
  if (paginas.length === 0) paginas.push([]);
  const totalPaginas = paginas.length;

  const horaPickup = new Date(pedido.hora_pickup).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const folio = pedido.folio || pedido.id.slice(0, 8);

  const paginasHtml = paginas
    .map(
      (lineasPagina, i) => `
      <div class="pagina">
        ${i === 0 && logoUrl ? `<img class="logo" src="${logoUrl}" />` : ""}
        ${i === 0 ? `<div class="qr">${qrSvg}</div>` : `<div class="espaciador-qr"></div>`}
        <div class="folio">${escapeHtml(folio)}</div>
        <div class="nombre">${escapeHtml(nombreCorto(pedido))}</div>
        ${totalPaginas > 1 ? `<div class="pagina-num">${i + 1}/${totalPaginas}</div>` : ""}
        <div class="items">
          ${lineasPagina.map((l) => `<div class="item">${escapeHtml(l)}</div>`).join("")}
        </div>
        <div class="hora">Pickup: ${horaPickup}</div>
      </div>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: 40mm 60mm; margin: 2mm; }
      * { box-sizing: border-box; font-family: Helvetica, Arial, sans-serif; }
      body { margin: 0; padding: 0; }
      .pagina {
        width: 36mm; min-height: 56mm; page-break-after: always;
        display: flex; flex-direction: column; align-items: center; gap: 1mm;
      }
      .logo { max-width: 14mm; max-height: 8mm; object-fit: contain; }
      .qr { width: 16mm; height: 16mm; }
      .qr svg { width: 100%; height: 100%; display: block; }
      .espaciador-qr { height: 2mm; }
      .folio { font-size: 8pt; font-weight: 700; letter-spacing: 0.3pt; }
      .nombre { font-size: 9pt; font-weight: 700; text-align: center; }
      .pagina-num { font-size: 7pt; color: #555; }
      .items { width: 100%; }
      .item { font-size: 7pt; line-height: 1.3; }
      .hora { font-size: 7pt; color: #555; margin-top: auto; }
    </style>
  </head>
  <body>${paginasHtml}</body>
</html>`;
}
