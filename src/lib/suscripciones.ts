// Suscripción de la clínica — catálogo de planes, método de pago guardado, y las
// dos acciones que solo el owner puede disparar (suscribirse / actualizar tarjeta),
// ambas delegadas a Supabase Edge Functions porque necesitan la Secret Key de
// Stripe (nunca debe llegar al navegador). Ver supabase/functions/.

import { supabase } from './supabase';

export interface PlanUI {
  id: number;
  nombre: string;
  precioMxn: number;
  maxMedicos: number;
  maxAsistentesPorMedico: number;
  maxPacientes: number | null;
  tieneStripePriceId: boolean;
}

export async function fetchPlanes(): Promise<PlanUI[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('id, nombre, precio_mxn, max_medicos, max_asistentes_por_medico, max_pacientes, stripe_price_id')
    .eq('activo', true)
    .order('precio_mxn');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precioMxn: Number(p.precio_mxn),
    maxMedicos: p.max_medicos,
    maxAsistentesPorMedico: p.max_asistentes_por_medico,
    maxPacientes: p.max_pacientes,
    tieneStripePriceId: !!p.stripe_price_id,
  }));
}

export interface MetodoPagoUI {
  marca: string | null;
  ultimos4: string | null;
  venceMes: number | null;
  venceAnio: number | null;
}

export async function fetchMetodoPago(clinicaId: string): Promise<MetodoPagoUI | null> {
  const { data, error } = await supabase
    .from('metodos_pago')
    .select('marca, ultimos_4, vence_mes, vence_anio')
    .eq('clinica_id', clinicaId)
    .eq('es_default', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { marca: data.marca, ultimos4: data.ultimos_4, venceMes: data.vence_mes, venceAnio: data.vence_anio };
}

/** Abre Stripe Checkout para suscribirse o cambiar de plan. Devuelve la URL a la que redirigir. */
export async function crearCheckoutSession(clinicaId: string, planId: number, returnUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { clinica_id: clinicaId, plan_id: planId, return_url: returnUrl },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error ?? 'No se pudo iniciar el pago');
  return data.url as string;
}

/** Abre el Customer Portal de Stripe (actualizar tarjeta / cancelar). Devuelve la URL. */
export async function crearPortalSession(clinicaId: string, returnUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: { clinica_id: clinicaId, return_url: returnUrl },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error ?? 'No se pudo abrir el portal de pago');
  return data.url as string;
}
