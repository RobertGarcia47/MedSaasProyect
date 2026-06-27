// Servicio de consultas para el calendario y el dashboard.
// `consultas.fecha` es timestamp → las filtramos por rango ISO para abarcar la zona horaria local.

import { supabase } from './supabase';

// ── Tipo de cita para la UI del calendario ────────────────────────────────────
export interface ApptUI {
  id: string;
  pacienteId: string;
  pacienteName: string;
  pacienteInitials: string;
  pacienteColor: string;
  date: string;   // "YYYY-MM-DD"
  start: string;  // "HH:MM"
  end: string;    // "HH:MM" (fecha + 30 min asumidos — no hay duración en schema)
  type: 'Consulta' | 'Seguimiento' | 'Urgencia' | 'Revision';
  reason: string;  // motivo_enc es bytea → placeholder hasta tener RPCs
  status: 'en-curso' | 'pendiente' | 'completada' | 'confirmada' | 'sala-espera' | 'cancelada';
  room: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const COLORS = [
  '#3F6375', '#7A5AE0', '#B3261E', '#1E6E52',
  '#8A5A00', '#6750A4', '#00696D', '#984061',
];
function colorById(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}
function initiales(nombre: string, ap: string | null): string {
  return ((nombre[0] ?? '?') + (ap?.[0] ?? '')).toUpperCase();
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function addMinutes(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}
function calcStatus(fecha: string): ApptUI['status'] {
  const consulta = new Date(fecha).getTime();
  const now = Date.now();
  if (consulta < now - 30 * 60000) return 'completada';
  if (consulta <= now + 5 * 60000) return 'en-curso';
  return 'pendiente';
}

// ── Tipo del row anidado de Supabase ─────────────────────────────────────────
type ConsultaRow = {
  id: string;
  fecha: string;
  expedientes: {
    id: string;
    pacientes: {
      id: string;
      nombre: string;
      apellido_paterno: string | null;
    } | null;
  } | null;
};

async function queryConsultas(clinicaId: string, desde: string, hasta: string): Promise<ApptUI[]> {
  const { data, error } = await supabase
    .from('consultas')
    .select(`
      id, fecha,
      expedientes(id,
        pacientes(id, nombre, apellido_paterno)
      )
    `)
    .eq('clinica_id', clinicaId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha');
  if (error) throw error;
  const rows = (data as unknown as ConsultaRow[]) ?? [];

  return rows.map((c) => {
    const pac = c.expedientes?.pacientes ?? null;
    const name = pac ? [pac.nombre, pac.apellido_paterno].filter(Boolean).join(' ') : 'Paciente';
    const pacId = pac?.id ?? c.id;
    return {
      id: c.id,
      pacienteId: pacId,
      pacienteName: name,
      pacienteInitials: initiales(pac?.nombre ?? '?', pac?.apellido_paterno ?? null),
      pacienteColor: colorById(pacId),
      date: c.fecha.slice(0, 10),
      start: hhmm(c.fecha),
      end: hhmm(addMinutes(c.fecha, 30)),
      type: 'Consulta',
      reason: 'Consulta médica',  // motivo_enc cifrado — placeholder hasta RPCs
      status: calcStatus(c.fecha),
      room: 'Consultorio',
    };
  });
}

/** Consultas de un día concreto (Date en hora local). */
export async function fetchConsultasDia(clinicaId: string, dia: Date): Promise<ApptUI[]> {
  const base = new Date(dia);
  base.setHours(0, 0, 0, 0);
  const fin = new Date(dia);
  fin.setHours(23, 59, 59, 999);
  return queryConsultas(clinicaId, base.toISOString(), fin.toISOString());
}

/** Consultas de una semana (lunes–domingo) dado un día dentro de esa semana. */
export async function fetchConsultasSemana(clinicaId: string, diaDeLaSemana: Date): Promise<ApptUI[]> {
  const d = new Date(diaDeLaSemana);
  const dow = d.getDay(); // 0=Dom
  const diffLunes = dow === 0 ? -6 : 1 - dow;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);
  return queryConsultas(clinicaId, lunes.toISOString(), domingo.toISOString());
}

/** Cuenta consultas para un rango dado. */
export async function countConsultas(clinicaId: string, desde: Date, hasta: Date): Promise<number> {
  const { count, error } = await supabase
    .from('consultas')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .gte('fecha', desde.toISOString())
    .lte('fecha', hasta.toISOString());
  if (error) throw error;
  return count ?? 0;
}

// ── Consulta clínica (encuentro SOAP / NOM-004) ──────────────────────────────────

export interface VitalesInput {
  peso_kg?: number | null;
  talla_cm?: number | null;
  ta_sistolica?: number | null;
  ta_diastolica?: number | null;
  fc?: number | null;
  temp_c?: number | null;
  fr?: number | null;
  spo2?: number | null;
  glucosa?: number | null;
  perimetro_abdominal_cm?: number | null;
  grasa_corporal_pct?: number | null;
}

export interface DiagnosticoInput {
  codigo: string;        // cie10_codigo
  es_principal: boolean;
}

export interface NuevaConsulta {
  motivo?: string | null;      // S — motivo de consulta
  notas?: string | null;       // O/A/P — narrativa compuesta (exploración/análisis/plan)
  vitales: VitalesInput;       // O — signos vitales
  diagnosticos: DiagnosticoInput[]; // A — CIE-10
}

/**
 * Registra una consulta vía RPC crear_consulta (cifra motivo/notas) y luego
 * inserta los diagnósticos CIE-10 en consulta_diagnosticos (tabla estructurada).
 * `fecha` la pone la base con DEFAULT now() (es el momento del encuentro).
 */
export async function crearConsulta(
  clinicaId: string,
  expedienteId: string,
  input: NuevaConsulta,
): Promise<string> {
  const { data, error } = await supabase.rpc('crear_consulta', {
    p_expediente_id:       expedienteId,
    p_motivo:              input.motivo ?? null,
    p_notas:               input.notas ?? null,
    p_peso:                input.vitales.peso_kg ?? null,
    p_talla:               input.vitales.talla_cm ?? null,
    p_ta_sis:              input.vitales.ta_sistolica ?? null,
    p_ta_dia:              input.vitales.ta_diastolica ?? null,
    p_fc:                  input.vitales.fc ?? null,
    p_temp:                input.vitales.temp_c ?? null,
    p_fr:                  input.vitales.fr ?? null,
    p_spo2:                input.vitales.spo2 ?? null,
    p_glucosa:             input.vitales.glucosa ?? null,
    p_perimetro_abdominal: input.vitales.perimetro_abdominal_cm ?? null,
    p_grasa_corporal_pct:  input.vitales.grasa_corporal_pct ?? null,
  });
  if (error) throw error;
  const consultaId = data as string;

  const dx = input.diagnosticos.filter((d) => d.codigo);
  if (dx.length) {
    const { error: dxError } = await supabase
      .from('consulta_diagnosticos')
      .insert(dx.map((d) => ({
        consulta_id: consultaId,
        clinica_id: clinicaId,
        cie10_codigo: d.codigo,
        es_principal: d.es_principal,
      })));
    if (dxError) throw dxError;
  }
  return consultaId;
}

export interface ConsultaDetalleUI {
  id: string;
  fecha: string;
  medico_id: string;
  peso_kg: number | null;
  talla_cm: number | null;
  ta_sistolica: number | null;
  ta_diastolica: number | null;
  fc: number | null;
  temp_c: number | null;
  fr: number | null;
  spo2: number | null;
  glucosa: number | null;
  perimetro_abdominal_cm: number | null;
  grasa_corporal_pct: number | null;
  motivo: string | null;
  notas: string | null;
}

/** Historial de consultas con narrativa descifrada (RPC obtener_consultas). */
export async function obtenerConsultas(expedienteId: string): Promise<ConsultaDetalleUI[]> {
  const { data, error } = await supabase.rpc('obtener_consultas', { p_expediente_id: expedienteId });
  if (error) throw error;
  return (data ?? []) as ConsultaDetalleUI[];
}
