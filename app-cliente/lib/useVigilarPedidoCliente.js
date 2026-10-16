import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import { asegurarPermisoNotificaciones, notificarLocal } from "./notificacionesLocales";

const ETIQUETA = { recibido: "Recibido", preparando: "En preparación", listo: "¡Listo para recoger!", entregado: "Entregado" };
const INTERVALO_MS = 15000;

/**
 * Avisa (notificación local) cuando CUALQUIERA de los pedidos activos del
 * cliente cambia de estado — un cliente puede tener más de uno a la vez
 * (fase A, ronda 5), así que se compara por id, no un solo estado suelto.
 * Se monta una sola vez en (tabs)/_layout.js para que siga funcionando sin
 * importar en qué pestaña esté (no solo en Inicio).
 */
export function useVigilarPedidoCliente() {
  const estadosAnteriores = useRef(new Map()); // id -> estado

  useEffect(() => {
    asegurarPermisoNotificaciones();
    let activo = true;

    async function revisar() {
      try {
        const d = await api.get("/clientes/me");
        const activos = d.pedidos_en_curso || [];
        const idsActuales = new Set();

        for (const pedido of activos) {
          idsActuales.add(pedido.id);
          const anterior = estadosAnteriores.current.get(pedido.id);
          if (anterior && anterior !== pedido.estado) {
            notificarLocal("Tu pedido avanzó", ETIQUETA[pedido.estado] || pedido.estado);
          }
          estadosAnteriores.current.set(pedido.id, pedido.estado);
        }
        // Limpia los que ya no están activos (entregados/cancelados) para
        // no acumular memoria indefinidamente en una sesión larga.
        for (const id of estadosAnteriores.current.keys()) {
          if (!idsActuales.has(id)) estadosAnteriores.current.delete(id);
        }
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }

    revisar();
    const intervalo = setInterval(() => activo && revisar(), INTERVALO_MS);
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active") revisar();
    });
    return () => {
      activo = false;
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, []);
}
