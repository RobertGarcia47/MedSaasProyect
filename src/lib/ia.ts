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
  /** Créditos gastados este mes y cupo del plan (desde sql/2026-11-18_ia_cupos_ayuda.sql; null si el SQL aún no corre). */
  creditos_mes: number | null;
  cupo_mes: number | null;
  /** Primer día del próximo mes ('YYYY-MM-DD'): cuándo se renuevan los créditos. */
  renueva_el: string | null;
}

/** true si la clínica ya gastó todos los créditos de IA de su plan este mes. */
export const sinCupo = (e: EstadoIA | null | undefined): boolean =>
  !!e && e.cupo_mes != null && (e.creditos_mes ?? 0) >= e.cupo_mes;

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

// ── Indicaciones para el paciente (desde la receta) ───────────────────────────

export interface IndicacionesPaciente {
  introduccion: string;
  medicamentos: Array<{ nombre: string; como_tomarlo: string; controlado: boolean }>;
  cuidados: string[];
  senales_alarma: string[];
}

export interface IndicacionesResultado {
  indicaciones: IndicacionesPaciente;
  modelo: string;
  uso: { input_tokens: number; output_tokens: number };
  generado_en: string;
}

/** Redacta indicaciones en lenguaje sencillo a partir de la receta en curso (Edge Function `indicaciones-paciente`). */
export async function generarIndicacionesPaciente(p: {
  expedienteId: string;
  diagnosticoCodigo: string;
  medicamentos: Array<{ medicamento: string; dosis?: string | null; frecuencia?: string | null; duracion?: string | null; via?: string | null; instrucciones?: string | null; controlado?: boolean }>;
  observaciones: string;
}): Promise<IndicacionesResultado> {
  return invocarIA<IndicacionesResultado>('indicaciones-paciente', {
    expediente_id: p.expedienteId, diagnostico_codigo: p.diagnosticoCodigo, medicamentos: p.medicamentos, observaciones: p.observaciones,
  }, 'No se pudieron generar las indicaciones.');
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML para el editor de "Observaciones generales" de la receta. Todo el texto se escapa: viene de un modelo. */
export function indicacionesAHtml(i: IndicacionesPaciente): string {
  const lista = (items: string[]) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const partes: string[] = [];
  if (i.introduccion) partes.push(`<p>${esc(i.introduccion)}</p>`);
  if (i.medicamentos.length) {
    partes.push('<p><strong>Cómo tomar sus medicamentos</strong></p>');
    partes.push(`<ul>${i.medicamentos.map((m) => `<li><strong>${esc(m.nombre)}:</strong> ${esc(m.como_tomarlo)}</li>`).join('')}</ul>`);
  }
  if (i.cuidados.length) { partes.push('<p><strong>Cuidados</strong></p>'); partes.push(lista(i.cuidados)); }
  if (i.senales_alarma.length) { partes.push('<p><strong>Acuda a consulta o a urgencias si:</strong></p>'); partes.push(lista(i.senales_alarma)); }
  return partes.join('');
}

// ── Mejorar nota de la consulta ───────────────────────────────────────────────

export type FormatoNota = 'general' | 'dental' | 'salud_mental';

export interface PropuestaNotaResultado {
  secciones: Array<{ titulo: string; texto: string }>;
  faltantes: string[];
  /** Oraciones omitidas porque traían cifras que el profesional no había escrito. */
  descartadas: number;
  formato: FormatoNota;
  modelo: string;
  uso: { input_tokens: number; output_tokens: number };
  generado_en: string;
}

/** Propone la nota reorganizada (Edge Function `mejorar-nota`). No cambia nada: el profesional decide. */
export async function mejorarNota(p: {
  expedienteId: string; motivo: string; notas: string; signos: string; formato: FormatoNota;
}): Promise<PropuestaNotaResultado> {
  return invocarIA<PropuestaNotaResultado>('mejorar-nota', {
    expediente_id: p.expedienteId, motivo: p.motivo, notas: p.notas, signos: p.signos, formato: p.formato,
  }, 'No se pudo reorganizar la nota.');
}

/** HTML de la propuesta, con el mismo estilo de las plantillas de nota ("<b>Título:</b> texto"). Todo se escapa. */
export function propuestaNotaAHtml(secciones: Array<{ titulo: string; texto: string }>): string {
  return secciones.map((s) => `<p><b>${esc(s.titulo)}:</b> ${esc(s.texto)}</p>`).join('');
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

// ── Chat de ayuda ─────────────────────────────────────────────────────────────

export interface MensajeAyuda { role: 'user' | 'assistant'; content: string }

export interface RespuestaAyuda { respuesta: string; acciones: string[]; modelo: string }

/** Accesos directos que puede ofrecer el chat. Debe coincidir con ACCESOS de supabase/functions/_shared/ayudaIa.ts. */
export const ACCESOS_AYUDA: Record<string, { ruta: string; etiqueta: string }> = {
  inicio: { ruta: 'dashboard', etiqueta: 'Ir a Inicio' },
  agenda: { ruta: 'calendar', etiqueta: 'Ir a Agenda' },
  pacientes: { ruta: 'patients', etiqueta: 'Ir a Pacientes' },
  perfil: { ruta: 'profile', etiqueta: 'Ir a Mi perfil' },
  configuracion: { ruta: 'settings', etiqueta: 'Ir a Configuración' },
  procedimientos: { ruta: 'procedimientos', etiqueta: 'Ir a Procedimientos y precios' },
};

/** Pregunta al asistente de ayuda (Edge Function `ayuda-chat`). No envía datos de pacientes: solo la conversación y un poco de contexto. */
export async function preguntarAyuda(p: {
  clinicaId: string; mensajes: MensajeAyuda[]; pantalla: string; rol: string | null; tipoProfesional: string | null; accesoLimitado: boolean;
}): Promise<RespuestaAyuda> {
  return invocarIA<RespuestaAyuda>('ayuda-chat', {
    clinica_id: p.clinicaId, mensajes: p.mensajes, pantalla: p.pantalla, rol: p.rol,
    tipo_profesional: p.tipoProfesional, acceso_limitado: p.accesoLimitado,
  }, 'No se pudo responder. Intenta de nuevo.');
}

export type TipoReporteAyuda = 'problema' | 'sugerencia' | 'pregunta';

/** Guarda un reporte para el equipo de MedSaaS (tabla ayuda_reportes). */
export async function enviarReporteAyuda(p: {
  clinicaId: string; tipo: TipoReporteAyuda; mensaje: string; conversacion: MensajeAyuda[] | null; pantalla: string;
}): Promise<void> {
  const { error } = await supabase.from('ayuda_reportes').insert({
    clinica_id: p.clinicaId, tipo: p.tipo, mensaje: p.mensaje.trim(), conversacion: p.conversacion, pantalla: p.pantalla,
  });
  if (error) throw new Error('No se pudo enviar el reporte. Intenta de nuevo en un momento.');
}
