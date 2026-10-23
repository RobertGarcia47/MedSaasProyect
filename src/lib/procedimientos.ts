// Catálogo de procedimientos y precios de la clínica (sql/2026-10-22_procedimientos_catalogo.sql).
// Lo lee todo el equipo; solo el owner escribe (RLS). El catálogo sugerido vive en
// `procedimientos_base` (global) y se copia a la clínica con la RPC
// cargar_procedimientos_base, que es idempotente.

import { supabase } from './supabase';

export interface Procedimiento {
  id: string;
  clinica_id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  duracion_min: number;
  precio: number | null;   // MXN; null = sin precio aún
  activo: boolean;
}

export interface ProcedimientoInput {
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  duracion_min: number;
  precio: number | null;
  activo: boolean;
}

const COLUMNAS = 'id, clinica_id, codigo, nombre, categoria, duracion_min, precio, activo';

/** Error legible; 23505 = código repetido en la clínica (UNIQUE clinica_id+codigo). */
function traducir(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('Ya existe un procedimiento con ese código.');
  if (error.code === '42501') return new Error('Solo el dueño de la clínica puede modificar el catálogo.');
  return new Error(error.message);
}

export async function fetchProcedimientos(clinicaId: string): Promise<Procedimiento[]> {
  const { data, error } = await supabase
    .from('procedimientos')
    .select(COLUMNAS)
    .eq('clinica_id', clinicaId)
    .order('categoria', { ascending: true, nullsFirst: false })
    .order('codigo', { ascending: true, nullsFirst: false })
    .order('nombre', { ascending: true });
  if (error) throw traducir(error);
  return (data ?? []) as Procedimiento[];
}

export async function crearProcedimiento(clinicaId: string, p: ProcedimientoInput): Promise<void> {
  const { error } = await supabase.from('procedimientos').insert({ clinica_id: clinicaId, ...p });
  if (error) throw traducir(error);
}

export async function actualizarProcedimiento(id: string, cambios: Partial<ProcedimientoInput>): Promise<void> {
  const { data, error } = await supabase.from('procedimientos').update(cambios).eq('id', id).select('id');
  if (error) throw traducir(error);
  // La RLS no lanza error al rechazar un UPDATE: simplemente no toca filas.
  if (!data || data.length === 0) throw new Error('No se pudo guardar: solo el dueño de la clínica puede modificar el catálogo.');
}

export async function eliminarProcedimiento(id: string): Promise<void> {
  const { data, error } = await supabase.from('procedimientos').delete().eq('id', id).select('id');
  if (error) throw traducir(error);
  if (!data || data.length === 0) throw new Error('No se pudo eliminar: solo el dueño de la clínica puede modificar el catálogo.');
}

/** Copia el catálogo dental sugerido a la clínica; devuelve cuántos procedimientos NUEVOS agregó. */
export async function cargarProcedimientosBase(clinicaId: string): Promise<number> {
  const { data, error } = await supabase.rpc('cargar_procedimientos_base', { p_clinica_id: clinicaId, p_especialidad: 'dental' });
  if (error) throw traducir(error);
  return (data as number) ?? 0;
}

export const formatoPrecio = (n: number | null | undefined): string =>
  n == null ? '' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 });
