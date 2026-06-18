// Antecedentes médicos del expediente (4 categorías narrativas).
// Se guardan como JSON cifrado en `expedientes.antecedentes_enc` vía RPCs
// SECURITY INVOKER (guardar_antecedentes / obtener_antecedentes). La RLS de
// `expedientes` gobierna el acceso; el frontend nunca toca el bytea directo.

import { supabase } from './supabase';

export interface Antecedentes {
  patologicos: string;
  no_patologicos: string;
  heredofamiliares: string;
  quirurgicos: string;
}

export const ANTECEDENTES_VACIOS: Antecedentes = {
  patologicos: '', no_patologicos: '', heredofamiliares: '', quirurgicos: '',
};

export async function obtenerAntecedentes(expedienteId: string): Promise<Antecedentes> {
  const { data, error } = await supabase.rpc('obtener_antecedentes', { p_expediente_id: expedienteId });
  if (error) throw error;
  const row = (data?.[0] ?? {}) as Partial<Antecedentes>;
  return {
    patologicos:      row.patologicos      ?? '',
    no_patologicos:   row.no_patologicos   ?? '',
    heredofamiliares: row.heredofamiliares ?? '',
    quirurgicos:      row.quirurgicos      ?? '',
  };
}

export async function guardarAntecedentes(expedienteId: string, a: Antecedentes): Promise<void> {
  const { error } = await supabase.rpc('guardar_antecedentes', {
    p_expediente_id:    expedienteId,
    p_patologicos:      a.patologicos      || null,
    p_no_patologicos:   a.no_patologicos   || null,
    p_heredofamiliares: a.heredofamiliares || null,
    p_quirurgicos:      a.quirurgicos      || null,
  });
  if (error) throw error;
}

// ── Alergias (tabla expediente_alergias, acceso directo — RLS alergias_acceso) ──
export interface Alergia { id: string; alergia: string; }

export async function obtenerAlergias(expedienteId: string): Promise<Alergia[]> {
  const { data, error } = await supabase
    .from('expediente_alergias')
    .select('id, alergia')
    .eq('expediente_id', expedienteId)
    .order('alergia');
  if (error) throw error;
  return (data ?? []) as Alergia[];
}

export async function agregarAlergia(expedienteId: string, clinicaId: string, alergia: string): Promise<Alergia> {
  const { data, error } = await supabase
    .from('expediente_alergias')
    .insert({ expediente_id: expedienteId, clinica_id: clinicaId, alergia })
    .select('id, alergia')
    .single();
  if (error) throw error;
  return data as Alergia;
}

export async function eliminarAlergia(id: string): Promise<void> {
  const { error } = await supabase.from('expediente_alergias').delete().eq('id', id);
  if (error) throw error;
}
