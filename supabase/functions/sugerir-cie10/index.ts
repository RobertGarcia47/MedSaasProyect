// Edge Function: sugerir-cie10
// Sugiere códigos CIE-10 a partir del motivo y la nota de la consulta que el médico está escribiendo.
// Recibe { expediente_id, motivo, notas, signos?, ya_elegidos? }. La nota aún no está guardada, así que
// llega desde la pantalla; edad y sexo salen de la base con la sesión del usuario (RLS) y el nombre del
// paciente se usa solo para BORRARLO del texto antes de enviarlo.
//
// La IA propone; el servidor valida cada código contra el catálogo oficial (ver _shared/cie10Ia.ts) y el
// médico decide qué agregar. Misma puerta que el resumen: consentimiento de la clínica y límites de uso.
//
// Secretos: ANTHROPIC_API_KEY (obligatorio), ANTHROPIC_MODEL (opcional), IA_LIMITE_MENSUAL (opcional).

import { corsHeaders } from '../_shared/cors.ts';
import { autorizarIA, registrarUsoIA, edadEnAnios, json } from '../_shared/iaServidor.ts';
import { ErrorIA, MODELO_DEFECTO } from '../_shared/claude.ts';
import {
  construirContextoCie10, pedirSugerenciasCie10, validarContraCatalogo,
  type Catalogo, type FilaCie10,
} from '../_shared/cie10Ia.ts';

const COLUMNAS = 'codigo, descripcion, capitulo, sexo, vigente, consulta_externa, asterisco, daga';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ctx = await autorizarIA(req);
    if (ctx instanceof Response) return ctx;
    const { sb, body, expediente: exp } = ctx;

    const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    const motivo = texto(body.motivo, 600);
    const notas = texto(body.notas, 20_000);
    const signos = texto(body.signos, 400);
    const yaElegidos = (Array.isArray(body.ya_elegidos) ? body.ya_elegidos : [])
      .filter((c): c is string => typeof c === 'string' && /^[A-Za-z0-9.]{3,8}$/.test(c)).slice(0, 20);

    // Sin texto no hay nada que codificar: no se gasta una llamada.
    const sinHtml = (notas + ' ' + motivo).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    if (sinHtml.length < 8) {
      return json({ error: 'Escribe el motivo de consulta o la nota para que la IA pueda sugerir diagnósticos.' }, 422);
    }

    const { data: pac } = await sb.from('pacientes')
      .select('nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo').eq('id', exp.paciente_id).maybeSingle();
    const sexo = (pac?.sexo as string | null) ?? null;
    const nombres = [pac?.nombre, pac?.apellido_paterno, pac?.apellido_materno].filter(Boolean) as string[];

    const contexto = construirContextoCie10({
      edad_anios: edadEnAnios((pac?.fecha_nacimiento as string | null) ?? null),
      sexo, motivo, signos, notas, ya_elegidos: yaElegidos,
    }, nombres);

    const modelo = Deno.env.get('ANTHROPIC_MODEL') || MODELO_DEFECTO;
    const { crudas, aviso, uso, modelo: usado } = await pedirSugerenciasCie10(contexto, { apiKey: ctx.apiKey, modelo });

    // Catálogo con la sesión del usuario. Por código exacto (pocas filas) no hay riesgo del corte de
    // 1000 filas; por nombre se usa la RPC de búsqueda, como en toda la app.
    const catalogo: Catalogo = {
      async porCodigos(codigos) {
        if (!codigos.length) return [];
        const { data, error } = await sb.from('cie10').select(COLUMNAS).in('codigo', codigos);
        if (error) throw error;
        return (data ?? []) as FilaCie10[];
      },
      async porTermino(termino) {
        const { data, error } = await sb.rpc('buscar_cie10', { p_query: termino, p_limit: 3 });
        if (error) return null;
        return ((data ?? []) as FilaCie10[]).find((f) => f.vigente) ?? null;
      },
    };
    const sugerencias = await validarContraCatalogo(crudas, catalogo, { sexoPaciente: sexo, excluir: yaElegidos });

    await registrarUsoIA(ctx, 'sugerir_cie10', usado, uso);

    return json({
      sugerencias,
      aviso: sugerencias.length ? null : (aviso ?? 'No se encontraron diagnósticos que la nota respalde con claridad. Prueba agregando más detalle.'),
      modelo: usado,
      uso,
      generado_en: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ErrorIA) return json({ error: err.message }, err.status);
    console.error('sugerir-cie10:', err);
    return json({ error: 'No se pudieron generar las sugerencias.' }, 500);
  }
});
