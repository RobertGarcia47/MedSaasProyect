// Lista de espera para adelanto de citas ("Oportunidades"). Un paciente con una cita a futuro
// puede pedir "avísenme si se libera algo antes" (citas.acepta_adelanto) — limitado al MISMO
// médico. Al cancelar una cita, si hay candidatos, se crea una fila en oportunidades_citas
// (sql/2026-07-30_oportunidades_citas.sql) que el personal resuelve a mano: asignar (mueve la
// cita del candidato al hueco vía reagendarCita) o descartar. Nunca automático.

import { supabase } from './supabase';
import { checkConflicto, reagendarCita } from './citas';

export type EstadoOportunidad = 'abierta' | 'asignada' | 'descartada';

export interface CandidatoUI {
  citaId: string;
  pacienteId: string;
  pacienteName: string;
  telefono: string | null;
  fecha: string;      // ISO de la cita actual del candidato (para calcular el beneficio)
  createdAt: string;  // para el orden alterno "por solicitud"
}

export interface OportunidadUI {
  id: string;
  clinicaId: string;
  medicoId: string;
  medicoNombre?: string;
  fecha: string;
  duracionMin: number;
  estado: EstadoOportunidad;
  creadaEn: string;
}

/** Crea la oportunidad al momento de cancelar (solo si ya se confirmó que hay ≥1 candidato). */
export async function crearOportunidad(
  clinicaId: string,
  medicoId: string,
  fechaIso: string,
  duracionMin: number,
  origenCitaId: string,
  creadaPor: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('oportunidades_citas')
    .insert({
      clinica_id: clinicaId,
      medico_id: medicoId,
      fecha: fechaIso,
      duracion_min: duracionMin,
      origen_cita_id: origenCitaId,
      creada_por: creadaPor,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

type CandidatoRow = {
  id: string;
  fecha: string;
  paciente_id: string;
  created_at: string;
  pacientes: { nombre: string; apellido_paterno: string | null; telefono: string | null } | null;
};

/**
 * Candidatos: citas del MISMO médico, con acepta_adelanto=true, no terminadas/canceladas, y
 * cuya fecha es posterior al hueco liberado (solo se benefician los que están más lejos).
 * Se devuelve ordenado por beneficio (fecha desc, el más lejano primero) — el orden "por
 * solicitud" (createdAt asc) lo aplica la UI sobre el mismo array, sin refetch.
 */
export async function fetchCandidatos(clinicaId: string, medicoId: string, fechaLimiteIso: string): Promise<CandidatoUI[]> {
  const { data, error } = await supabase
    .from('citas')
    .select('id, fecha, paciente_id, created_at, pacientes(nombre, apellido_paterno, telefono)')
    .eq('clinica_id', clinicaId)
    .eq('medico_id', medicoId)
    .eq('acepta_adelanto', true)
    .not('estado', 'in', '(cancelada,completada,no_asistio)')
    .gt('fecha', fechaLimiteIso)
    .order('fecha', { ascending: false });
  if (error) throw error;
  const rows = (data as unknown as CandidatoRow[]) ?? [];
  return rows.map((r) => {
    const pac = r.pacientes;
    return {
      citaId: r.id,
      pacienteId: r.paciente_id,
      pacienteName: pac ? [pac.nombre, pac.apellido_paterno].filter(Boolean).join(' ') : 'Paciente',
      telefono: pac?.telefono ?? null,
      fecha: r.fecha,
      createdAt: r.created_at,
    };
  });
}

type OportunidadRow = {
  id: string;
  clinica_id: string;
  medico_id: string;
  fecha: string;
  duracion_min: number;
  estado: EstadoOportunidad;
  creada_en: string;
  profiles: { nombre: string | null; apellido_paterno: string | null } | null;
};

/** Todas las oportunidades abiertas de la clínica (para el modal "explorar todas"). */
export async function fetchOportunidadesAbiertas(clinicaId: string): Promise<OportunidadUI[]> {
  const { data, error } = await supabase
    .from('oportunidades_citas')
    .select('id, clinica_id, medico_id, fecha, duracion_min, estado, creada_en, profiles!medico_id(nombre, apellido_paterno)')
    .eq('clinica_id', clinicaId)
    .eq('estado', 'abierta')
    .order('creada_en');
  if (error) throw error;
  const rows = (data as unknown as OportunidadRow[]) ?? [];
  return rows.map((r) => ({
    id: r.id,
    clinicaId: r.clinica_id,
    medicoId: r.medico_id,
    medicoNombre: r.profiles ? [r.profiles.nombre, r.profiles.apellido_paterno].filter(Boolean).join(' ') || undefined : undefined,
    fecha: r.fecha,
    duracionMin: r.duracion_min,
    estado: r.estado,
    creadaEn: r.creada_en,
  }));
}

/** Conteo para el badge de Dashboard. */
export async function countOportunidadesAbiertas(clinicaId: string): Promise<number> {
  const { count, error } = await supabase
    .from('oportunidades_citas')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .eq('estado', 'abierta');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Asigna el hueco a un candidato: re-verifica que siga libre (pudo ocuparse mientras tanto),
 * mueve la cita del candidato ahí (reagendarCita ya existente), le apaga acepta_adelanto (ya
 * se le cumplió el pedido — si quiere seguir en espera de algo aún más cercano se vuelve a
 * marcar a mano) y cierra la oportunidad como 'asignada'.
 */
export async function asignarOportunidad(
  oportunidadId: string,
  citaCandidataId: string,
  clinicaId: string,
  medicoId: string,
  nuevaFechaIso: string,
  duracionMin: number,
  resueltoPor: string,
): Promise<void> {
  const conflicto = await checkConflicto(clinicaId, medicoId, nuevaFechaIso, duracionMin, citaCandidataId);
  if (conflicto) {
    throw new Error(`Ese horario ya no está disponible (${conflicto.pacienteName}, ${conflicto.start}–${conflicto.end}).`);
  }
  await reagendarCita(citaCandidataId, nuevaFechaIso, duracionMin);

  const { error: e1 } = await supabase.from('citas').update({ acepta_adelanto: false }).eq('id', citaCandidataId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from('oportunidades_citas')
    .update({
      estado: 'asignada',
      cita_asignada_id: citaCandidataId,
      resuelta_en: new Date().toISOString(),
      resuelta_por: resueltoPor,
    })
    .eq('id', oportunidadId);
  if (e2) throw e2;
}

/** Se revisó y no se usó (nadie quiso el hueco, o se decidió no ofrecerlo). */
export async function descartarOportunidad(oportunidadId: string, resueltoPor: string): Promise<void> {
  const { error } = await supabase
    .from('oportunidades_citas')
    .update({ estado: 'descartada', resuelta_en: new Date().toISOString(), resuelta_por: resueltoPor })
    .eq('id', oportunidadId);
  if (error) throw error;
}

/** Activa/desactiva "avísenme si se libera algo antes" en una cita ya creada. */
export async function actualizarAdelanto(citaId: string, valor: boolean): Promise<void> {
  const { error } = await supabase.from('citas').update({ acepta_adelanto: valor }).eq('id', citaId);
  if (error) throw error;
}
