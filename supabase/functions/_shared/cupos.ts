// Cupo mensual de créditos de IA por clínica. Lógica pura (sin Deno ni Supabase) para poder probarla con
// Node. El cupo lo calcula la RPC ia_estado según el plan (sql/2026-11-18_ia_cupos_ayuda.sql); aquí solo se
// decide si una llamada más cabe y qué mensaje ve el usuario si no.

/** Lo que devuelve la RPC ia_estado. Los campos de cupo existen desde sql/2026-11-18_ia_cupos_ayuda.sql. */
export interface EstadoIA {
  habilitada: boolean;
  usos_mes: number;
  usos_5min: number;
  creditos_mes?: number | null;
  cupo_mes?: number | null;
  renueva_el?: string | null;   // 'YYYY-MM-DD'
}

/** Tope fijo anterior a los cupos por plan: se usa solo si el SQL de cupos aún no se ha corrido. */
export const LIMITE_MENSUAL_DEFECTO = 1000;

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

/** null si la clínica aún tiene créditos para `creditos` más; si no, el mensaje para el usuario. */
export function revisarCupo(e: EstadoIA, creditos: number, limiteFijo = LIMITE_MENSUAL_DEFECTO): string | null {
  const cupo = e.cupo_mes ?? limiteFijo;
  const usados = e.creditos_mes ?? e.usos_mes;
  if (usados + creditos <= cupo) return null;
  return `La clínica usó todos los créditos de IA de su plan este mes${e.renueva_el ? ` (se renuevan el ${fechaLarga(e.renueva_el)})` : ''}. Puedes cambiar de plan en Configuración → Suscripción.`;
}
