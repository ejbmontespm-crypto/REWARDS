import { query } from "../config/db.js";

/**
 * Valores por defecto — los mismos "propuestos" en fase1/fase2/fase5,
 * por si el admin todavía no los ha guardado explícitamente en
 * configuracion_sistema.
 */
const DEFAULTS = {
  pedidos_gasto_minimo_mxn: { monto: 100 },
  pedidos_en_linea_activos: { activo: true },
  pedidos_tolerancia_minutos: { minutos: 30 },
  horario_servicio: { activo: false, apertura: "08:00", cierre: "20:00" },
  vigencia_aviso_previo_dias: { dias: 7 },
  apariencia: {
    color_fondo: "#FFCFFF",
    color_texto: "#000000",
    color_acento: "#754F34",
    color_superficie: "#FFFFFF",
    logo_url: "/assets/logo-provisional.svg",
    // Los siguientes 3 son opcionales — si no se han subido, la app usa un
    // diseño programático de respaldo (ver contextoTema.js / Inicio / Mi QR).
    logo_qr_url: null,
    // Tazas: progreso del PEDIDO (Recibido/Preparando/Listo/Entregado).
    taza_vacia_url: null,
    taza_llena_url: null,
    // Croissants: progreso de la RECOMPENSA de lealtad (las 3 modalidades),
    // sección aparte de las tazas para no mezclar "tu café va" con "tu
    // recompensa va".
    croissant_gris_url: null,
    croissant_dorado_url: null,
  },
};

export async function obtenerConfig(clave) {
  const { rows } = await query(`select valor from configuracion_sistema where clave = $1`, [clave]);
  return rows[0]?.valor ?? DEFAULTS[clave] ?? null;
}
