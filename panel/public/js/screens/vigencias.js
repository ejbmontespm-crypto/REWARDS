import { api, ApiError } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, escapar, toast, formatoFecha, formatoFechaHora } from "../ui.js";

function estadoCiclo(c) {
  if (c.ejecutado) return { texto: "Completado", clase: "badge-success" };
  if (c.tipo === "confirmacion_cuenta") {
    if (c.aviso_previo_enviado_en) return { texto: "Recordatorio enviado", clase: "badge-warning" };
    if (c.notificado_en) return { texto: "Invitación enviada", clase: "badge-warning" };
  } else if (c.aviso_previo_enviado_en) {
    return { texto: "Aviso previo enviado", clase: "badge-warning" };
  }
  return { texto: "Pendiente", clase: "badge-neutral" };
}

const yaArranco = (c) => Boolean(c?.notificado_en || c?.aviso_previo_enviado_en);

export async function render() {
  const content = renderShell("vigencias", "Vigencias");
  await cargarYPintar(content);
}

async function cargarYPintar(content) {
  content.innerHTML = spinner;
  try {
    const [{ ciclos: puntos }, { ciclos: confirmacion }, cfgAviso] = await Promise.all([
      api.get("/ciclos-vigencia", { query: { tipo: "puntos_creditos_visitas" } }),
      api.get("/ciclos-vigencia", { query: { tipo: "confirmacion_cuenta" } }),
      api.get("/configuracion-sistema/vigencia_aviso_previo_dias"),
    ]);
    pintar(content, { puntos, confirmacion, diasAviso: cfgAviso.valor.dias });
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}

function bloque(titulo, sub, ciclos, tipo, extraCampoHtml) {
  const pendiente = ciclos.find((c) => !c.ejecutado);
  const historial = ciclos.filter((c) => c.ejecutado);
  const bloqueado = yaArranco(pendiente);
  const est = pendiente ? estadoCiclo(pendiente) : null;

  return `
    <div class="card">
      <div class="card-title" style="margin:0;">${titulo}</div>
      <div class="card-sub">${sub}</div>

      ${
        pendiente
          ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <span class="badge ${est.clase}">${est.texto}</span>
              <span style="font-size:12.5px;color:#726c60;">Fecha límite: ${formatoFecha(pendiente.fecha_limite)}${pendiente.plazo_gracia_dias ? ` · gracia ${pendiente.plazo_gracia_dias} días` : ""}</span>
            </div>`
          : `<div style="font-size:12.5px;color:#a29b8d;margin-bottom:14px;">Sin fecha capturada.</div>`
      }

      ${
        bloqueado
          ? `<div class="banner banner-warning">Ya se mandó un aviso para este ciclo — espera a que termine (o ejecútalo manualmente abajo) antes de capturar otra fecha.</div>`
          : `<form class="form-ciclo" data-tipo="${tipo}" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
              <div class="form-row" style="margin:0;">
                <label class="form-label">Fecha límite</label>
                <input class="form-input" type="date" name="fecha_limite" value="${pendiente?.fecha_limite || ""}" required />
              </div>
              ${extraCampoHtml}
              <button class="btn btn-primary btn-sm" type="submit">${pendiente ? "Actualizar fecha" : "Capturar fecha"}</button>
            </form>`
      }

      ${
        historial.length
          ? `<div class="section-title" style="margin-top:20px;">Historial</div>
            <table class="data">
              <tr><th>Fecha límite</th><th>Ejecutado</th></tr>
              ${historial.map((h) => `<tr><td class="mono-cell">${formatoFecha(h.fecha_limite)}</td><td class="muted mono-cell">${formatoFechaHora(h.ejecutado_en)}</td></tr>`).join("")}
            </table>`
          : ""
      }
    </div>`;
}

function pintar(content, { puntos, confirmacion, diasAviso }) {
  content.innerHTML = `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div class="card-title" style="margin:0;">Aviso previo al vencimiento de puntos</div>
        <div class="card-sub" style="margin:2px 0 0;">Días antes de la fecha límite en que se manda el "están por vencer"</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input class="form-input mono" id="input-dias-aviso" type="number" min="1" value="${diasAviso}" style="width:80px;" />
        <button class="btn btn-secondary btn-sm" id="btn-dias-aviso">Guardar</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      ${bloque("Vigencia de puntos/créditos/visitas", "Al llegar la fecha, el saldo de todos se pone en 0.", puntos, "puntos_creditos_visitas", "")}
      ${bloque(
        "Ciclo de confirmación de cuenta",
        "Quien no confirme antes de que termine el plazo de gracia deja de recibir avisos de promociones.",
        confirmacion,
        "confirmacion_cuenta",
        `<div class="form-row" style="margin:0;"><label class="form-label">Plazo de gracia (días)</label><input class="form-input mono" type="number" min="1" name="plazo_gracia_dias" style="width:100px;" required /></div>`
      )}
    </div>

    <div class="section-title">Utilidad</div>
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;">
      <div style="font-size:12.5px;color:#726c60;">Corre el job de vigencias ahora mismo, en vez de esperar al cron diario (3am) — útil si el servidor estuvo caído a esa hora.</div>
      <button class="btn btn-secondary btn-sm" id="btn-ejecutar">Ejecutar ahora</button>
    </div>
  `;

  document.getElementById("btn-dias-aviso").addEventListener("click", async () => {
    const dias = Number(document.getElementById("input-dias-aviso").value);
    try {
      await api.patch("/configuracion-sistema/vigencia_aviso_previo_dias", { valor: { dias } });
      toast("Guardado");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  content.querySelectorAll(".form-ciclo").forEach((form) =>
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const datos = Object.fromEntries(new FormData(ev.target));
      datos.tipo = form.dataset.tipo;
      if (datos.plazo_gracia_dias) datos.plazo_gracia_dias = Number(datos.plazo_gracia_dias);
      try {
        await api.post("/ciclos-vigencia", datos);
        toast("Guardado");
        await cargarYPintar(content);
      } catch (err) {
        const mensaje = err instanceof ApiError ? err.message : "No se pudo guardar.";
        toast(mensaje, "error");
      }
    })
  );

  document.getElementById("btn-ejecutar").addEventListener("click", async () => {
    const boton = document.getElementById("btn-ejecutar");
    boton.disabled = true;
    boton.textContent = "Ejecutando…";
    try {
      const { resultados } = await api.post("/ciclos-vigencia/ejecutar", {});
      toast(resultados.length ? `${resultados.length} paso(s) ejecutado(s)` : "Nada por hacer todavía");
      await cargarYPintar(content);
    } catch (err) {
      toast(err.message, "error");
      boton.disabled = false;
      boton.textContent = "Ejecutar ahora";
    }
  });
}
