// Servicio de acceso a datos de pacientes sobre Supabase.
// Todos los queries están acotados por clinica_id (multi-tenant).
// Los campos no existentes en el esquema actual se marcan con "—" en la UI.

import { supabase } from './supabase';
import type { SexoEnum, GrupoSanguineo } from './types';

// ── Paleta determinista por UUID ───────────────────────────────────────────────
const COLORS = [
  '#3F6375', '#7A5AE0', '#B3261E', '#1E6E52',
  '#8A5A00', '#6750A4', '#00696D', '#984061',
  '#006A60', '#C43E00', '#715573', '#2C6E49',
];
function patientColor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

function calcIniciales(nombre: string, apellido: string | null): string {
  return ((nombre.trim()[0] ?? '?') + (apellido?.trim()[0] ?? '')).toUpperCase();
}

function calcEdad(fechaNac: string | null): number | null {
  if (!fechaNac) return null;
  const hoy = new Date();
  const n = new Date(fechaNac);
  let age = hoy.getFullYear() - n.getFullYear();
  if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) age--;
  return age;
}

function nombreCompleto(nombre: string, ap: string | null, am: string | null): string {
  return [nombre, ap, am].filter(Boolean).join(' ');
}

// ── View models ───────────────────────────────────────────────────────────────

export interface PacienteUI {
  id: string;
  name: string;        // nombre completo
  initials: string;
  color: string;
  age: number | null;
  sex: SexoEnum | null;
  grupo_sanguineo: GrupoSanguineo | null;
  email: string | null;
  telefono: string | null;
  curp: string | null;
  conditions: string[];  // diagnósticos; vacío en la lista, poblado en detalle
  alergias: string[];
}

export interface VitalesUI {
  fc: number | null;          // lpm
  ta: string | null;          // "sistólica/diastólica"
  temp_c: number | null;      // °C
  peso_kg: number | null;
  talla_cm: number | null;
  imc: number | null;
  fecha: string;
}

export interface ConsultaResumen {
  id: string;
  fecha: string;               // ISO
  vitales: Omit<VitalesUI, 'imc' | 'ta'> & { ta_sistolica: number | null; ta_diastolica: number | null };
}

export interface PacienteDetalleUI extends PacienteUI {
  expedienteId: string | null;       // necesario para recetas/informes (RPCs)
  ultimos_vitales: VitalesUI | null;
  consultas: ConsultaResumen[];
  diagnosticos: { codigo: string; descripcion: string; es_principal: boolean }[];
}

/** Paciente para selectores: incluye expediente_id (recetas/informes lo requieren). */
export interface PacienteSelect {
  id: string;
  expediente_id: string | null;
  name: string;
  grupo_sanguineo: GrupoSanguineo | null;
}

export async function fetchPacientesSelect(clinicaId: string): Promise<PacienteSelect[]> {
  type Row = { id: string; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; grupo_sanguineo: string | null };
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre, apellido_paterno, apellido_materno, grupo_sanguineo')
    .eq('clinica_id', clinicaId)
    .order('nombre');
  if (error) throw error;

  // Expedientes en query DIRECTA (no embed): el embed pacientes→expedientes
  // devuelve vacío y dejaba expediente_id en null para todos los pacientes.
  const { data: exps, error: expError } = await supabase
    .from('expedientes')
    .select('id, paciente_id')
    .eq('clinica_id', clinicaId)
    .order('created_at');
  if (expError) throw expError;
  const expByPaciente = new Map<string, string>();
  for (const e of (exps as { id: string; paciente_id: string }[]) ?? []) {
    if (!expByPaciente.has(e.paciente_id)) expByPaciente.set(e.paciente_id, e.id);
  }

  return ((data as unknown as Row[]) ?? []).map((p) => ({
    id: p.id,
    expediente_id: expByPaciente.get(p.id) ?? null,
    name: nombreCompleto(p.nombre, p.apellido_paterno, p.apellido_materno),
    grupo_sanguineo: (p.grupo_sanguineo ?? null) as GrupoSanguineo | null,
  }));
}

/** Actualiza el grupo sanguíneo de un paciente (RLS pacientes_update: médico tratante u owner). */
export async function actualizarGrupoSanguineo(pacienteId: string, grupo: GrupoSanguineo | null): Promise<void> {
  const { error } = await supabase
    .from('pacientes')
    .update({ grupo_sanguineo: grupo })
    .eq('id', pacienteId);
  if (error) throw error;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Lista todos los pacientes de la clínica. */
export async function fetchPacientes(clinicaId: string): Promise<PacienteUI[]> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, grupo_sanguineo, telefono, email, curp')
    .eq('clinica_id', clinicaId)
    .order('apellido_paterno')
    .order('nombre');
  if (error) throw error;
  if (!data) return [];
  return data.map((p) => ({
    id: p.id,
    name: nombreCompleto(p.nombre, p.apellido_paterno, p.apellido_materno),
    initials: calcIniciales(p.nombre, p.apellido_paterno),
    color: patientColor(p.id),
    age: calcEdad(p.fecha_nacimiento),
    sex: p.sexo as SexoEnum | null,
    grupo_sanguineo: (p.grupo_sanguineo ?? null) as GrupoSanguineo | null,
    email: p.email,
    telefono: p.telefono,
    curp: p.curp,
    conditions: [],
    alergias: [],
  }));
}

/** Datos de alta de un paciente nuevo. */
export interface NuevoPaciente {
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  fecha_nacimiento?: string | null; // "YYYY-MM-DD"
  sexo?: SexoEnum | null;
  grupo_sanguineo?: GrupoSanguineo | null;
  telefono?: string | null;
  email?: string | null;
  curp?: string | null;
}

/**
 * Da de alta un paciente y crea su expediente vacío (antecedentes_enc se llenan
 * después vía RPC). `medicoId` es el médico tratante (perfil con cédula).
 * Devuelve el id del paciente creado.
 */
export async function createPaciente(
  clinicaId: string,
  medicoId: string,
  input: NuevoPaciente,
): Promise<string> {
  // 1. Paciente. .select() exige que la política SELECT de pacientes deje ver
  //    la fila recién creada (es_miembro(clinica_id) la cubre — la membresía ya existe).
  const { data: pac, error } = await supabase
    .from('pacientes')
    .insert({
      clinica_id: clinicaId,
      medico_id: medicoId,
      nombre: input.nombre.trim(),
      apellido_paterno: input.apellido_paterno?.trim() || null,
      apellido_materno: input.apellido_materno?.trim() || null,
      fecha_nacimiento: input.fecha_nacimiento || null,
      sexo: input.sexo || null,
      grupo_sanguineo: input.grupo_sanguineo || null,
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      curp: input.curp?.trim() || null,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw error;

  // 2. Expediente vacío (1 por paciente). Sin antecedentes aún → insert plano.
  const { error: expError } = await supabase
    .from('expedientes')
    .insert({ paciente_id: pac.id, clinica_id: clinicaId });
  if (expError) throw expError;

  return pac.id;
}

/**
 * Devuelve el expediente_id del paciente; si no existe (datos legacy o el embed
 * no lo trajo), lo crea. Evita el falso "el paciente no tiene expediente válido".
 */
export async function getOrCreateExpediente(pacienteId: string, clinicaId: string): Promise<string> {
  const { data, error } = await supabase
    .from('expedientes')
    .select('id')
    .eq('paciente_id', pacienteId)
    .eq('clinica_id', clinicaId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (data?.id) return data.id;

  const { data: creado, error: insError } = await supabase
    .from('expedientes')
    .insert({ paciente_id: pacienteId, clinica_id: clinicaId })
    .select('id')
    .single<{ id: string }>();
  if (insError) throw insError;
  return creado.id;
}

/** Cuenta pacientes de la clínica (sin descargar filas). */
export async function countPacientes(clinicaId: string): Promise<number> {
  const { count, error } = await supabase
    .from('pacientes')
    .select('*', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Detalle completo de un paciente: info base + alérgias + vitales de la última
 * consulta + historial de consultas + diagnósticos de las últimas consultas.
 */
export async function fetchPacienteDetalle(
  pacienteId: string,
  clinicaId: string,
): Promise<PacienteDetalleUI | null> {
  // 1. Paciente + expediente + alergias (en 1 query anidado)
  type PacienteRow = {
    id: string; nombre: string; apellido_paterno: string | null;
    apellido_materno: string | null; fecha_nacimiento: string | null;
    sexo: string | null; grupo_sanguineo: string | null; telefono: string | null; email: string | null; curp: string | null;
  };
  const { data: pac, error: pacError } = await supabase
    .from('pacientes')
    .select(`
      id, nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, grupo_sanguineo, telefono, email, curp
    `)
    .eq('id', pacienteId)
    .eq('clinica_id', clinicaId)
    .maybeSingle<PacienteRow>();
  if (pacError) throw pacError;
  if (!pac) return null;

  // El expediente se carga con query DIRECTA, no como embed anidado dentro de
  // `pacientes`: el embed pacientes→expedientes devolvía vacío y dejaba el
  // expedienteId en null (Historial/Resumen no cargaban). La query directa es el
  // mismo patrón que usa getOrCreateExpediente y sí respeta la RLS del usuario.
  const { data: expediente, error: expError } = await supabase
    .from('expedientes')
    .select('id, expediente_alergias(alergia)')
    .eq('paciente_id', pacienteId)
    .eq('clinica_id', clinicaId)
    .order('created_at')
    .limit(1)
    .maybeSingle<{ id: string; expediente_alergias: Array<{ alergia: string }> }>();
  if (expError) throw expError;
  const alergias = expediente?.expediente_alergias?.map((a) => a.alergia) ?? [];

  // 2. Últimas consultas + diagnósticos (en 1 query anidado)
  type ConsultaRow = {
    id: string; fecha: string; peso_kg: number | null; talla_cm: number | null;
    ta_sistolica: number | null; ta_diastolica: number | null; fc: number | null; temp_c: number | null;
    consulta_diagnosticos: Array<{ cie10_codigo: string; es_principal: boolean; cie10: { descripcion: string } | null }>;
  };
  let consultas: ConsultaRow[] = [];
  if (expediente) {
    const { data: cRows, error: cError } = await supabase
      .from('consultas')
      .select(`
        id, fecha, peso_kg, talla_cm, ta_sistolica, ta_diastolica, fc, temp_c,
        consulta_diagnosticos(cie10_codigo, es_principal, cie10(descripcion))
      `)
      .eq('expediente_id', expediente.id)
      .eq('clinica_id', clinicaId)
      .order('fecha', { ascending: false })
      .limit(10);
    if (cError) throw cError;
    consultas = (cRows as unknown as ConsultaRow[]) ?? [];
  }

  // Vitales de la última consulta
  const ultima = consultas[0] ?? null;
  const ultimos_vitales: VitalesUI | null = ultima
    ? {
        fc: ultima.fc,
        ta: ultima.ta_sistolica != null && ultima.ta_diastolica != null
          ? `${ultima.ta_sistolica}/${ultima.ta_diastolica}`
          : null,
        temp_c: ultima.temp_c,
        peso_kg: ultima.peso_kg,
        talla_cm: ultima.talla_cm,
        imc: ultima.peso_kg && ultima.talla_cm
          ? Math.round((ultima.peso_kg / ((ultima.talla_cm / 100) ** 2)) * 10) / 10
          : null,
        fecha: ultima.fecha,
      }
    : null;

  // Diagnósticos únicos (de las últimas 5 consultas, principales primero)
  const seen = new Set<string>();
  const diagnosticos: { codigo: string; descripcion: string; es_principal: boolean }[] = [];
  for (const c of consultas.slice(0, 5)) {
    for (const d of c.consulta_diagnosticos ?? []) {
      if (!seen.has(d.cie10_codigo)) {
        seen.add(d.cie10_codigo);
        diagnosticos.push({
          codigo: d.cie10_codigo,
          descripcion: d.cie10?.descripcion ?? d.cie10_codigo,
          es_principal: d.es_principal,
        });
      }
    }
  }
  diagnosticos.sort((a, b) => (b.es_principal ? 1 : 0) - (a.es_principal ? 1 : 0));

  return {
    id: pac.id,
    expedienteId: expediente?.id ?? null,
    name: nombreCompleto(pac.nombre, pac.apellido_paterno, pac.apellido_materno),
    initials: calcIniciales(pac.nombre, pac.apellido_paterno),
    color: patientColor(pac.id),
    age: calcEdad(pac.fecha_nacimiento),
    sex: pac.sexo as SexoEnum | null,
    grupo_sanguineo: (pac.grupo_sanguineo ?? null) as GrupoSanguineo | null,
    email: pac.email,
    telefono: pac.telefono,
    curp: pac.curp,
    alergias,
    conditions: diagnosticos.filter((d) => d.es_principal).map((d) => d.descripcion),
    ultimos_vitales,
    diagnosticos,
    consultas: consultas.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      vitales: { fc: c.fc, ta_sistolica: c.ta_sistolica, ta_diastolica: c.ta_diastolica, peso_kg: c.peso_kg, talla_cm: c.talla_cm, temp_c: c.temp_c, fecha: c.fecha },
    })),
  };
}
