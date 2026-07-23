// Estadísticas de la práctica del médico (Dashboard, sección "Panorama de tu práctica").
// Todas son queries DIRECTAS (sin RPC): consulta_diagnosticos, receta_medicamentos y
// citas son tablas planas — mismo patrón que ya usa el resto del frontend (ver
// consulta_diagnosticos en patients.ts, citas en citas.ts). Los únicos campos cifrados
// de recetas/consultas (indicaciones_enc, notas_enc/motivo_enc) no se tocan aquí.
// La agregación (conteo/top-N) se hace en el cliente: el volumen de una sola clínica
// es pequeño, no amerita una vista SQL todavía.

import { supabase } from './supabase';

export interface DxFrecuente {
  codigo: string;
  descripcion: string;
  count: number;
}

/** Diagnósticos CIE-10 más frecuentes de la clínica (histórico completo). */
export async function fetchTopDiagnosticos(clinicaId: string, limit = 5): Promise<DxFrecuente[]> {
  const { data, error } = await supabase
    .from('consulta_diagnosticos')
    .select('cie10_codigo, cie10(descripcion)')
    .eq('clinica_id', clinicaId);
  if (error) throw error;

  const counts = new Map<string, { descripcion: string; count: number }>();
  for (const row of (data ?? []) as unknown as { cie10_codigo: string; cie10: { descripcion: string } | null }[]) {
    const prev = counts.get(row.cie10_codigo);
    if (prev) prev.count++;
    else counts.set(row.cie10_codigo, { descripcion: row.cie10?.descripcion ?? row.cie10_codigo, count: 1 });
  }
  return [...counts.entries()]
    .map(([codigo, v]) => ({ codigo, descripcion: v.descripcion, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface MedicamentoFrecuente {
  medicamento: string;
  count: number;
  controlados: number;
}
export interface MedicamentosResumen {
  top: MedicamentoFrecuente[];
  totalLineas: number;
  totalControladas: number;
}

/** Medicamentos más recetados de la clínica + cuántas líneas van marcadas "controlado". */
export async function fetchTopMedicamentos(clinicaId: string, limit = 5): Promise<MedicamentosResumen> {
  const { data, error } = await supabase
    .from('receta_medicamentos')
    .select('medicamento, controlado')
    .eq('clinica_id', clinicaId);
  if (error) throw error;

  const rows = (data ?? []) as { medicamento: string; controlado: boolean }[];
  // Agrupa sin distinguir mayúsculas/espacios (texto libre capturado a mano),
  // conservando la primera capitalización vista para mostrar.
  const counts = new Map<string, { display: string; count: number; controlados: number }>();
  let totalControladas = 0;
  for (const r of rows) {
    const nombre = (r.medicamento ?? '').trim();
    if (!nombre) continue;
    const key = nombre.toLowerCase();
    const prev = counts.get(key) ?? { display: nombre, count: 0, controlados: 0 };
    prev.count++;
    if (r.controlado) { prev.controlados++; totalControladas++; }
    counts.set(key, prev);
  }
  const top = [...counts.values()]
    .map((v) => ({ medicamento: v.display, count: v.count, controlados: v.controlados }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  return { top, totalLineas: rows.length, totalControladas };
}

export interface CitasResumen {
  total: number;
  completadas: number;
  canceladas: number;
  noAsistio: number;
  tasaCancelacion: number; // % de (canceladas + no_asistio) sobre el total, redondeado
}

/** Resumen de citas desde `desde` a hoy — tasa de cancelación/no-show de la clínica. */
export async function fetchCitasResumen(clinicaId: string, desde: Date): Promise<CitasResumen> {
  const { data, error } = await supabase
    .from('citas')
    .select('estado')
    .eq('clinica_id', clinicaId)
    .gte('fecha', desde.toISOString());
  if (error) throw error;

  const rows = (data ?? []) as { estado: string }[];
  const total = rows.length;
  const completadas = rows.filter((r) => r.estado === 'completada').length;
  const canceladas = rows.filter((r) => r.estado === 'cancelada').length;
  const noAsistio = rows.filter((r) => r.estado === 'no_asistio').length;
  const tasaCancelacion = total > 0 ? Math.round(((canceladas + noAsistio) / total) * 100) : 0;
  return { total, completadas, canceladas, noAsistio, tasaCancelacion };
}

export interface DiaSemanaCount {
  dia: string;
  count: number;
}
const DIAS_DOM0 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; // Date#getDay(): 0=Dom

/** Consultas por día de la semana (histórico completo), Lun→Dom. */
export async function fetchConsultasPorDiaSemana(clinicaId: string): Promise<DiaSemanaCount[]> {
  const { data, error } = await supabase.from('consultas').select('fecha').eq('clinica_id', clinicaId);
  if (error) throw error;

  const rows = (data ?? []) as { fecha: string }[];
  const counts = new Array(7).fill(0);
  for (const r of rows) counts[new Date(r.fecha).getDay()]++;
  const ordenLunesADomingo = [1, 2, 3, 4, 5, 6, 0];
  return ordenLunesADomingo.map((i) => ({ dia: DIAS_DOM0[i], count: counts[i] }));
}
