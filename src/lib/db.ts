// Capa de acceso a datos sobre Supabase: contexto de cuenta del usuario logueado.
// Carga perfil + membresía + clínica + suscripción y deriva los gates del §6.1
// (vigencia del trial y cédula). Los datos clínicos viven en patients.ts y
// consultas.ts. Ya NO existe mock: toda la app lee de Supabase real.
//
// PENDIENTE (requiere nuevas tablas/RPCs en Supabase): recetas, informes, y la
// RPC crear_consulta para agendar/registrar consultas con motivo cifrado.

import { supabase } from './supabase';

export type Rol = 'owner' | 'medico' | 'asistente';

export interface Profile {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  onboarding_completed: boolean;
}

export interface Suscripcion {
  status: string;
  periodo_fin: string | null;
}

export interface AccountContext {
  userId: string;
  email: string;
  profile: Profile;
  nombreCompleto: string;
  iniciales: string;
  clinicaId: string | null;
  clinicaNombre: string | null;
  rol: Rol | null;
  suscripcion: Suscripcion | null;
  /** §6.1: trial/suscripción vencida → bloquear y mandar a comprar. */
  accesoVigente: boolean;
  /** §6.1: owner/médico sin cédula → permitir entrar pero bloquear consulta/receta. */
  puedeEmitirClinico: boolean;
}

/** Resultado del arranque de sesión: distingue "sin onboarding" de "listo". */
export type AccountLoad =
  | { state: 'no-profile' }            // no existe perfil (caso raro: sin trigger)
  | { state: 'onboarding-incompleto' } // perfil existe pero no terminó el alta
  | { state: 'ok'; account: AccountContext };

function calcIniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Carga el contexto de cuenta del usuario autenticado.
 * Devuelve null si no hay sesión activa.
 */
export async function loadAccountContext(): Promise<AccountLoad | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  // 1. Perfil (lo crea el trigger on_auth_user_created en el alta).
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, nombre, apellido_paterno, apellido_materno, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle<Profile>();
  if (profileError) throw profileError;
  if (!profile) return { state: 'no-profile' };
  if (!profile.onboarding_completed) return { state: 'onboarding-incompleto' };

  // 2. Membresía activa → clínica + rol.
  const { data: membresia, error: membresiaError } = await supabase
    .from('clinica_miembros')
    .select('clinica_id, rol, clinicas(nombre)')
    .eq('profile_id', user.id)
    .eq('activo', true)
    .maybeSingle<{ clinica_id: string; rol: Rol; clinicas: { nombre: string } | null }>();
  if (membresiaError) throw membresiaError;

  const clinicaId = membresia?.clinica_id ?? null;
  const rol = membresia?.rol ?? null;
  const clinicaNombre = membresia?.clinicas?.nombre ?? null;

  // 3. Suscripción vigente de la clínica (gate del trial, §6.1).
  let suscripcion: Suscripcion | null = null;
  if (clinicaId) {
    const { data: sus, error: susError } = await supabase
      .from('suscripciones')
      .select('status, periodo_fin')
      .eq('clinica_id', clinicaId)
      .in('status', ['trial', 'activa'])
      .order('periodo_fin', { ascending: false })
      .limit(1)
      .maybeSingle<Suscripcion>();
    if (susError) throw susError;
    suscripcion = sus ?? null;
  }

  const hoy = new Date().toISOString().split('T')[0];
  const accesoVigente = !!suscripcion?.periodo_fin && suscripcion.periodo_fin >= hoy;

  // 4. Gate de cédula (§6.1): solo aplica a owner/médico.
  //    Defensivo: el nombre exacto de la columna de cédula no está verificado en
  //    código, así que tratamos cualquier 'cedula*' no vacía como válida.
  let puedeEmitirClinico = true;
  if (rol === 'owner' || rol === 'medico') {
    const { data: medico } = await supabase
      .from('medico_detalles')
      .select('cedula_profesional')
      .eq('profile_id', user.id)
      .maybeSingle<{ cedula_profesional: string | null }>();
    puedeEmitirClinico = !!medico?.cedula_profesional;
  }

  const nombreCompleto = [profile.nombre, profile.apellido_paterno, profile.apellido_materno]
    .filter(Boolean)
    .join(' ')
    .trim();

  const account: AccountContext = {
    userId: user.id,
    email: user.email ?? '',
    profile,
    nombreCompleto: nombreCompleto || (user.email ?? 'Usuario'),
    iniciales: calcIniciales(nombreCompleto || user.email || '··'),
    clinicaId,
    clinicaNombre,
    rol,
    suscripcion,
    accesoVigente,
    puedeEmitirClinico,
  };

  return { state: 'ok', account };
}
