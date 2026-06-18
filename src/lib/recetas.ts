// Servicio de recetas. La narrativa (indicaciones) va CIFRADA → todo pasa por
// las RPCs crear_receta / obtener_recetas (el frontend nunca toca columnas _enc).
// Los medicamentos son estructurados/planos y vienen anidados en la RPC de lectura.

import { supabase } from './supabase';

export interface MedicamentoInput {
  medicamento: string;
  dosis?: string | null;
  frecuencia?: string | null;
  duracion?: string | null;
  via?: string | null;
  instrucciones?: string | null;   // requiere columna receta_medicamentos.instrucciones
  controlado?: boolean;            // requiere columna receta_medicamentos.controlado
}

export interface RecetaUI {
  id: string;
  consulta_id: string | null;
  medico_id: string;
  diagnostico_cie10: string | null;
  indicaciones: string | null;       // descifrada por la RPC
  medicamentos: MedicamentoInput[];
  created_at: string;
}

export interface NuevaReceta {
  diagnostico_cie10?: string | null;
  indicaciones?: string | null;
  medicamentos: MedicamentoInput[];
  consulta_id?: string | null;
}

/** Crea una receta (cifra indicaciones) y devuelve su id. */
export async function crearReceta(expedienteId: string, input: NuevaReceta): Promise<string> {
  const { data, error } = await supabase.rpc('crear_receta', {
    p_expediente_id:     expedienteId,
    p_diagnostico_cie10: input.diagnostico_cie10 ?? null,
    p_indicaciones:      input.indicaciones ?? null,
    p_medicamentos:      input.medicamentos ?? [],
    p_consulta_id:       input.consulta_id ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Lista las recetas del expediente (indicaciones descifradas + medicamentos anidados). */
export async function obtenerRecetas(expedienteId: string): Promise<RecetaUI[]> {
  const { data, error } = await supabase.rpc('obtener_recetas', { p_expediente_id: expedienteId });
  if (error) throw error;
  return (data ?? []) as RecetaUI[];
}

/** Catálogo CIE-10 para el selector de diagnóstico. */
export async function fetchCie10(): Promise<{ codigo: string; descripcion: string }[]> {
  const { data, error } = await supabase
    .from('cie10')
    .select('codigo, descripcion')
    .order('codigo');
  if (error) throw error;
  return data ?? [];
}
