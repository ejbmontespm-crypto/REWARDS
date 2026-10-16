import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import { asegurarPermisoNotificaciones, notificarLocal } from "./notificacionesLocales";
import { agregarNotificacionStaff } from "./bandejaStaff";

const INTERVALO_MS = 8000; // más corto que el del cliente — un pedido sin atender es dinero/tiempo perdido

/**
 * Avisa al staff (notificación local + entrada en la bandeja) cuando llega
 * un pedido nuevo — se monta una sola vez en (staff)/_layout.js. La primera
 * pasada solo "memoriza" lo que ya estaba ahí (no avisa de pedidos viejos
 * al abrir la app), las siguientes comparan contra esa lista.
 *
 * También revisa de inmediato cada vez que el celular vuelve a primer plano
 * (se apagó la pantalla, se cambió de app y se regresó) — sin esto, la
 * primera notificación después de eso tarda hasta INTERVALO_MS en aparecer,
 * lo que se sentía como "solo aparece si cambio de pantalla".
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
