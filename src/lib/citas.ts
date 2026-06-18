// Servicio de citas (agenda). La tabla `citas` es plana (sin cifrado), acceso
// directo del cliente. Produce el mismo ApptUI que consultas.ts para que
// Calendar/Dashboard la consuman sin cambios de UI.

import { supabase } from './supabase';
import type { ApptUI } from './consultas';

export type EstadoCita =
  | 'programada' | 'confirmada' | 'sala_espera' | 'en_curso'
  | 'completada' | 'cancelada' | 'no_asistio';

// ── Helpers ───────────────────────────────────────────────────────────────────
const COLORS = ['#3F6375', '#7A5AE0', '#B3261E', '#1E6E52', '#8A5A00', '#6750A4', '#00696D', '#984061'];
function colorById(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}
function iniciales(nombre: string, ap: string | null): string {
  return ((nombre[0] ?? '?') + (ap?.[0] ?? '')).toUpperCase();
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function addMin(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}

const ESTADO_TO_STATUS: Record<EstadoCita, ApptUI['status']> = {
  programada:  'pendiente',
  confirmada:  'confirmada',
  sala_espera: 'sala-espera',
  en_curso:    'en-curso',
  completada:  'completada',
  cancelada:   'cancelada',
  no_asistio:  'cancelada',
};

// ── Row anidado de Supabase ───────────────────────────────────────────────────
type CitaRow = {
  id: string;
  fecha: string;
  duracion_min: number;
  estado: EstadoCita;
  motivo: string | null;
  paciente_id: string;
  pacientes: { id: string; nombre: string; apellido_paterno: string | null } | null;
};

async function queryCitas(clinicaId: string, desde: string, hasta: string): Promise<ApptUI[]> {
  const { data, error } = await supabase
    .from('citas')
    .select(`
      id, fecha, duracion_min, estado, motivo, paciente_id,
      pacientes(id, nombre, apellido_paterno)
    `)
    .eq('clinica_id', clinicaId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha');
  if (error) throw error;
  const rows = (data as unknown as CitaRow[]) ?? [];

  return rows.map((c) => {
    const pac = c.pacientes ?? null;
    const name = pac ? [pac.nombre, pac.apellido_paterno].filter(Boolean).join(' ') : 'Paciente';
    const pacId = pac?.id ?? c.paciente_id;
    return {
      id: c.id,
      pacienteId: pacId,
      pacienteName: name,
      pacienteInitials: iniciales(pac?.nombre ?? '?', pac?.apellido_paterno ?? null),
      pacienteColor: colorById(pacId),
      date: c.fecha.slice(0, 10),
      start: hhmm(c.fecha),
      end: hhmm(addMin(c.fecha, c.duracion_min || 30)),
      type: 'Consulta',
      reason: c.motivo || 'Cita',
      status: ESTADO_TO_STATUS[c.estado] ?? 'pendiente',
      room: 'Consultorio',
    };
  });
}

/** Citas de un día concreto (Date en hora local). */
export async function fetchCitasDia(clinicaId: string, dia: Date): Promise<ApptUI[]> {
  const base = new Date(dia); base.setHours(0, 0, 0, 0);
  const fin = new Date(dia);  fin.setHours(23, 59, 59, 999);
  return queryCitas(clinicaId, base.toISOString(), fin.toISOString());
}

/** Citas de la semana (lunes–domingo) de un día dado. */
export async function fetchCitasSemana(clinicaId: string, diaDeLaSemana: Date): Promise<ApptUI[]> {
  const d = new Date(diaDeLaSemana);
  const dow = d.getDay();
  const diffLunes = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(d); lunes.setDate(d.getDate() + diffLunes); lunes.setHours(0, 0, 0, 0);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6); domingo.setHours(23, 59, 59, 999);
  return queryCitas(clinicaId, lunes.toISOString(), domingo.toISOString());
}

/** Cuenta citas en un rango. */
export async function countCitas(clinicaId: string, desde: Date, hasta: Date): Promise<number> {
  const { count, error } = await supabase
    .from('citas')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .gte('fecha', desde.toISOString())
    .lte('fecha', hasta.toISOString());
  if (error) throw error;
  return count ?? 0;
}

// ── Alta de cita ───────────────────────────────────────────────────────────────
export interface NuevaCita {
  paciente_id: string;
  fecha: string;          // ISO (timestamptz)
  duracion_min?: number;
  motivo?: string | null;
  estado?: EstadoCita;
}

export async function createCita(
  clinicaId: string,
  medicoId: string,
  input: NuevaCita,
): Promise<string> {
  const { data, error } = await supabase
    .from('citas')
    .insert({
      clinica_id: clinicaId,
      medico_id: medicoId,
      paciente_id: input.paciente_id,
      fecha: input.fecha,
      duracion_min: input.duracion_min ?? 30,
      motivo: input.motivo?.trim() || null,
      estado: input.estado ?? 'programada',
      created_by: medicoId,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}
