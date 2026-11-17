// Puerta de entrada común de las Edge Functions de IA (solo Deno). Antes de gastar una llamada al
// modelo comprueba, en este orden: método, clave del proveedor, sesión del usuario, acceso al
// expediente (la RLS decide), consentimiento de la clínica y límites de uso. Si algo falla
// devuelve la Response de error lista; si todo está bien devuelve el contexto.
//
// El consentimiento y el uso viven en la base (sql/2026-11-17_ia_consentimiento_uso.sql), no en
// el navegador: apagar la IA de una clínica la corta aquí aunque alguien llame a la función a mano.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import { revisarCupo, LIMITE_MENSUAL_DEFECTO, type EstadoIA } from './cupos.ts';

export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Máximo de llamadas por usuario en 5 minutos (evita ráfagas, p. ej. pulsar "Actualizar" sin parar). */
export const LIMITE_POR_5_MIN = 20;

/** Edad cumplida a partir de 'YYYY-MM-DD'; null si no hay fecha o es inválida. */
export function edadEnAnios(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null;
  const n = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
  return e >= 0 ? e : null;
}

export interface ContextoIA {
  sb: SupabaseClient;
  userId: string;
  apiKey: string;
  body: Record<string, unknown>;
  expediente: { id: string; paciente_id: string; clinica_id: string };
}

/**
 * Puerta de entrada de las funciones de IA sobre un expediente.
 * `creditos`: lo que cuesta esta llamada (1 en texto; más en funciones caras, como el dictado).
 */
export async function autorizarIA(req: Request, creditos = 1): Promise<ContextoIA | Response> {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'La IA todavía no está configurada en el servidor (falta el secreto ANTHROPIC_API_KEY).' }, 503);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Sesión requerida' }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const expedienteId = typeof body?.expediente_id === 'string' ? body.expediente_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(expedienteId)) return json({ error: 'expediente_id inválido' }, 400);

  // Cliente con el JWT del usuario: todo lo que lee o escribe pasa por su RLS.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: 'Sesión inválida' }, 401);

  const { data: exp } = await sb.from('expedientes').select('id, paciente_id, clinica_id').eq('id', expedienteId).maybeSingle();
  if (!exp) return json({ error: 'Expediente no encontrado o sin acceso' }, 404);

  const { data: filas, error: estErr } = await sb.rpc('ia_estado', { p_clinica_id: exp.clinica_id });
  if (estErr) {
    console.error('ia_estado:', estErr.message);
    return json({ error: 'No se pudo verificar la configuración de IA de la clínica. ¿Ya se corrió el SQL de consentimiento?' }, 500);
  }
  const estado = (filas as EstadoIA[] | null)?.[0];
  if (!estado?.habilitada) {
    return json({ error: 'La IA no está activada en tu clínica. El propietario puede activarla en Configuración → Inteligencia artificial.', codigo: 'ia_no_habilitada' }, 403);
  }
  if (estado.usos_5min >= LIMITE_POR_5_MIN) {
    return json({ error: 'Has hecho muchas consultas a la IA en poco tiempo. Espera unos minutos e intenta de nuevo.', codigo: 'limite_frecuencia' }, 429);
  }
  const rechazoCupo = revisarCupo(estado, creditos, Number(Deno.env.get('IA_LIMITE_MENSUAL')) || LIMITE_MENSUAL_DEFECTO);
  if (rechazoCupo) return json({ error: rechazoCupo, codigo: 'limite_mensual' }, 429);

  return { sb, userId: user.id, apiKey, body, expediente: exp as ContextoIA['expediente'] };
}

/** Deja constancia de una llamada a la IA: uso (tokens y créditos) y auditoría sobre el expediente. */
export async function registrarUsoIA(
  ctx: ContextoIA, funcion: string, modelo: string, uso: { input_tokens: number; output_tokens: number }, creditos = 1,
): Promise<void> {
  const { error } = await ctx.sb.from('ia_uso').insert({
    clinica_id: ctx.expediente.clinica_id, profile_id: ctx.userId, funcion, modelo,
    input_tokens: uso.input_tokens, output_tokens: uso.output_tokens, creditos,
  });
  if (error) console.warn(`${funcion}: no se pudo registrar el uso:`, error.message.slice(0, 200));
  const { error: audErr } = await ctx.sb.from('auditoria').insert({
    clinica_id: ctx.expediente.clinica_id, profile_id: ctx.userId, accion: 'READ',
    tabla: `ia_${funcion}`, registro_id: ctx.expediente.id,
  });
  if (audErr) console.warn(`${funcion}: no se pudo auditar:`, audErr.message.slice(0, 200));
}
