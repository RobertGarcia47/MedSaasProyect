// Servicio de informes. El cuerpo narrativo va CIFRADO → todo pasa por las RPCs
// crear_informe / obtener_informes. El título va en claro (para listar/buscar).

import { supabase } from './supabase';

export type TipoInforme =
  | 'nota_evolucion' | 'nota_consulta' | 'nota_obstetrica' | 'interconsulta' | 'otro';

export const TIPO_INFORME_LABEL: Record<TipoInforme, string> = {
  nota_evolucion:  'Nota de evolución',
  nota_consulta:   'Nota de consulta',
  nota_obstetrica: 'Nota obstétrica',
  interconsulta:   'Interconsulta',
  otro:            'Otro',
};

export interface InformeUI {
  id: string;
  consulta_id: string | null;
  medico_id: string;
  tipo: TipoInforme;
  titulo: string;
  cuerpo: string | null;            // descifrado por la RPC
  created_at: string;
}

export interface NuevoInforme {
  tipo: TipoInforme;
  titulo: string;
  cuerpo?: string | null;
  consulta_id?: string | null;
}

/** Crea un informe (cifra el cuerpo) y devuelve su id. */
export async function crearInforme(expedienteId: string, input: NuevoInforme): Promise<string> {
  const { data, error } = await supabase.rpc('crear_informe', {
    p_expediente_id: expedienteId,
    p_tipo:          input.tipo,
    p_titulo:        input.titulo,
    p_cuerpo:        input.cuerpo ?? null,
    p_consulta_id:   input.consulta_id ?? null,
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
