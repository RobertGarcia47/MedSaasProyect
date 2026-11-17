// Edge Function: resumen-paciente
// "Resumen IA" previo a la consulta. Recibe { expediente_id }, arma el contexto clínico en el SERVIDOR
// con el token del propio usuario (la RLS decide qué puede ver; nadie manda datos desde el navegador),
// le quita la identidad y pide un borrador estructurado a Claude (Haiku por defecto).
//
// Secretos (supabase secrets set):
//   ANTHROPIC_API_KEY   obligatorio. La clave vive solo aquí, jamás en el navegador.
//   ANTHROPIC_MODEL     opcional. Por defecto 'claude-haiku-5-5'.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  construirContexto, pedirResumen, ErrorIA, MODELO_DEFECTO, limpiarTexto,
  type DatosExpediente,
} from '../_shared/resumenIa.ts';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MAX_CONSULTAS = 6;
const MAX_RECETAS = 3;

function edadEnAnios(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null;
  const n = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
  return e >= 0 ? e : null;
}

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
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'La IA todavía no está configurada en el servidor (falta el secreto ANTHROPIC_API_KEY).' }, 503);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Sesión requerida' }, 401);

    const body = await req.json().catch(() => ({}));
    const expedienteId = typeof body?.expediente_id === 'string' ? body.expediente_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(expedienteId)) return json({ error: 'expediente_id inválido' }, 400);

    // Cliente con el JWT del usuario: todo lo que lee pasa por su RLS.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'Sesión inválida' }, 401);

    const { data: exp } = await sb.from('expedientes').select('id, paciente_id, clinica_id').eq('id', expedienteId).maybeSingle();
    if (!exp) return json({ error: 'Expediente no encontrado o sin acceso' }, 404);

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
    const { resumen, uso, modelo: usado } = await pedirResumen(construirContexto(datos, nombres), { apiKey, modelo });

    // Queda constancia del uso de IA sobre este expediente (las lecturas ya se auditan en las RPC).
    const { error: audErr } = await sb.from('auditoria').insert({
      clinica_id: exp.clinica_id, profile_id: user.id, accion: 'READ', tabla: 'ia_resumen_paciente', registro_id: expedienteId,
    });
    if (audErr) console.warn('resumen-paciente: no se pudo auditar:', limpiarTexto(audErr.message, 200));

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
