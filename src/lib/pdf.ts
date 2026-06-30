// Cliente del API de reportes (ApiMedsaas + QuestPDF). El front arma el payload
// con datos YA descifrados (vía RPC) y el API solo renderiza el PDF — nunca toca
// Supabase ni la llave de cifrado. Ver MIGRACION_VERCEL_SUPABASE §"PDF / reportes".

import { supabase } from './supabase';
import { obtenerRecetas, formatFolioReceta, type RecetaUI } from './recetas';

/** Base del API de reportes. En local: http://localhost:5128 (perfil http). */
const API_URL = ((import.meta.env.VITE_REPORTES_API_URL as string) || 'http://localhost:5128').replace(/\/+$/, '');

export type Plantilla = 'teal' | 'oliva' | 'azul';

export const PLANTILLAS: { id: Plantilla; nombre: string; descripcion: string; color: string }[] = [
  { id: 'teal',  nombre: 'Verde Teal',   descripcion: 'Identidad verde clínica',     color: '#0C6B56' },
  { id: 'oliva', nombre: 'Oliva Dorado', descripcion: 'Cálido / institucional',       color: '#7A6B1E' },
  { id: 'azul',  nombre: 'Azul Médico',  descripcion: 'Tradicional / hospitalario',   color: '#1A4F8A' },
];

// ── Forma del payload (espeja RecetaPdfRequest del API) ───────────────────────
export interface RecetaPdfMedicamento {
  nombre: string;
  dosis?: string | null;
  posologia?: string | null;
  dispensacion?: string | null;
  instrucciones?: string | null;
  controlado?: boolean;
}

export interface RecetaPdfData {
  medico: {
    nombre: string;
    especialidad?: string | null;
    cedulaProfesional?: string | null;
    cedulaEspecialidad?: string | null;
    institucion?: string | null;
  };
  clinica: {
    nombre: string;
    direccion: string[];
    telefonos?: string | null;
    email?: string | null;
    horario?: string | null;
    logoUrl?: string | null;
  };
  paciente: { nombre: string; edadSexo?: string | null };
  folio?: string | null;
  fechaEmision?: string | null;
  diagnostico?: string | null;
  vigenciaDias?: number;
  medicamentos: RecetaPdfMedicamento[];
  indicaciones: string[];
  /** Plantilla de color (preferencia de clínica). El API la usa para renderizar. */
  plantilla: Plantilla;
}

// ── Helpers de formato ────────────────────────────────────────────────────────
function calcEdadAnios(fechaNac: string | null): number | null {
  if (!fechaNac) return null;
  const b = new Date(fechaNac);
  if (isNaN(b.getTime())) return null;
  const h = new Date();
  let a = h.getFullYear() - b.getFullYear();
  if (h.getMonth() < b.getMonth() || (h.getMonth() === b.getMonth() && h.getDate() < b.getDate())) a--;
  return a >= 0 ? a : null;
}

function edadSexoTexto(fechaNac: string | null, sexo: string | null): string | null {
  const edad = calcEdadAnios(fechaNac);
  const sx = sexo === 'M' ? 'Masculino' : sexo === 'F' ? 'Femenino' : null;
  const parts = [edad != null ? `${edad} años` : null, sx].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Posología armada desde campos sueltos: "Cada 12 horas · 30 días · Vía oral". */
export function armarPosologia(frecuencia?: string | null, duracion?: string | null, via?: string | null): string | null {
  const parts = [
    frecuencia?.trim() || null,
    duracion?.trim() || null,
    via?.trim() ? `Vía ${via.trim()}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Convierte el HTML del editor de observaciones en líneas (una indicación por renglón). */
export function htmlAIndicaciones(html: string | null): string[] {
  if (!html) return [];
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = doc.body.querySelectorAll('li, p, div');
  const lines = blocks.length
    ? Array.from(blocks).map((b) => b.textContent?.trim() ?? '')
    : (doc.body.textContent ?? '').split('\n');
  return lines.map((s) => s.trim()).filter(Boolean);
}

// ── Carga del membrete (médico + clínica) desde Supabase ──────────────────────
async function cargarMembrete(clinicaId: string, userId: string, medicoNombre: string) {
  const [{ data: md }, { data: cl }, { data: ceds }] = await Promise.all([
    supabase.from('medico_detalles')
      .select('prefijo, cedula_profesional, universidad, especialidad_id')
      .eq('profile_id', userId).maybeSingle<{ prefijo: string | null; cedula_profesional: string | null; universidad: string | null; especialidad_id: number | null }>(),
    supabase.from('clinicas')
      .select('nombre, direccion, telefono, correo_contacto, logo_url, plantilla_receta')
      .eq('id', clinicaId).maybeSingle<{ nombre: string | null; direccion: string | null; telefono: string | null; correo_contacto: string | null; logo_url: string | null; plantilla_receta: string | null }>(),
    supabase.from('medico_cedulas')
      .select('cedula, especialidad_id, es_default')
      .eq('profile_id', userId),
  ]);

  // especialidad_id: medico_detalles → cédula default → cualquier cédula con especialidad.
  const cedDefault = (ceds ?? []).find((c: any) => c.es_default);
  const espId =
    md?.especialidad_id ??
    cedDefault?.especialidad_id ??
    (ceds ?? []).find((c: any) => c.especialidad_id)?.especialidad_id ??
    null;

  let especialidad: string | null = null;
  if (espId) {
    const { data: e } = await supabase.from('especialidades').select('nombre').eq('id', espId).maybeSingle<{ nombre: string }>();
    especialidad = e?.nombre ?? null;
  }

  // Cédula de especialidad = primera cédula adicional (no default), si existe.
  const cedulaEspecialidad = (ceds ?? []).find((c: any) => !c.es_default)?.cedula ?? null;

  const prefijo = md?.prefijo?.trim();
  const nombre = prefijo ? `${prefijo} ${medicoNombre}` : medicoNombre;

  const plantilla = (['teal', 'oliva', 'azul'].includes(cl?.plantilla_receta ?? '')
    ? cl!.plantilla_receta : 'teal') as Plantilla;

  return {
    plantilla,
    medico: {
      nombre,
      especialidad,
      cedulaProfesional: md?.cedula_profesional ?? null,
      cedulaEspecialidad,
      institucion: md?.universidad ?? null,
    },
    clinica: {
      nombre: cl?.nombre ?? 'Consultorio',
      direccion: cl?.direccion ? [cl.direccion] : [],
      telefonos: cl?.telefono ?? null,
      email: cl?.correo_contacto ?? null,
      horario: null as string | null,
      logoUrl: cl?.logo_url ?? null,
    },
  };
}

// ── Construcción del payload completo de una receta ───────────────────────────
/**
 * Arma el PDF de una receta recién creada. Releemos la receta guardada
 * (obtener_recetas) para que el folio, medicamentos e indicaciones vengan de la
 * fuente de verdad (el folio lo asigna la DB), y delegamos en el mismo builder
 * que usa el historial.
 */
export async function construirRecetaPdf(params: {
  clinicaId: string;
  userId: string;
  medicoNombre: string;
  pacienteId: string;
  pacienteNombre: string;
  expedienteId: string;
  recetaId: string;
}): Promise<RecetaPdfData> {
  const recetas = await obtenerRecetas(params.expedienteId);
  const creada =
    recetas.find((r) => r.id === params.recetaId) ??
    [...recetas].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
  if (!creada) throw new Error('No se encontró la receta recién creada.');

  return construirRecetaPdfDesdeReceta(creada, {
    clinicaId: params.clinicaId,
    userId: params.userId,
    medicoNombre: params.medicoNombre,
    pacienteId: params.pacienteId,
    pacienteNombre: params.pacienteNombre,
  });
}

/** Descripción de un código CIE-10 (para el membrete de diagnóstico). */
async function descCie10(codigo: string | null): Promise<string | null> {
  if (!codigo) return null;
  const { data } = await supabase.from('cie10').select('descripcion').eq('codigo', codigo).maybeSingle<{ descripcion: string }>();
  return data?.descripcion ?? null;
}

/**
 * Arma el payload del PDF a partir de una receta YA guardada (RecetaUI de
 * obtener_recetas). Usado por el botón "Ver PDF" del historial del expediente.
 */
export async function construirRecetaPdfDesdeReceta(
  receta: RecetaUI,
  ctx: { clinicaId: string; userId: string; medicoNombre: string; pacienteId: string; pacienteNombre: string },
): Promise<RecetaPdfData> {
  const [membrete, { data: pac }, dxDesc] = await Promise.all([
    cargarMembrete(ctx.clinicaId, ctx.userId, ctx.medicoNombre),
    supabase.from('pacientes').select('sexo, fecha_nacimiento').eq('id', ctx.pacienteId)
      .maybeSingle<{ sexo: string | null; fecha_nacimiento: string | null }>(),
    descCie10(receta.diagnostico_cie10),
  ]);

  return {
    ...membrete,
    paciente: {
      nombre: ctx.pacienteNombre,
      edadSexo: edadSexoTexto(pac?.fecha_nacimiento ?? null, pac?.sexo ?? null),
    },
    folio: formatFolioReceta(receta.folio_num, receta.fecha_receta, receta.created_at),
    fechaEmision: fechaCorta(receta.fecha_receta) ?? fechaCorta(receta.created_at),
    diagnostico: receta.diagnostico_cie10
      ? (dxDesc ? `${receta.diagnostico_cie10} — ${dxDesc}` : receta.diagnostico_cie10)
      : null,
    vigenciaDias: 30,
    medicamentos: receta.medicamentos.map((m) => ({
      nombre: m.medicamento,
      dosis: m.dosis || null,
      posologia: armarPosologia(m.frecuencia, m.duracion, m.via),
      dispensacion: null,
      instrucciones: m.instrucciones || null,
      controlado: !!m.controlado,
    })),
    indicaciones: htmlAIndicaciones(receta.indicaciones),
  };
}

// ── Llamadas al API ───────────────────────────────────────────────────────────
/** Genera el PDF de receta (usa data.plantilla, la preferencia de la clínica). Devuelve el Blob. */
export async function generarRecetaPdf(data: RecetaPdfData): Promise<Blob> {
  const res = await fetch(`${API_URL}/reportes/receta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`El servicio de PDF respondió ${res.status}. ${detalle.slice(0, 200)}`);
  }
  return res.blob();
}
