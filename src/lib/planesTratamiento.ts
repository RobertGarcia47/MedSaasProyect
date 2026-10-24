// Plan de tratamiento y presupuesto del dentista (sql/2026-10-24_planes_tratamiento.sql).
// Cada plan cuelga del expediente y tiene líneas con una instantánea del procedimiento
// (código, nombre y precio al agregarlo). Las notas se cifran en la BD: viajan solo por
// RPCs. No confundir con lib/planTratamiento.ts (texto único de salud mental).

import { supabase } from './supabase';

export type EstadoPlan = 'borrador' | 'presentado' | 'aprobado' | 'completado' | 'cancelado';
export type EstadoItem = 'pendiente' | 'en_curso' | 'hecho' | 'cancelado';

export const ESTADOS_PLAN: { value: EstadoPlan; label: string }[] = [
  { value: 'borrador',   label: 'Borrador' },
  { value: 'presentado', label: 'Presentado al paciente' },
  { value: 'aprobado',   label: 'Aprobado' },
  { value: 'completado', label: 'Completado' },
  { value: 'cancelado',  label: 'Cancelado' },
];
export const ESTADOS_ITEM: { value: EstadoItem; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso',  label: 'En curso' },
  { value: 'hecho',     label: 'Hecho' },
  { value: 'cancelado', label: 'Cancelado' },
];

export interface ItemPlan {
  id: string;
  plan_id: string;
  procedimiento_id: string | null;
  codigo: string | null;
  nombre: string;
  diente: string | null;
  cantidad: number;
  precio_unitario: number;
  estado: EstadoItem;
  realizado_en: string | null;
  notas: string | null;
  orden: number;
}

export interface PlanDental {
  id: string;
  titulo: string;
  estado: EstadoPlan;
  descuento_pct: number;
  notas: string | null;
  medico_id: string;
  created_at: string;
  updated_at: string;
  items: ItemPlan[];
}

export interface ItemPlanInput {
  procedimiento_id: string | null;
  codigo: string | null;
  nombre: string;
  diente: string | null;
  cantidad: number;
  precio_unitario: number;
  estado: EstadoItem;
  notas: string | null;
  orden: number;
}

function traducir(error: { code?: string; message: string }): Error {
  if (error.code === '42501') return new Error('No tienes permiso para modificar este plan.');
  return new Error(error.message);
}

export async function obtenerPlanes(expedienteId: string): Promise<PlanDental[]> {
  const [planes, items] = await Promise.all([
    supabase.rpc('obtener_planes_tratamiento', { p_expediente_id: expedienteId }),
    supabase.rpc('obtener_items_planes', { p_expediente_id: expedienteId }),
  ]);
  if (planes.error) throw traducir(planes.error);
  if (items.error) throw traducir(items.error);
  const porPlan = new Map<string, ItemPlan[]>();
  for (const i of (items.data ?? []) as ItemPlan[]) {
    // numeric llega como número en JSON; se normaliza por si el driver lo manda como texto
    const item = { ...i, precio_unitario: Number(i.precio_unitario), cantidad: Number(i.cantidad) };
    porPlan.set(i.plan_id, [...(porPlan.get(i.plan_id) ?? []), item]);
  }
  return ((planes.data ?? []) as Omit<PlanDental, 'items'>[]).map((p) => ({
    ...p, descuento_pct: Number(p.descuento_pct), items: porPlan.get(p.id) ?? [],
  }));
}

export async function crearPlan(expedienteId: string, titulo: string): Promise<string> {
  const { data, error } = await supabase.rpc('crear_plan_tratamiento', { p_expediente_id: expedienteId, p_titulo: titulo });
  if (error) throw traducir(error);
  return data as string;
}

export async function actualizarPlan(planId: string, p: { titulo: string; notas: string | null; estado: EstadoPlan; descuento_pct: number }): Promise<void> {
  const { error } = await supabase.rpc('actualizar_plan_tratamiento', {
    p_plan_id: planId, p_titulo: p.titulo, p_notas: p.notas, p_estado: p.estado, p_descuento_pct: p.descuento_pct,
  });
  if (error) throw traducir(error);
}

/** Solo se pueden borrar planes en borrador (la RLS lo exige); 0 filas = no se pudo. */
export async function eliminarPlan(planId: string): Promise<void> {
  const { data, error } = await supabase.from('planes_tratamiento').delete().eq('id', planId).select('id');
  if (error) throw traducir(error);
  if (!data || data.length === 0) throw new Error('Solo se pueden eliminar planes en borrador. Cancélalo en su lugar.');
}

export async function guardarItem(planId: string, itemId: string | null, i: ItemPlanInput): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_item_plan', {
    p_plan_id: planId, p_item_id: itemId, p_procedimiento_id: i.procedimiento_id, p_codigo: i.codigo,
    p_nombre: i.nombre, p_diente: i.diente, p_cantidad: i.cantidad, p_precio_unitario: i.precio_unitario,
    p_estado: i.estado, p_notas: i.notas, p_orden: i.orden,
  });
  if (error) throw traducir(error);
  return data as string;
}

export async function eliminarItem(itemId: string): Promise<void> {
  const { data, error } = await supabase.from('planes_tratamiento_items').delete().eq('id', itemId).select('id');
  if (error) throw traducir(error);
  if (!data || data.length === 0) throw new Error('No se pudo eliminar la línea.');
}

// ── Totales (no se guardan: se calculan siempre desde las líneas) ─────────────
export interface TotalesPlan {
  subtotal: number;       // líneas no canceladas
  descuento: number;
  total: number;
  hecho: number;          // subtotal de las líneas hechas, ya con el descuento proporcional
  lineas: number;         // no canceladas
  lineasHechas: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function calcularTotales(plan: Pick<PlanDental, 'items' | 'descuento_pct'>): TotalesPlan {
  const vigentes = plan.items.filter((i) => i.estado !== 'cancelado');
  const subtotal = redondear(vigentes.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0));
  const factor = 1 - plan.descuento_pct / 100;
  const hechoBruto = vigentes.filter((i) => i.estado === 'hecho').reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
  return {
    subtotal,
    descuento: redondear(subtotal * (plan.descuento_pct / 100)),
    total: redondear(subtotal * factor),
    hecho: redondear(hechoBruto * factor),
    lineas: vigentes.length,
    lineasHechas: vigentes.filter((i) => i.estado === 'hecho').length,
  };
}
