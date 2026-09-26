import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast } from "../ui.js";
import { ASSET_BASE_URL } from "../config.js";

const CAMPOS = [
  { clave: "color_fondo", etiqueta: "Fondo" },
  { clave: "color_superficie", etiqueta: "Superficie (tarjetas)" },
  { clave: "color_texto", etiqueta: "Texto" },
  { clave: "color_acento", etiqueta: "Acento (botones, marca)" },
];

function urlCompleta(url) {
  if (!url) return "";
  return /^https?:\/\//.test(url) ? url : `${ASSET_BASE_URL}${url}`;
}

export async function render() {
  const content = renderShell("apariencia", "Apariencia");
  content.innerHTML = spinner;

  try {
    const { valor } = await api.get("/configuracion-sistema/apariencia");
    pintar(content, valor);
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

/** Un bloque de "sube una imagen" reutilizado por logo/botón QR/tazas. */
function bloqueImagen({ id, titulo, valorActual, requisitos, previewRedondo }) {
  return `
    <div class="section-title">${titulo}</div>
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <div style="width:64px;height:64px;flex-shrink:0;border:1px solid #e6e2db;border-radius:${previewRedondo ? "32px" : "8px"};overflow:hidden;background:#f1efe9;display:flex;align-items:center;justify-content:center;">
        <img id="preview-${id}" src="${urlCompleta(valorActual)}" style="max-width:100%;max-height:100%;object-fit:contain;" onerror="this.style.opacity=0.15" />
      </div>
      <div style="flex:1;">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="archivo-${id}" style="font-size:12.5px;" />
        <div id="estado-subida-${id}" style="font-size:12px;color:#726c60;margin-top:4px;"></div>
      </div>
    </div>
    <div class="banner banner-warning" style="margin-top:8px;">
      <div>
        <strong>Características recomendadas:</strong>
        <ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;line-height:1.7;">
          ${requisitos.map((r) => `<li>${r}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

function pintar(content, valorInicial) {
  const estado = { ...valorInicial };

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start;">
      <div class="card">
        <div class="card-title">Paleta de colores</div>
        <div class="card-sub">Se aplica a la app del cliente (Bienvenida, pantallas, botones). El panel conserva su propio diseño interno.</div>

        <div style="display:flex;flex-direction:column;gap:14px;">
          ${CAMPOS.map(
            (c) => `
            <div style="display:flex;align-items:center;gap:12px;">
              <input type="color" id="picker-${c.clave}" value="${escapar(estado[c.clave])}" style="width:42px;height:42px;border:1px solid #e6e2db;border-radius:8px;padding:0;cursor:pointer;" />
              <div style="flex:1;">
                <label class="form-label" style="margin-bottom:2px;">${c.etiqueta}</label>
                <input class="form-input mono" id="texto-${c.clave}" value="${escapar(estado[c.clave])}" maxlength="7" style="max-width:140px;" />
              </div>
            </div>`
          ).join("")}
        </div>

        ${bloqueImagen({
          id: "logo",
          titulo: "Logotipo",
          valorActual: estado.logo_url,
          previewRedondo: false,
          requisitos: [
            "<strong>Formato:</strong> PNG con transparencia (o SVG).",
            "<strong>Proporción:</strong> horizontal (el logo de referencia es 1836×600px, ≈3:1) — ya no se recorta en círculo, se muestra completo con su propio ancho.",
            "<strong>Resolución mínima si es PNG:</strong> 1200×400px, para que no se vea pixelado.",
            "<strong>Fondo:</strong> transparente — se coloca sobre distintos fondos.",
            "<strong>Peso:</strong> menos de 500KB.",
          ],
        })}

        ${bloqueImagen({
          id: "logo_qr",
          titulo: 'Botón "Mi QR" (Inicio de la app)',
          valorActual: estado.logo_qr_url,
          previewRedondo: false,
          requisitos: [
            "<strong>Formato:</strong> PNG (referencia: 1024×1024px).",
            "<strong>Proporción:</strong> cuadrada 1:1 — reemplaza el botón completo (ocupa todo el ancho de la pantalla en la app).",
            "<strong>Incluye su propio fondo/color/texto</strong> ya dibujados en la imagen — no se combina con la paleta de arriba, se muestra tal cual.",
            "Si no subes una, la app arma un botón cuadrado con el color de acento y el logo encima.",
            "<strong>Peso:</strong> menos de 500KB.",
          ],
        })}

        <div class="section-title">Progreso del pedido (Recibido · Preparando · Listo · Entregado)</div>
        <div class="card-sub" style="margin:-4px 0 10px;">
          Dos versiones del <strong>mismo dibujo</strong> — solo cambia el color/relleno — una por cada paso ya cumplido o no, lado a lado en la línea de tiempo del pedido (Inicio y detalle del pedido).
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>${bloqueImagen({
            id: "taza_vacia",
            titulo: "Paso aún no cumplido",
            valorActual: estado.taza_vacia_url,
            previewRedondo: false,
            requisitos: ["<strong>Formato:</strong> PNG transparente, 1024×1024px.", "Color apagado/gris.", "Menos de 500KB."],
          })}</div>
          <div>${bloqueImagen({
            id: "taza_llena",
            titulo: "Paso ya cumplido",
            valorActual: estado.taza_llena_url,
            previewRedondo: false,
            requisitos: ["<strong>Formato:</strong> PNG transparente, 1024×1024px.", "Misma silueta que la de al lado, color de marca.", "Menos de 500KB."],
          })}</div>
        </div>
        <div class="banner banner-warning" style="margin-top:8px;">
          <div><strong>Importante:</strong> ambas imágenes deben tener exactamente la misma forma/encuadre — el efecto de "llenado" recorta la versión llena por altura, y si no coinciden se ve desalineado.</div>
        </div>

        <div class="section-title">Progreso de la recompensa de lealtad</div>
        <div class="card-sub" style="margin:-4px 0 10px;">
          Mismo criterio (dos versiones del mismo dibujo) pero para la barra de progreso de la recompensa en Inicio — separado de las tazas de arriba para no mezclar "tu café va" con "tu recompensa va". Se usa en las 3 modalidades: visitas, créditos por umbral y créditos por valor en pesos.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>${bloqueImagen({
            id: "croissant_gris",
            titulo: "Recompensa: progreso pendiente",
            valorActual: estado.croissant_gris_url,
            previewRedondo: false,
            requisitos: ["<strong>Formato:</strong> PNG transparente, 1024×1024px.", "Color apagado/gris.", "Menos de 500KB."],
          })}</div>
          <div>${bloqueImagen({
            id: "croissant_dorado",
            titulo: "Recompensa: progreso cumplido",
            valorActual: estado.croissant_dorado_url,
            previewRedondo: false,
            requisitos: ["<strong>Formato:</strong> PNG transparente, 1024×1024px.", "Misma silueta que la de al lado, color dorado/marca.", "Menos de 500KB."],
          })}</div>
        </div>

        <div id="apariencia-error"></div>
        <div class="form-actions">
          <button class="btn btn-primary" id="btn-guardar">Guardar</button>
        </div>
      </div>

      <div class="card" id="tarjeta-preview" style="position:sticky;top:20px;"></div>
    </div>
  `;

  function repintarPreview() {
    const tarjeta = document.getElementById("tarjeta-preview");
    const logoTag = estado.logo_url
      ? `<img src="${urlCompleta(estado.logo_url)}" style="max-width:80%;max-height:56px;object-fit:contain;" onerror="this.style.opacity=0.2" />`
      : `<div style="width:72px;height:72px;border-radius:36px;background:${estado.color_superficie};"></div>`;
    tarjeta.innerHTML = `
      <div class="card-title">Vista previa — Bienvenida (app)</div>
      <div style="background:${estado.color_fondo};border-radius:12px;padding:28px 20px;display:flex;flex-direction:column;align-items:center;gap:14px;border:1px solid #e6e2db;">
        ${logoTag}
        <div style="color:${estado.color_texto};font-size:17px;font-weight:700;text-align:center;">Lealtad Café</div>
        <div style="color:${estado.color_texto};opacity:0.7;font-size:12px;text-align:center;">Acumula con cada compra y canjea recompensas.</div>
        <div style="background:${estado.color_acento};color:${estado.color_superficie};padding:12px 22px;border-radius:10px;font-size:13px;font-weight:600;width:100%;text-align:center;box-sizing:border-box;">Crear cuenta</div>
        <div style="border:1px solid ${estado.color_texto};opacity:0.5;color:${estado.color_texto};padding:12px 22px;border-radius:10px;font-size:13px;font-weight:600;width:100%;text-align:center;box-sizing:border-box;">Ya tengo cuenta</div>
      </div>

      <div class="card-title" style="margin-top:18px;">Vista previa — Botón "Mi QR"</div>
      ${
        estado.logo_qr_url
          ? `<img src="${urlCompleta(estado.logo_qr_url)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:16px;" onerror="this.style.opacity=0.2" />`
          : `<div style="width:100%;aspect-ratio:1;background:${estado.color_acento};border-radius:16px;display:flex;align-items:center;justify-content:center;color:${estado.color_superficie};font-size:13px;font-weight:600;">(diseño por defecto)</div>`
      }

      <div class="card-title" style="margin-top:18px;">Vista previa — Progreso del pedido</div>
      ${previewLlenado(estado.taza_vacia_url, estado.taza_llena_url)}

      <div class="card-title" style="margin-top:18px;">Vista previa — Progreso de recompensa</div>
      ${previewLlenado(estado.croissant_gris_url, estado.croissant_dorado_url)}
    `;
  }

  function previewLlenado(urlVacio, urlLleno) {
    return `
      <div style="position:relative;width:80px;height:80px;margin:0 auto;">
        ${urlVacio ? `<img src="${urlCompleta(urlVacio)}" style="position:absolute;width:100%;height:100%;object-fit:contain;" onerror="this.style.opacity=0.15" />` : ""}
        ${
          urlLleno
            ? `<div style="position:absolute;bottom:0;left:0;right:0;height:60%;overflow:hidden;">
                <img src="${urlCompleta(urlLleno)}" style="position:absolute;bottom:0;width:80px;height:80px;object-fit:contain;" onerror="this.style.opacity=0.15" />
               </div>`
            : ""
        }
      </div>
      <div style="text-align:center;font-size:11.5px;color:#726c60;margin-top:4px;">(ejemplo al 60%)</div>
    `;
  }

  CAMPOS.forEach((c) => {
    const picker = document.getElementById(`picker-${c.clave}`);
    const texto = document.getElementById(`texto-${c.clave}`);
    picker.addEventListener("input", () => {
      estado[c.clave] = picker.value;
      texto.value = picker.value;
      repintarPreview();
    });
    texto.addEventListener("input", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(texto.value)) {
        estado[c.clave] = texto.value;
        picker.value = texto.value;
        repintarPreview();
      }
    });
  });

  ["logo", "logo_qr", "taza_vacia", "taza_llena", "croissant_gris", "croissant_dorado"].forEach((id) => {
    const clave = `${id}_url`;
    document.getElementById(`archivo-${id}`).addEventListener("change", async (ev) => {
      const archivo = ev.target.files[0];
      if (!archivo) return;
      const estadoTexto = document.getElementById(`estado-subida-${id}`);
      estadoTexto.textContent = "Subiendo…";
      try {
        const { url } = await api.subirArchivo(archivo);
        estado[clave] = url;
        document.getElementById(`preview-${id}`).src = url;
        estadoTexto.textContent = "Subido — recuerda dar clic en Guardar.";
        repintarPreview();
      } catch (err) {
        estadoTexto.textContent = err instanceof ApiError ? err.message : "No se pudo subir el archivo.";
      }
    });
  });

  document.getElementById("btn-guardar").addEventListener("click", async () => {
    const boton = document.getElementById("btn-guardar");
    const errorBox = document.getElementById("apariencia-error");
    errorBox.innerHTML = "";
    boton.disabled = true;
    boton.textContent = "Guardando…";
    try {
      await api.patch("/configuracion-sistema/apariencia", { valor: estado });
      toast("Apariencia guardada");
    } catch (err) {
      const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
      errorBox.innerHTML = `<div class="form-error">${escapar(mensaje)}</div>`;
    } finally {
      boton.disabled = false;
      boton.textContent = "Guardar";
    }
  });

  repintarPreview();
}
