// Funciones de IA (Claude) de MedSaaS. La API key NUNCA vive en el navegador: todo pasa por Edge
// Functions de Supabase que arman el contexto con la sesión del usuario (RLS) y llaman al modelo.
// Antes de cada llamada la función comprueba en la base que la clínica haya activado la IA.

import { supabase } from './supabase';

// ── Consentimiento de la clínica ──────────────────────────────────────────────

/** Versión del texto de consentimiento que acepta el propietario (se guarda en la base con la fecha).
 *  Si cambia el texto de TEXTO_CONSENTIMIENTO, sube esta versión. */
export const IA_CONSENT_VERSION = '2026-11-17';

export interface EstadoIA {
  habilitada: boolean;
  consentimiento_version: string | null;
  consentimiento_at: string | null;
  consentimiento_por: string | null;
  usos_mes: number;
  usos_5min: number;
}

/** Estado de la IA en la clínica (RPC ia_estado). null si no eres miembro de esa clínica. */
export async function obtenerEstadoIA(clinicaId: string): Promise<EstadoIA | null> {
  const { data, error } = await supabase.rpc('ia_estado', { p_clinica_id: clinicaId });
  if (error) throw error;
  return ((data ?? []) as EstadoIA[])[0] ?? null;
}

/** Activa (con el consentimiento aceptado) o apaga la IA de la clínica. Solo el propietario. */
export async function configurarIAClinica(clinicaId: string, habilitada: boolean): Promise<void> {
  const { error } = await supabase.rpc('configurar_ia_clinica', {
    p_clinica_id: clinicaId, p_habilitada: habilitada, p_version: habilitada ? IA_CONSENT_VERSION : null,
  });
  if (error) throw error;
}

// ── Llamadas a las funciones ──────────────────────────────────────────────────

/** Invoca una Edge Function de IA y traduce sus errores a mensajes entendibles. */
async function invocarIA<T>(funcion: string, body: Record<string, unknown>, fallo: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcion, { body });
  if (error) {
    // Las respuestas no-2xx traen el mensaje del servidor en el cuerpo de la respuesta.
    let mensaje = fallo;
    // FunctionsFetchError: la petición ni llegó (sin red, o la función no está desplegada y el navegador bloquea el preflight).
    if ((error as { name?: string }).name === 'FunctionsFetchError') mensaje = 'No se pudo contactar la función de IA. Verifica que esté desplegada en Supabase.';
    try {
      const cuerpo = await (error as { context?: Response }).context?.json?.();
      if (cuerpo?.error) mensaje = cuerpo.error;
      else if (/not found/i.test(cuerpo?.message ?? '')) mensaje = 'La función de IA todavía no está desplegada en Supabase.';
    } catch { /* sin cuerpo legible */ }
    throw new Error(mensaje);
  }
  if (!data || data.error) throw new Error(data?.error ?? fallo);
  return data as T;
}

// ── Resumen IA del expediente ─────────────────────────────────────────────────

export interface ResumenIA {
  resumen: string;
  alertas: string[];
  evolucion: Array<{ fecha: string; texto: string }>;
  medicacion: string[];
  por_revisar: string[];
}

export interface ResumenPacienteResultado {
  resumen: ResumenIA;
  modelo: string;
  uso: { input_tokens: number; output_tokens: number };
  generado_en: string;
  fuentes: { consultas: number; recetas: number; alergias: number };
}

/** Resumen previo a la consulta (Edge Function `resumen-paciente`). Es un borrador a verificar. */
export async function generarResumenPaciente(expedienteId: string): Promise<ResumenPacienteResultado> {
  const r = await invocarIA<ResumenPacienteResultado>('resumen-paciente', { expediente_id: expedienteId }, 'No se pudo generar el resumen.');
  if (!r.resumen) throw new Error('No se pudo generar el resumen.');
  return r;
}

// ── Sugerencia de CIE-10 ──────────────────────────────────────────────────────

export interface SugerenciaCie10 {
  codigo: string;
  descripcion: string;          // la del catálogo oficial, no la que escribió la IA
  capitulo: string | null;
  sexo: 'M' | 'F' | null;
  asterisco: boolean;
  daga: boolean;
  justificacion: string;        // qué parte de la nota lo respalda
  confianza: 'alta' | 'media' | 'baja';
  ajustado: boolean;            // el código de la IA no existía y se resolvió por el nombre
}

export interface SugerenciasCie10Resultado {
  sugerencias: SugerenciaCie10[];
  aviso: string | null;
  modelo: string;
  uso: { input_tokens: number; output_tokens: number };
  generado_en: string;
}

/** Sugiere códigos CIE-10 a partir de lo que el médico lleva escrito en la consulta (Edge Function `sugerir-cie10`). */
export async function sugerirCie10(p: {
  expedienteId: string; motivo: string; notas: string; signos: string; yaElegidos: string[];
}): Promise<SugerenciasCie10Resultado> {
  return invocarIA<SugerenciasCie10Resultado>('sugerir-cie10', {
    expediente_id: p.expedienteId, motivo: p.motivo, notas: p.notas, signos: p.signos, ya_elegidos: p.yaElegidos,
  }, 'No se pudieron generar las sugerencias.');
}
