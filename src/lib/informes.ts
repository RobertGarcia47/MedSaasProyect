// Servicio de informes. El cuerpo narrativo va CIFRADO → todo pasa por las RPCs
// crear_informe / obtener_informes. El título va en claro (para listar/buscar).

import { supabase } from './supabase';

export type TipoInforme =
  | 'nota_evolucion' | 'nota_consulta' | 'nota_obstetrica' | 'interconsulta' | 'otro';

export type VisibilidadInforme = 'expediente' | 'compartido' | 'privado';

export const TIPO_INFORME_LABEL: Record<TipoInforme, string> = {
  nota_evolucion:  'Nota de evolución',
  nota_consulta:   'Nota de consulta',
  nota_obstetrica: 'Nota obstétrica',
  interconsulta:   'Interconsulta',
  otro:            'Otro',
};

export const TIPO_INFORME_ICON: Record<TipoInforme, string> = {
  nota_evolucion:  'monitoring',
  nota_consulta:   'stethoscope',
  nota_obstetrica: 'child_care',
  interconsulta:   'forum',
  otro:            'summarize',
};

export const TIPO_INFORME_COLOR: Record<TipoInforme, { color: string; bg: string }> = {
  nota_evolucion:  { color: '#0E8C86', bg: '#D6F0EC' },
  nota_consulta:   { color: '#1A6CCB', bg: '#E4EEFB' },
  nota_obstetrica: { color: '#7C3AED', bg: '#EDE6FB' },
  interconsulta:   { color: '#0E8C86', bg: '#D6F0EC' },
  otro:            { color: '#C2410C', bg: '#FBE6D8' },
};

export const VISIBILIDAD_LABEL: Record<VisibilidadInforme, string> = {
  expediente: 'Expediente',
  compartido: 'Compartido',
  privado:    'Privado',
};

export const VISIBILIDAD_ICON: Record<VisibilidadInforme, string> = {
  expediente: 'folder_shared',
  compartido: 'group',
  privado:    'lock_person',
};

export interface InformeUI {
  id: string;
  consulta_id: string | null;
  medico_id: string;
  tipo: TipoInforme;
  titulo: string;
  cuerpo: string | null;
  visibilidad: VisibilidadInforme;
  tags: string[];
  fecha_informe: string | null;
  folio_num: number | null;
  created_at: string;
}

/** Formatea el folio para mostrar: "F3 - 22-06-2026". */
export function formatFolio(folio_num: number | null, fecha_informe: string | null, created_at: string): string {
  if (!folio_num) return '—';
  const d = fecha_informe ? new Date(fecha_informe + 'T00:00:00') : new Date(created_at);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `F${folio_num} - ${dd}-${mm}-${yyyy}`;
}

export interface NuevoInforme {
  tipo: TipoInforme;
  titulo: string;
  cuerpo?: string | null;
  consulta_id?: string | null;
  visibilidad?: VisibilidadInforme;
  tags?: string[];
  fecha_informe?: string | null;
}

/** Crea un informe (cifra el cuerpo) y devuelve su id. */
export async function crearInforme(expedienteId: string, input: NuevoInforme): Promise<string> {
  const { data, error } = await supabase.rpc('crear_informe', {
    p_expediente_id:  expedienteId,
    p_tipo:           input.tipo,
    p_titulo:         input.titulo,
    p_cuerpo:         input.cuerpo         ?? null,
    p_consulta_id:    input.consulta_id    ?? null,
    p_visibilidad:    input.visibilidad    ?? 'expediente',
    p_tags:           input.tags           ?? [],
    p_fecha_informe:  input.fecha_informe  ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Lista los informes del expediente (cuerpo descifrado). */
export async function obtenerInformes(expedienteId: string): Promise<InformeUI[]> {
  const { data, error } = await supabase.rpc('obtener_informes', { p_expediente_id: expedienteId });
  if (error) throw error;
  return (data ?? []) as InformeUI[];
}
