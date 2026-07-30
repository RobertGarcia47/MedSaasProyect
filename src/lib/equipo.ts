// Servicio de equipo: roster de la clínica, invitaciones (alta de asistentes/médicos
// adicionales) y los pickers de "¿para qué médico?" que necesitan Nuevo paciente/Agendar
// cita ahora que cualquier miembro activo (no solo quien tiene cédula) puede crearlos —
// aunque un asistente solo puede hacerlo para el/los médico(s) a los que está asignado
// (medico_asistentes, tabla ya existente en el schema base; ver
// sql/2026-07-24_medico_asistentes_asignacion.sql).
//
// El alta real de un miembro pasa SIEMPRE por la RPC aceptar_invitacion (SECURITY DEFINER,
// sql/2026-07-24_equipo_invitaciones.sql) — no hay INSERT client-side a clinica_miembros.

import { supabase } from './supabase';

export type RolEquipo = 'owner' | 'medico' | 'asistente';
export type RolInvitacion = 'medico' | 'asistente';

export interface MiembroUI {
  profileId: string;
  nombre: string;
  rol: RolEquipo;
  activo: boolean;
  createdAt: string;
}

interface MiembroRow {
  profile_id: string;
  rol: RolEquipo;
  activo: boolean;
  created_at: string;
  profiles: { nombre: string | null; apellido_paterno: string | null; apellido_materno: string | null } | null;
}

function nombreCompleto(p: MiembroRow['profiles']): string {
  return [p?.nombre, p?.apellido_paterno, p?.apellido_materno].filter(Boolean).join(' ').trim() || '—';
}

/** Roster completo de la clínica (todos los roles, activos e inactivos). */
export async function fetchMiembros(clinicaId: string): Promise<MiembroUI[]> {
  const { data, error } = await supabase
    .from('clinica_miembros')
    .select('profile_id, rol, activo, created_at, profiles!profile_id(nombre, apellido_paterno, apellido_materno)')
    .eq('clinica_id', clinicaId)
    .order('created_at');
  if (error) throw error;
  return (data as unknown as MiembroRow[]).map((r) => ({
    profileId: r.profile_id,
    nombre: nombreCompleto(r.profiles),
    rol: r.rol,
    activo: r.activo,
    createdAt: r.created_at,
  }));
}

/** Da de baja / reactiva a un miembro (owner-only, RLS lo refuerza). */
export async function setMiembroActivo(clinicaId: string, profileId: string, activo: boolean): Promise<void> {
  const { error } = await supabase
    .from('clinica_miembros')
    .update({ activo })
    .eq('clinica_id', clinicaId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

export interface InvitacionUI {
  id: string;
  email: string;
  rol: RolInvitacion;
  codigo: string;
  expiraEn: string;
}

/** Invitaciones pendientes (aún no aceptadas ni vencidas) de la clínica. */
export async function fetchInvitacionesPendientes(clinicaId: string): Promise<InvitacionUI[]> {
  const { data, error } = await supabase
    .from('invitaciones_equipo')
    .select('id, email, rol, codigo, expira_en')
    .eq('clinica_id', clinicaId)
    .eq('estado', 'pendiente')
    .gt('expira_en', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, email: r.email, rol: r.rol, codigo: r.codigo, expiraEn: r.expira_en }));
}

/**
 * Crea una invitación y devuelve su código (para armar el link a compartir).
 * `medicoAsignadoId` solo aplica para rol='asistente' — a qué médico queda
 * asignado (medico_asistentes) al aceptar; determina qué pacientes/citas
 * podrá crear y ver. Un médico invitado no necesita asignación.
 */
export async function crearInvitacion(clinicaId: string, rol: RolInvitacion, email: string, medicoAsignadoId?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('crear_invitacion', {
    p_clinica_id: clinicaId,
    p_rol: rol,
    p_email: email,
    p_medico_asignado_id: medicoAsignadoId ?? null,
  });
  if (error) throw error;
  return (data as { codigo: string }).codigo;
}

export async function revocarInvitacion(invitacionId: string): Promise<void> {
  const { error } = await supabase.rpc('revocar_invitacion', { p_invitacion_id: invitacionId });
  if (error) throw error;
}

export interface InvitacionPreview {
  clinicaNombre: string;
  rol: RolInvitacion;
  email: string;
}

/** Vista previa pública de una invitación por código (antes de crear cuenta). */
export async function previsualizarInvitacion(codigo: string): Promise<InvitacionPreview | null> {
  const { data, error } = await supabase.rpc('previsualizar_invitacion', { p_codigo: codigo });
  if (error) throw error;
  const row = (data as { clinica_nombre: string; rol: RolInvitacion; email: string }[] | null)?.[0];
  if (!row) return null;
  return { clinicaNombre: row.clinica_nombre, rol: row.rol, email: row.email };
}

/** Acepta la invitación para la sesión YA autenticada (justo después del signUp). */
export async function aceptarInvitacion(codigo: string, nombre: string): Promise<void> {
  const { error } = await supabase.rpc('aceptar_invitacion', { p_codigo: codigo, p_nombre: nombre });
  if (error) throw error;
}

export interface MedicoOption {
  profileId: string;
  nombre: string;
}

/**
 * Médicos con cédula activos en la clínica — para el picker "¿para qué médico?".
 * Dos queries en vez de un embed: clinica_miembros y medico_detalles no tienen FK
 * directa entre sí (ambas cuelgan de profiles por separado), PostgREST no puede
 * unirlas en un solo .select() anidado.
 */
export async function fetchMedicosClinica(clinicaId: string): Promise<MedicoOption[]> {
  const { data: miembros, error: e1 } = await supabase
    .from('clinica_miembros')
    .select('profile_id, profiles!profile_id(nombre, apellido_paterno, apellido_materno)')
    .eq('clinica_id', clinicaId)
    .eq('activo', true)
    .in('rol', ['owner', 'medico']);
  if (e1) throw e1;

  type Row = { profile_id: string; profiles: MiembroRow['profiles'] };
  const rows = (miembros ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const { data: detalles, error: e2 } = await supabase
    .from('medico_detalles')
    .select('profile_id, cedula_profesional')
    .in('profile_id', rows.map((r) => r.profile_id));
  if (e2) throw e2;

  const conCedula = new Set(
    (detalles ?? []).filter((d) => !!d.cedula_profesional).map((d) => d.profile_id),
  );
  return rows
    .filter((r) => conCedula.has(r.profile_id))
    .map((r) => ({ profileId: r.profile_id, nombre: nombreCompleto(r.profiles) }));
}

/**
 * Médicos a los que un asistente concreto está asignado (medico_asistentes) —
 * la RLS de pacientes/citas/consultas/expedientes solo deja crear o ver datos
 * de ESOS médicos, no de cualquiera en la clínica, así que el picker de un
 * asistente debe mostrar solo estas opciones (mostrar más sería confuso: se
 * vería la opción pero el guardado fallaría por RLS).
 */
export async function fetchMedicosAsignados(clinicaId: string, asistenteId: string): Promise<MedicoOption[]> {
  const { data, error } = await supabase
    .from('medico_asistentes')
    .select('medico_id, profiles!medico_id(nombre, apellido_paterno, apellido_materno)')
    .eq('clinica_id', clinicaId)
    .eq('asistente_id', asistenteId);
  if (error) throw error;
  type Row = { medico_id: string; profiles: MiembroRow['profiles'] };
  return (data as unknown as Row[]).map((r) => ({ profileId: r.medico_id, nombre: nombreCompleto(r.profiles) }));
}
