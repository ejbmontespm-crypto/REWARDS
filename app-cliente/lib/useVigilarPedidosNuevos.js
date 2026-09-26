import { useEffect, useRef } from "react";
import { api } from "./api";
import { asegurarPermisoNotificaciones, notificarLocal } from "./notificacionesLocales";
import { agregarNotificacionStaff } from "./bandejaStaff";

const INTERVALO_MS = 15000;

/**
 * Avisa al staff (notificación local + entrada en la bandeja) cuando llega
 * un pedido nuevo — se monta una sola vez en (staff)/_layout.js. La primera
 * pasada solo "memoriza" lo que ya estaba ahí (no avisa de pedidos viejos
 * al abrir la app), las siguientes comparan contra esa lista.
 */
export function useVigilarPedidosNuevos() {
  const idsConocidos = useRef(null); // null = todavía no se hizo la primera carga

  useEffect(() => {
    asegurarPermisoNotificaciones();
    let activo = true;

    async function revisar() {
      try {
        const { pedidos } = await api.get("/pedidos/cola", { query: { estado: "recibido" } });
        const actuales = new Set(pedidos.map((p) => p.id));

        if (idsConocidos.current) {
          const nuevos = pedidos.filter((p) => !idsConocidos.current.has(p.id));
          for (const p of nuevos) {
            const texto = `Nuevo pedido — ${p.nombre} ${p.apellido_paterno} — $${Number(p.total_mxn).toFixed(0)}`;
            notificarLocal("Pedido nuevo", texto);
            agregarNotificacionStaff(texto);
          }
        }
        idsConocidos.current = actuales;
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
