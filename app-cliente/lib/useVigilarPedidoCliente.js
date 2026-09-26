import { useEffect, useRef } from "react";
import { api } from "./api";
import { asegurarPermisoNotificaciones, notificarLocal } from "./notificacionesLocales";

const ETIQUETA = { recibido: "Recibido", preparando: "En preparación", listo: "¡Listo para recoger!", entregado: "Entregado" };
const INTERVALO_MS = 15000;

/**
 * Avisa (notificación local) cuando el pedido en curso del cliente cambia
 * de estado — se monta una sola vez en (tabs)/_layout.js para que siga
 * funcionando sin importar en qué pestaña esté (no solo en Inicio).
 */
export function useVigilarPedidoCliente() {
  const estadoAnterior = useRef(null);

  useEffect(() => {
    asegurarPermisoNotificaciones();
    let activo = true;

    async function revisar() {
      try {
        const d = await api.get("/clientes/me");
        const pedido = d.pedido_en_curso;
        if (pedido) {
          if (estadoAnterior.current && estadoAnterior.current !== pedido.estado) {
            notificarLocal("Tu pedido avanzó", ETIQUETA[pedido.estado] || pedido.estado);
          }
          estadoAnterior.current = pedido.estado;
        } else {
          estadoAnterior.current = null;
        }
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }

    revisar();
    const intervalo = setInterval(() => activo && revisar(), INTERVALO_MS);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);
}
