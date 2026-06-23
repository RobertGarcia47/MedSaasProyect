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
  instrucciones?: string | null;
  controlado?: boolean;
}

export interface RecetaUI {
  id: string;
  consulta_id: string | null;
  medico_id: string;
  diagnostico_cie10: string | null;
  indicaciones: string | null;       // descifrada por la RPC
  medicamentos: MedicamentoInput[];
  fecha_receta: string | null;       // 'YYYY-MM-DD'
  folio_num: number | null;
  created_at: string;
}

export interface NuevaReceta {
  diagnostico_cie10?: string | null;
  indicaciones?: string | null;
  medicamentos: MedicamentoInput[];
  consulta_id?: string | null;
  fecha_receta?: string | null;
}

/** Formatea el folio de receta: "R3 - 22-06-2026". */
export function formatFolioReceta(folio_num: number | null, fecha_receta: string | null, created_at: string): string {
  if (!folio_num) return '—';
  const d = fecha_receta ? new Date(fecha_receta + 'T00:00:00') : new Date(created_at);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `R${folio_num} - ${dd}-${mm}-${yyyy}`;
}

/** Crea una receta (cifra indicaciones) y devuelve su id. */
export async function crearReceta(expedienteId: string, input: NuevaReceta): Promise<string> {
  const { data, error } = await supabase.rpc('crear_receta', {
    p_expediente_id:     expedienteId,
    p_diagnostico_cie10: input.diagnostico_cie10 ?? null,
    p_indicaciones:      input.indicaciones      ?? null,
    p_medicamentos:      input.medicamentos       ?? [],
    p_consulta_id:       input.consulta_id        ?? null,
    p_fecha_receta:      input.fecha_receta        ?? null,
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
