// Edge Function: create-portal-session
// El owner quiere actualizar su tarjeta o cancelar — lo mandamos al Customer
// Portal de Stripe (hospedado por Stripe, no hay que construir esa UI).

import { corsHeaders } from '../_shared/cors.ts';
import { requireOwner } from '../_shared/auth.ts';
import { stripe, supabaseAdmin } from '../_shared/stripe.ts';

interface Body {
  clinica_id: string;
  return_url: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Partial<Body>;
    const { clinica_id, return_url } = body;
    if (!clinica_id || !return_url) {
      return new Response(JSON.stringify({ error: 'clinica_id y return_url son requeridos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const owner = await requireOwner(req, clinica_id);
    if (!owner) {
      return new Response(JSON.stringify({ error: 'No autorizado — debes ser el propietario de la clínica' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: susc, error } = await supabaseAdmin
      .from('suscripciones')
      .select('gateway_customer_id')
      .eq('clinica_id', clinica_id)
      .not('gateway_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!susc?.gateway_customer_id) {
      return new Response(JSON.stringify({ error: 'Esta clínica todavía no tiene una suscripción de pago activa' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: susc.gateway_customer_id,
      return_url,
    });

    return new Response(JSON.stringify({ url: portal.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('create-portal-session:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
