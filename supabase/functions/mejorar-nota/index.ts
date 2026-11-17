// Edge Function: mejorar-nota
// Reorganiza la nota de consulta que el profesional lleva escrita como nota clínica estructurada.
// Recibe { expediente_id, motivo, notas, signos?, formato? }. La nota aún no está guardada, así que llega desde
// la pantalla; edad y sexo salen de la base con la sesión del usuario (RLS) y el nombre del paciente se usa
// solo para BORRARLO del texto antes de enviarlo.
//
// Devuelve una PROPUESTA (nunca modifica nada). Las salvaguardas (cifras que no estaban en la nota, secciones
// ajenas) están en _shared/notaIa.ts. Misma puerta que las demás funciones de IA: consentimiento y límites.
//
// Secretos: ANTHROPIC_API_KEY (obligatorio), ANTHROPIC_MODEL (opcional), IA_LIMITE_MENSUAL (opcional).

import { corsHeaders } from '../_shared/cors.ts';
import { autorizarIA, registrarUsoIA, edadEnAnios, json } from '../_shared/iaServidor.ts';
import { ErrorIA, MODELO_DEFECTO } from '../_shared/claude.ts';
import { construirContextoNota, pedirNotaMejorada, esFormato } from '../_shared/notaIa.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ctx = await autorizarIA(req);
    if (ctx instanceof Response) return ctx;
    const { sb, body, expediente: exp } = ctx;

    const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    const motivo = texto(body.motivo, 600);
    const notas = texto(body.notas, 30_000);
    const signos = texto(body.signos, 400);
    const formato = esFormato(body.formato) ? body.formato : 'general';

    // Poca nota = nada que reorganizar: no se gasta una llamada.
    const sinHtml = notas.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (sinHtml.length < 25) {
      return json({ error: 'Escribe un poco más en la nota para que la IA pueda reorganizarla.' }, 422);
    }

    const { data: pac } = await sb.from('pacientes')
      .select('nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo').eq('id', exp.paciente_id).maybeSingle();
    const sexo = (pac?.sexo as string | null) ?? null;
    const nombres = [pac?.nombre, pac?.apellido_paterno, pac?.apellido_materno].filter(Boolean) as string[];

    const contexto = construirContextoNota({
      edad_anios: edadEnAnios((pac?.fecha_nacimiento as string | null) ?? null), sexo, motivo, signos, notas,
    }, nombres);

    // "Fuente" = todo lo que escribió el profesional: contra eso se verifican las cifras de la propuesta.
    const fuente = [motivo, signos, notas.replace(/<[^>]+>/g, ' ')].join('\n');

    const modelo = Deno.env.get('ANTHROPIC_MODEL') || MODELO_DEFECTO;
    const { propuesta, uso, modelo: usado } = await pedirNotaMejorada(contexto, formato, fuente, sexo, { apiKey: ctx.apiKey, modelo });

    await registrarUsoIA(ctx, 'mejorar_nota', usado, uso);

    return json({ ...propuesta, formato, modelo: usado, uso, generado_en: new Date().toISOString() });
  } catch (err) {
    if (err instanceof ErrorIA) return json({ error: err.message }, err.status);
    console.error('mejorar-nota:', err);
    return json({ error: 'No se pudo reorganizar la nota.' }, 500);
  }
});
