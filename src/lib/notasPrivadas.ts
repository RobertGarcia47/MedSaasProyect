// Notas de proceso privadas — reflexiones del propio terapeuta sobre una
// consulta, separadas de la nota oficial de evolución (ver `notas` en
// consultas.ts). Tabla `consulta_notas_privadas` con RLS restringida a
// `autor_id = auth.uid()`: NADIE más la ve, ni el owner de la clínica ni un
// asistente — a propósito no forma parte del expediente legal. No se audita
// (ver comentario en sql/2026-09-28_salud_mental_fase3.sql) y sí se puede
// editar (no es inmutable como consultas/recetas/informes).

import { supabase } from './supabase';

export async function guardarNotaPrivada(consultaId: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('guardar_nota_privada', { p_consulta_id: consultaId, p_nota: nota });
  if (error) throw error;
}

/** Devuelve null si el usuario actual no es el autor de la nota de esa consulta
 *  (o si no existe) — la RLS ya lo garantiza, esto solo refleja ese resultado. */
export async function obtenerNotaPrivada(consultaId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('obtener_nota_privada', { p_consulta_id: consultaId });
  if (error) throw error;
  return (data as string | null) ?? null;
}
