// Plan de tratamiento del expediente (objetivos, intervenciones, frecuencia,
// fecha de revisión) — a nivel EXPEDIENTE, no por consulta, para salud mental.
// Mismo patrón que antecedentes.ts: JSON cifrado en `expedientes.plan_tratamiento_enc`
// vía RPCs SECURITY INVOKER (guardar_plan_tratamiento / obtener_plan_tratamiento).
// La RLS de `expedientes` gobierna el acceso.

import { supabase } from './supabase';

export interface PlanTratamiento {
  objetivos: string;
  intervenciones: string;
  frecuencia: string;
  fecha_revision: string; // "YYYY-MM-DD" o '' si no se ha fijado
}

export const PLAN_TRATAMIENTO_VACIO: PlanTratamiento = {
  objetivos: '', intervenciones: '', frecuencia: '', fecha_revision: '',
};

export async function obtenerPlanTratamiento(expedienteId: string): Promise<PlanTratamiento> {
  const { data, error } = await supabase.rpc('obtener_plan_tratamiento', { p_expediente_id: expedienteId });
  if (error) throw error;
  const row = (data?.[0] ?? {}) as Partial<{
    objetivos: string; intervenciones: string; frecuencia: string; fecha_revision: string;
  }>;
  return {
    objetivos: row.objetivos ?? '',
    intervenciones: row.intervenciones ?? '',
    frecuencia: row.frecuencia ?? '',
    fecha_revision: row.fecha_revision ?? '',
  };
}

export async function guardarPlanTratamiento(expedienteId: string, p: PlanTratamiento): Promise<void> {
  const { error } = await supabase.rpc('guardar_plan_tratamiento', {
    p_expediente_id: expedienteId,
    p_objetivos: p.objetivos || null,
    p_intervenciones: p.intervenciones || null,
    p_frecuencia: p.frecuencia || null,
    p_fecha_revision: p.fecha_revision || null,
  });
  if (error) throw error;
}
