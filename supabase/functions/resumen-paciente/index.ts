// Edge Function: resumen-paciente
// "Resumen IA" previo a la consulta. Recibe { expediente_id }, arma el contexto clínico en el SERVIDOR
// con el token del propio usuario (la RLS decide qué puede ver; nadie manda datos desde el navegador),
// le quita la identidad y pide un borrador estructurado a Claude (Haiku por defecto).
//
// Antes de llamar al modelo, autorizarIA() comprueba sesión, acceso al expediente, que la clínica
// haya activado la IA (consentimiento en la base) y los límites de uso. Ver _shared/iaServidor.ts.
//
// Secretos (supabase secrets set):
//   ANTHROPIC_API_KEY   obligatorio. La clave vive solo aquí, jamás en el navegador.
//   ANTHROPIC_MODEL     opcional. Por defecto 'claude-haiku-5-5'.
//   IA_LIMITE_MENSUAL   opcional. Llamadas de IA por clínica al mes (por defecto 1000).

import { corsHeaders } from '../_shared/cors.ts';
import { autorizarIA, registrarUsoIA, edadEnAnios, json } from '../_shared/iaServidor.ts';
import {
  construirContexto, pedirResumen, ErrorIA, MODELO_DEFECTO,
  type DatosExpediente,
} from '../_shared/resumenIa.ts';

const MAX_CONSULTAS = 6;
const MAX_RECETAS = 3;

function signos(c: Record<string, unknown>): string | null {
  const partes: string[] = [];
  if (c.ta_sistolica && c.ta_diastolica) partes.push(`TA ${c.ta_sistolica}/${c.ta_diastolica}`);
  if (c.fc) partes.push(`FC ${c.fc}`);
  if (c.temp_c) partes.push(`Temp ${c.temp_c} °C`);
  if (c.spo2) partes.push(`SpO2 ${c.spo2}%`);
  if (c.glucosa) partes.push(`Glucosa ${c.glucosa}`);
  if (c.peso_kg) partes.push(`Peso ${c.peso_kg} kg`);
  if (c.talla_cm) partes.push(`Talla ${c.talla_cm} cm`);
  return partes.length ? partes.join(', ') : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const ctx = await autorizarIA(req);
    if (ctx instanceof Response) return ctx;
    const { sb, expediente: exp } = ctx;
    const expedienteId = exp.id;

    const [pacR, alergR, antR, consR, dxR, recR] = await Promise.all([
      sb.from('pacientes').select('nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, grupo_sanguineo').eq('id', exp.paciente_id).maybeSingle(),
      sb.from('expediente_alergias').select('alergia').eq('expediente_id', expedienteId),
      sb.rpc('obtener_antecedentes', { p_expediente_id: expedienteId }),
      sb.rpc('obtener_consultas', { p_expediente_id: expedienteId }),
      sb.from('consultas')
        .select('id, consulta_diagnosticos(cie10_codigo, es_principal, cie10(descripcion))')
        .eq('expediente_id', expedienteId).order('fecha', { ascending: false }).limit(MAX_CONSULTAS),
      sb.rpc('obtener_recetas', { p_expediente_id: expedienteId }),
    ]);

    const dxPorConsulta = new Map<string, string[]>();
    for (const c of (dxR.data ?? []) as Array<{ id: string; consulta_diagnosticos: Array<{ cie10_codigo: string; es_principal: boolean; cie10: { descripcion: string } | null }> }>) {
      dxPorConsulta.set(c.id, (c.consulta_diagnosticos ?? [])
        .sort((a, b) => Number(b.es_principal) - Number(a.es_principal))
        .map((d) => `${d.cie10_codigo}${d.cie10?.descripcion ? ` ${d.cie10.descripcion}` : ''}`));
    }

    const consultas = ((consR.data ?? []) as Array<Record<string, unknown>>)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, MAX_CONSULTAS)
      .map((c) => ({
        fecha: String(c.fecha ?? '').slice(0, 10),
        motivo: (c.motivo as string | null) ?? null,
        notas: (c.notas as string | null) ?? null,
        signos: signos(c),
        diagnosticos: dxPorConsulta.get(String(c.id)) ?? [],
      }));

    const recetas = ((recR.data ?? []) as Array<{ fecha_receta: string | null; created_at: string; diagnostico_cie10: string | null; indicaciones: string | null; medicamentos: Array<{ medicamento: string; dosis?: string | null; frecuencia?: string | null; duracion?: string | null; via?: string | null; controlado?: boolean }> }>)
      .sort((a, b) => String(b.fecha_receta ?? b.created_at).localeCompare(String(a.fecha_receta ?? a.created_at)))
      .slice(0, MAX_RECETAS)
      .map((r) => ({
        fecha: (r.fecha_receta ?? r.created_at ?? '').slice(0, 10) || null,
        diagnostico: r.diagnostico_cie10,
        indicaciones: r.indicaciones,
        medicamentos: (r.medicamentos ?? []).map((m) =>
          [m.medicamento, m.dosis, m.via, m.frecuencia, m.duracion && `por ${m.duracion}`, m.controlado && '(controlado)'].filter(Boolean).join(' · ')),
      }));

    const ant = (antR.data?.[0] ?? {}) as Partial<DatosExpediente['antecedentes']>;
    const datos: DatosExpediente = {
      paciente: {
        edad_anios: edadEnAnios((pacR.data?.fecha_nacimiento as string | null) ?? null),
        sexo: (pacR.data?.sexo as string | null) ?? null,
        grupo_sanguineo: (pacR.data?.grupo_sanguineo as string | null) ?? null,
      },
      alergias: ((alergR.data ?? []) as Array<{ alergia: string }>).map((a) => a.alergia),
      antecedentes: {
        patologicos: ant.patologicos ?? '', no_patologicos: ant.no_patologicos ?? '',
        heredofamiliares: ant.heredofamiliares ?? '', quirurgicos: ant.quirurgicos ?? '',
      },
      consultas,
      recetas,
    };

    // Sin nada clínico que resumir no se gasta una llamada.
    const hayDatos = consultas.length || recetas.length || datos.alergias.length || Object.values(datos.antecedentes).some((v) => v.trim());
    if (!hayDatos) return json({ error: 'Este expediente todavía no tiene información clínica para resumir.' }, 422);

    const modelo = Deno.env.get('ANTHROPIC_MODEL') || MODELO_DEFECTO;
    // El nombre real solo se usa aquí para BORRARLO del texto libre; nunca se envía.
    const nombres = [pacR.data?.nombre, pacR.data?.apellido_paterno, pacR.data?.apellido_materno].filter(Boolean) as string[];
    const { resumen, uso, modelo: usado } = await pedirResumen(construirContexto(datos, nombres), { apiKey: ctx.apiKey, modelo });

    // Queda constancia del uso (tokens) y de la lectura del expediente por la IA.
    await registrarUsoIA(ctx, 'resumen_paciente', usado, uso);

    return json({
      resumen,
      modelo: usado,
      uso,
      generado_en: new Date().toISOString(),
      fuentes: { consultas: consultas.length, recetas: recetas.length, alergias: datos.alergias.length },
    });
  } catch (err) {
    if (err instanceof ErrorIA) return json({ error: err.message }, err.status);
    console.error('resumen-paciente:', err);
    return json({ error: 'No se pudo generar el resumen.' }, 500);
  }
});
