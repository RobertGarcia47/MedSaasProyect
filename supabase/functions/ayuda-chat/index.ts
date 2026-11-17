// Edge Function: ayuda-chat
// Chat de ayuda de MedSaaS: responde cómo usar el software con una guía escrita a mano (_shared/ayudaIa.ts).
// Recibe { clinica_id, mensajes[], pantalla?, rol?, tipo_profesional?, acceso_limitado? }.
//
// NO lee datos de pacientes ni del expediente, así que no exige el consentimiento clínico de la clínica ni
// gasta créditos de IA (queda registrado en ia_uso con 0 créditos). Sí exige sesión válida, ser miembro de la
// clínica y respeta un límite por hora para evitar abusos. Sigue funcionando con la suscripción vencida: es
// justo cuando más se necesita saber cómo renovar.
//
// Secretos: ANTHROPIC_API_KEY (obligatorio), ANTHROPIC_MODEL (opcional).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { json } from '../_shared/iaServidor.ts';
import { ErrorIA, MODELO_DEFECTO } from '../_shared/claude.ts';
import { normalizarMensajes, pedirAyuda } from '../_shared/ayudaIa.ts';

/** Mensajes de ayuda por usuario y hora. */
const LIMITE_POR_HORA = 40;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'El asistente todavía no está configurado en el servidor.' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Sesión requerida' }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const clinicaId = typeof body.clinica_id === 'string' ? body.clinica_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(clinicaId)) return json({ error: 'clinica_id inválido' }, 400);
    const mensajes = normalizarMensajes(body.mensajes);
    if (!mensajes) return json({ error: 'Escribe una pregunta para el asistente.' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'Sesión inválida' }, 401);

    // ia_estado solo devuelve fila si el usuario es miembro de esa clínica.
    const { data: filas, error: estErr } = await sb.rpc('ia_estado', { p_clinica_id: clinicaId });
    if (estErr) { console.error('ia_estado:', estErr.message); return json({ error: 'No se pudo verificar tu clínica.' }, 500); }
    if (!filas?.[0]) return json({ error: 'No tienes acceso a esta clínica.' }, 403);

    // Límite por hora (cada usuario ve sus propias filas de ia_uso).
    const { count } = await sb.from('ia_uso').select('id', { count: 'exact', head: true })
      .eq('funcion', 'ayuda').gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= LIMITE_POR_HORA) {
      return json({ error: 'Has hecho muchas preguntas en poco tiempo. Intenta de nuevo en un rato o usa "Enviar al equipo".', codigo: 'limite_frecuencia' }, 429);
    }

    const corto = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
    const tipo = corto(body.tipo_profesional, 30) || null;
    const { salida, uso, modelo: usado } = await pedirAyuda(
      mensajes,
      { pantalla: corto(body.pantalla, 60) || 'desconocida', rol: corto(body.rol, 20) || null, tipo_profesional: tipo, acceso_limitado: body.acceso_limitado === true },
      tipo === 'dentista',
      { apiKey, modelo: Deno.env.get('ANTHROPIC_MODEL') || MODELO_DEFECTO },
    );

    const { error: usoErr } = await sb.from('ia_uso').insert({
      clinica_id: clinicaId, profile_id: user.id, funcion: 'ayuda', modelo: usado,
      input_tokens: uso.input_tokens, output_tokens: uso.output_tokens, creditos: 0,
    });
    if (usoErr) console.warn('ayuda-chat: no se pudo registrar el uso:', usoErr.message.slice(0, 200));

    return json({ ...salida, modelo: usado, uso });
  } catch (err) {
    if (err instanceof ErrorIA) return json({ error: err.message }, err.status);
    console.error('ayuda-chat:', err);
    return json({ error: 'No se pudo responder. Intenta de nuevo.' }, 500);
  }
});
