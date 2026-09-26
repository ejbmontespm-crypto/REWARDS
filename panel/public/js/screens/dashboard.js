import { api } from "../api.js";
import { renderShell } from "../layout.js";
import { spinner, bannerError, formatoFecha, escapar } from "../ui.js";
import { iconos } from "../icons.js";

export async function render() {
  const content = renderShell("dashboard", "Dashboard");
  content.innerHTML = spinner;

  try {
    const [cola, solicitudes, ciclos, clientes] = await Promise.all([
      api.get("/pedidos/cola"),
      api.get("/password-reset-solicitudes", { query: { estado: "pendiente" } }),
      api.get("/ciclos-vigencia"),
      api.get("/clientes"),
    ]);

    const pedidosPendientes = cola.pedidos.length;
    const pedidosVencidos = cola.pedidos.filter((p) => p.vencido).length;
    const solicitudesPendientes = solicitudes.solicitudes;
    const ciclosActivos = ciclos.ciclos.filter((c) => !c.ejecutado);

    const haceUnaSemana = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const clientesNuevos = clientes.clientes.filter((c) => new Date(c.created_at).getTime() >= haceUnaSemana).length;

    content.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Pedidos pendientes</div>
          <div class="kpi-value">${pedidosPendientes}</div>
          <div class="kpi-sub">${pedidosVencidos ? `${pedidosVencidos} vencido${pedidosVencidos === 1 ? "" : "s"}` : "al corriente"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Solicitudes de reset</div>
          <div class="kpi-value">${solicitudesPendientes.length}</div>
          <div class="kpi-sub">pendientes de aprobar</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Clientes nuevos</div>
          <div class="kpi-value">${clientesNuevos}</div>
          <div class="kpi-sub">últimos 7 días</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Ciclos de vigencia activos</div>
          <div class="kpi-value">${ciclosActivos.length}</div>
          <div class="kpi-sub">puntos + confirmación</div>
        </div>
      </div>

      <div class="section-title">Alertas</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="card">
          <div class="card-title">Ciclos de vigencia en curso</div>
          <div class="card-sub">Fecha límite de cada uno</div>
          ${
            ciclosActivos.length
              ? ciclosActivos
                  .map(
                    (c) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eeece7;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:30px;height:30px;border-radius:7px;background:#fbf0d9;color:#92610a;display:flex;align-items:center;justify-content:center;">${iconos.alerta(15)}</div>
                  <div>
                    <div style="font-size:13px;font-weight:500;">${c.tipo === "puntos_creditos_visitas" ? "Vigencia de puntos/créditos/visitas" : "Ciclo de confirmación de cuenta"}</div>
                    <div style="font-size:11.5px;color:#726c60;">Vence el ${formatoFecha(c.fecha_limite)}</div>
                  </div>
                </div>
              </div>`
                  )
                  .join("")
              : `<div style="font-size:12.5px;color:#a29b8d;">No hay ciclos en curso.</div>`
          }
        </div>
        <div class="card">
          <div class="card-title">Solicitudes de reset pendientes</div>
          <div class="card-sub">Requieren tu aprobación</div>
          ${
            solicitudesPendientes.length
              ? solicitudesPendientes
                  .map(
                    (s) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eeece7;">
                <div style="font-size:13px;">${escapar(s.nombre_completo)}</div>
                <a class="btn btn-primary btn-sm" href="#/cuentas">Ver</a>
              </div>`
                  )
                  .join("")
              : `<div style="font-size:12.5px;color:#a29b8d;">No hay solicitudes pendientes.</div>`
          }
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = bannerError(err);
  }
}
