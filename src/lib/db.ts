// Capa de acceso a datos sobre Supabase: contexto de cuenta del usuario logueado.
// Carga perfil + membresía + clínica + suscripción y deriva los gates del §6.1
// (vigencia del trial y cédula). Los datos clínicos viven en patients.ts y
// consultas.ts. Ya NO existe mock: toda la app lee de Supabase real.
//
// PENDIENTE (requiere nuevas tablas/RPCs en Supabase): recetas, informes, y la
// RPC crear_consulta para agendar/registrar consultas con motivo cifrado.

import { supabase } from './supabase';

export type Rol = 'owner' | 'medico' | 'asistente';

export type AccentColor = 'teal' | 'blue' | 'indigo';
export type ThemeMode = 'light' | 'dark';

export interface Profile {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  onboarding_completed: boolean;
  accent_color: AccentColor;
  theme_mode: ThemeMode;
}

export interface Suscripcion {
  status: string; // trial | activa | cancelada | morosa (status_suscripcion)
  periodo_fin: string | null;
  gracia_hasta: string | null;
}

/**
 * Nivel de acceso derivado de la suscripción — reemplaza al booleano plano:
 * - 'total': vigente, o vencida pero dentro de las 72h de gracia.
 * - 'gracia': subconjunto de 'total' marcado aparte solo para mostrar el aviso
 *   (ver `enGracia` en AccountContext) — el acceso en sí sigue siendo total.
 * - 'limitado': gracia agotada o suscripción cancelada. La clínica sin NINGUNA
 *   fila en `suscripciones` no es 'limitado' — ver `TrialExpired` en App.tsx,
 *   ese caso se sigue bloqueando por completo aparte de este nivel.
 */
export type AccesoNivel = 'total' | 'limitado';

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
  /** Nivel de acceso real — ver AccesoNivel. Reemplaza al gate binario anterior. */
  accesoNivel: AccesoNivel;
  /** true si accesoNivel es 'total' solo gracias a la gracia de 72h post-vencimiento. */
  enGracia: boolean;
  /** Días restantes antes de que venza (solo con acceso total y sin estar ya en gracia) —
   *  para el aviso suave "tu trial/plan está por terminar". null si no aplica. */
  diasParaVencer: number | null;
  /** @deprecated usar accesoNivel !== 'limitado'. Se mantiene para no romper lecturas
   *  existentes; §6.1: trial/suscripción vencida → bloquear y mandar a comprar. */
  accesoVigente: boolean;
  /** §6.1: owner/médico sin cédula → permitir entrar pero bloquear consulta/receta. */
  puedeEmitirClinico: boolean;
  /** No todo profesional prescribe (psicólogos, nutriólogos…): toggle propio en
   *  medico_detalles.puede_prescribir, independiente de tener cédula o no. */
  puedePrescribir: boolean;
  /** Mismo patrón que puedePrescribir: no todo profesional toma signos vitales. */
  usaSignosVitales: boolean;
  /** Mismo patrón que puedePrescribir: no todo profesional solicita laboratorio. */
  usaLaboratorio: boolean;
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
    .select('id, nombre, apellido_paterno, apellido_materno, onboarding_completed, accent_color, theme_mode')
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

  // 3. Suscripción de la clínica (gate del trial, §6.1). Solo puede existir UNA fila
  //    por clínica: el INSERT del trial (onboarding) está limitado por RLS a una sola
  //    vez, y de ahí en adelante stripe-webhook solo hace UPDATE sobre esa misma fila
  //    — nunca hace falta ordenar/filtrar por status ni tomar la más reciente.
  let suscripcion: Suscripcion | null = null;
  if (clinicaId) {
    const { data: sus, error: susError } = await supabase
      .from('suscripciones')
      .select('status, periodo_fin, gracia_hasta')
      .eq('clinica_id', clinicaId)
      .maybeSingle<Suscripcion>();
    if (susError) throw susError;
    suscripcion = sus ?? null;
  }

  const hoy = new Date().toISOString().split('T')[0];
  const ahoraMs = Date.now();

  let accesoNivel: AccesoNivel = 'limitado';
  let enGracia = false;
  let diasParaVencer: number | null = null;

  if (suscripcion && suscripcion.status !== 'cancelada') {
    const vigente = !!suscripcion.periodo_fin && suscripcion.periodo_fin >= hoy;
    if (vigente) {
      accesoNivel = 'total';
      if (suscripcion.periodo_fin) {
        const msRestantes = new Date(`${suscripcion.periodo_fin}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime();
        diasParaVencer = Math.round(msRestantes / (24 * 60 * 60 * 1000));
      }
    } else {
      // Venció. Gracia explícita (morosa + gracia_hasta que puso el webhook) o, de
      // respaldo si el webhook todavía no corrió, 72h calculadas desde periodo_fin
      // — así la gracia siempre aplica, sin depender de que el webhook haya sido
      // puntual.
      const graciaExplicita = suscripcion.gracia_hasta ? new Date(suscripcion.gracia_hasta).getTime() : 0;
      const graciaRespaldo = suscripcion.periodo_fin
        ? new Date(`${suscripcion.periodo_fin}T00:00:00`).getTime() + 72 * 60 * 60 * 1000
        : 0;
      const limiteGracia = Math.max(graciaExplicita, graciaRespaldo);
      if (ahoraMs < limiteGracia) {
        accesoNivel = 'total';
        enGracia = true;
      }
    }
  }
  // Alias retrocompatible — ver el @deprecated en AccountContext.
  const accesoVigente = accesoNivel !== 'limitado';

  // 4. Gate de cédula (§6.1): solo aplica a owner/médico.
  //    Defensivo: el nombre exacto de la columna de cédula no está verificado en
  //    código, así que tratamos cualquier 'cedula*' no vacía como válida.
  //    Default en false (no en true): un 'asistente' nunca entra al if de abajo,
  //    así que si el default fuera true se quedaría con acceso clínico completo
  //    (Consulta/Receta/Informe/Laboratorio) sin haber tenido nunca cédula —
  //    justo lo opuesto de lo que implica ese rol.
  let puedeEmitirClinico = false;
  let puedePrescribir = false;
  let usaSignosVitales = false;
  let usaLaboratorio = false;
  if (rol === 'owner' || rol === 'medico') {
    const { data: medico } = await supabase
      .from('medico_detalles')
      .select('cedula_profesional, puede_prescribir, usa_signos_vitales, usa_laboratorio')
      .eq('profile_id', user.id)
      .maybeSingle<{
        cedula_profesional: string | null;
        puede_prescribir: boolean | null;
        usa_signos_vitales: boolean | null;
        usa_laboratorio: boolean | null;
      }>();
    puedeEmitirClinico = !!medico?.cedula_profesional;
    puedePrescribir = puedeEmitirClinico && (medico?.puede_prescribir ?? true);
    usaSignosVitales = puedeEmitirClinico && (medico?.usa_signos_vitales ?? true);
    usaLaboratorio = puedeEmitirClinico && (medico?.usa_laboratorio ?? true);
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
    accesoNivel,
    enGracia,
    diasParaVencer,
    accesoVigente,
    puedeEmitirClinico,
    puedePrescribir,
    usaSignosVitales,
    usaLaboratorio,
  };

  return { state: 'ok', account };
}
