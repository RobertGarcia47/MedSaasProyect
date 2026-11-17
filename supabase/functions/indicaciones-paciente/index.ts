// Edge Function: indicaciones-paciente
// Redacta indicaciones para el paciente a partir de la receta que el médico está armando.
// Recibe { expediente_id, diagnostico_codigo?, medicamentos[], observaciones? }. La receta aún no está
// guardada, así que llega desde la pantalla; edad y sexo salen de la base con la sesión del usuario
// (RLS) y el nombre del paciente se usa solo para BORRARLO del texto antes de enviarlo.
//
// La lista de medicamentos del resultado sale de la receta, no de la IA (ver _shared/indicacionesIa.ts).
// Misma puerta que las demás funciones de IA: consentimiento de la clínica y límites de uso.
//
// Secretos: ANTHROPIC_API_KEY (obligatorio), ANTHROPIC_MODEL (opcional), IA_LIMITE_MENSUAL (opcional).

import { corsHeaders } from '../_shared/cors.ts';
import { autorizarIA, registrarUsoIA, edadEnAnios, json } from '../_shared/iaServidor.ts';
import { ErrorIA, MODELO_DEFECTO } from '../_shared/claude.ts';
import {
  construirContextoIndicaciones, pedirIndicaciones, type MedicamentoEntrada,
} from '../_shared/indicacionesIa.ts';

const MAX_MEDICAMENTOS = 15;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ctx = await autorizarIA(req);
    if (ctx instanceof Response) return ctx;
    const { sb, body, expediente: exp } = ctx;

    const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
    const opcional = (v: unknown, max: number) => texto(v, max) || null;

    const medicamentos: MedicamentoEntrada[] = (Array.isArray(body.medicamentos) ? body.medicamentos : [])
      .map((m: Record<string, unknown>) => ({
        medicamento: texto(m?.medicamento, 120),
        dosis: opcional(m?.dosis, 80), frecuencia: opcional(m?.frecuencia, 80), duracion: opcional(m?.duracion, 80),
        via: opcional(m?.via, 60), instrucciones: opcional(m?.instrucciones, 400), controlado: m?.controlado === true,
      }))
      .filter((m: MedicamentoEntrada) => m.medicamento)
      .slice(0, MAX_MEDICAMENTOS);
    if (!medicamentos.length) return json({ error: 'Agrega al menos un medicamento a la receta para redactar las indicaciones.' }, 422);

    // Diagnóstico: el código se completa con la descripción oficial del catálogo.
    let diagnostico: string | null = null;
    const codigo = texto(body.diagnostico_codigo, 10);
    if (/^[A-Za-z0-9.]{3,8}$/.test(codigo)) {
      const { data: dx } = await sb.from('cie10').select('descripcion').eq('codigo', codigo).maybeSingle();
      diagnostico = dx?.descripcion ? `${codigo} — ${dx.descripcion}` : codigo;
    }

    const { data: pac } = await sb.from('pacientes')
      .select('nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo').eq('id', exp.paciente_id).maybeSingle();
    const nombres = [pac?.nombre, pac?.apellido_paterno, pac?.apellido_materno].filter(Boolean) as string[];

    const contexto = construirContextoIndicaciones({
      edad_anios: edadEnAnios((pac?.fecha_nacimiento as string | null) ?? null),
      sexo: (pac?.sexo as string | null) ?? null,
      diagnostico, medicamentos, observaciones: texto(body.observaciones, 8000),
    }, nombres);

    const modelo = Deno.env.get('ANTHROPIC_MODEL') || MODELO_DEFECTO;
    const { indicaciones, uso, modelo: usado } = await pedirIndicaciones(contexto, medicamentos, { apiKey: ctx.apiKey, modelo });

    await registrarUsoIA(ctx, 'indicaciones_paciente', usado, uso);

    return json({ indicaciones, modelo: usado, uso, generado_en: new Date().toISOString() });
  } catch (err) {
    if (err instanceof ErrorIA) return json({ error: err.message }, err.status);
    console.error('indicaciones-paciente:', err);
    return json({ error: 'No se pudieron generar las indicaciones.' }, 500);
  }
});
