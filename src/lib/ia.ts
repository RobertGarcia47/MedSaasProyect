// Funciones de IA (Claude) de MedSaaS. La API key NUNCA vive en el navegador: todo pasa por Edge
// Functions de Supabase que arman el contexto con la sesión del usuario (RLS) y llaman al modelo.

import { supabase } from './supabase';

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
  const { data, error } = await supabase.functions.invoke('resumen-paciente', { body: { expediente_id: expedienteId } });
  if (error) {
    // Las respuestas no-2xx traen el mensaje del servidor en el cuerpo de la respuesta.
    let mensaje = 'No se pudo generar el resumen.';
    // FunctionsFetchError: la petición ni llegó (sin red, o la función no está desplegada y el navegador bloquea el preflight).
    if ((error as { name?: string }).name === 'FunctionsFetchError') mensaje = 'No se pudo contactar la función de IA. Verifica que esté desplegada en Supabase.';
    try {
      const cuerpo = await (error as { context?: Response }).context?.json?.();
      if (cuerpo?.error) mensaje = cuerpo.error;
      else if (/not found/i.test(cuerpo?.message ?? '')) mensaje = 'La función de IA todavía no está desplegada en Supabase.';
    } catch { /* sin cuerpo legible */ }
    throw new Error(mensaje);
  }
  if (!data?.resumen) throw new Error(data?.error ?? 'No se pudo generar el resumen.');
  return data as ResumenPacienteResultado;
}
