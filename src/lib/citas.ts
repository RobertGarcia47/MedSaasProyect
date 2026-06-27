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

// ── Tipo de cita codificado en el campo motivo como "[tipo] texto" ────────────
function decodeTipoCita(motivo: string | null): string {
  if (!motivo) return 'Consulta';
  const m = motivo.match(/^\[(consulta|seguimiento|urgencia|revision)\]/i);
  if (!m) return 'Consulta';
  const t = m[1].toLowerCase();
  const map: Record<string, string> = { consulta: 'Consulta', seguimiento: 'Seguimiento', urgencia: 'Urgencia', revision: 'Revision' };
  return map[t] ?? 'Consulta';
}
function decodeMotivoCita(motivo: string | null): string {
  if (!motivo) return 'Cita';
  return motivo.replace(/^\[(consulta|seguimiento|urgencia|revision)\]\s*/i, '') || 'Cita';
}
export function encodeMotivoConTipo(tipo: string, motivo: string): string {
  const t = tipo.toLowerCase();
  return t !== 'consulta' ? `[${t}] ${motivo}`.trim() : motivo;
}

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
      type: decodeTipoCita(c.motivo) as ApptUI['type'],
      reason: decodeMotivoCita(c.motivo),
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

/** Citas del mes completo (año/mes en números, month = 0-based). */
export async function fetchCitasMes(clinicaId: string, year: number, month: number): Promise<ApptUI[]> {
  const desde = new Date(year, month, 1); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(year, month + 1, 0); hasta.setHours(23, 59, 59, 999);
  return queryCitas(clinicaId, desde.toISOString(), hasta.toISOString());
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

// ── Chequeo de conflicto de horario ───────────────────────────────────────────
export interface ConflictoInfo {
  pacienteName: string;
  start: string; // HH:MM
  end: string;   // HH:MM
}

export async function checkConflicto(
  clinicaId: string,
  medicoId: string,
  fechaIso: string,   // ISO timestamp del inicio de la nueva cita
  duracionMin: number,
  excludeId?: string, // id de la cita a ignorar (reagendar)
): Promise<ConflictoInfo | null> {
  const inicio  = new Date(fechaIso);
  const fin     = new Date(inicio.getTime() + duracionMin * 60_000);
  const dayStart = new Date(inicio); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(inicio); dayEnd.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('citas')
    .select('id, fecha, duracion_min, estado, paciente_id, pacientes(nombre, apellido_paterno)')
    .eq('clinica_id', clinicaId)
    .eq('medico_id', medicoId)
    .neq('estado', 'cancelada')
    .gte('fecha', dayStart.toISOString())
    .lte('fecha', dayEnd.toISOString());

  if (error || !data) return null;

  for (const c of data as any[]) {
    if (excludeId && c.id === excludeId) continue;
    const cStart = new Date(c.fecha).getTime();
    const cEnd   = cStart + (c.duracion_min ?? 30) * 60_000;
    // Traslape: los intervalos se superponen si inicio < cEnd && fin > cStart
    if (inicio.getTime() < cEnd && fin.getTime() > cStart) {
      const pac  = c.pacientes ?? {};
      const name = [pac.nombre, pac.apellido_paterno].filter(Boolean).join(' ') || 'otro paciente';
      return {
        pacienteName: name,
        start: hhmm(c.fecha),
        end:   hhmm(new Date(cEnd).toISOString()),
      };
    }
  }
  return null;
}

export async function cancelarCita(citaId: string): Promise<void> {
  const { error } = await supabase.from('citas').update({ estado: 'cancelada' }).eq('id', citaId);
  if (error) throw error;
}

export async function reagendarCita(citaId: string, nuevaFecha: string, duracionMin: number): Promise<void> {
  const { error } = await supabase.from('citas').update({ fecha: nuevaFecha, duracion_min: duracionMin }).eq('id', citaId);
  if (error) throw error;
}
