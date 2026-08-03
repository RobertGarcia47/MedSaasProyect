// Edge Function: create-checkout-session
// El owner de una clínica pide suscribirse (o cambiar de plan) — crea una
// Stripe Checkout Session en modo "subscription" y devuelve la URL a la que
// el frontend debe redirigir. Nunca escribe en `suscripciones` directamente:
// eso lo hace stripe-webhook cuando Stripe confirma que el pago se completó.

import { corsHeaders } from '../_shared/cors.ts';
import { requireOwner } from '../_shared/auth.ts';
import { stripe, supabaseAdmin } from '../_shared/stripe.ts';

interface Body {
  clinica_id: string;
  plan_id: number;
  return_url: string; // window.location.origin del frontend — no se hardcodea ningún dominio aquí
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Partial<Body>;
    const { clinica_id, plan_id, return_url } = body;
    if (!clinica_id || !plan_id || !return_url) {
      return new Response(JSON.stringify({ error: 'clinica_id, plan_id y return_url son requeridos' }), {
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

    // Precio de Stripe para el plan elegido (sql/2026-07-30_billing_schema.sql agregó
    // plans.stripe_price_id — hay que llenarlo a mano en el dashboard de Stripe/SQL
    // antes de que esta función funcione de verdad).
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('stripe_price_id')
      .eq('id', plan_id)
      .eq('activo', true)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan?.stripe_price_id) {
      return new Response(JSON.stringify({ error: 'Este plan todavía no tiene un precio de Stripe configurado (plans.stripe_price_id)' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Si la clínica ya tuvo un Stripe Customer antes (ej. se le canceló y vuelve a
    // suscribirse), lo reusamos para no duplicar customers en Stripe.
    const { data: existente } = await supabaseAdmin
      .from('suscripciones')
      .select('gateway_customer_id')
      .eq('clinica_id', clinica_id)
      .not('gateway_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      // client_reference_id es cómo el webhook sabe a qué clínica pertenece esta
      // sesión — la suscripción todavía no existe en Stripe en este punto.
      client_reference_id: clinica_id,
      customer: existente?.gateway_customer_id ?? undefined,
      customer_email: existente?.gateway_customer_id ? undefined : (owner.email ?? undefined),
      subscription_data: { metadata: { clinica_id } },
      metadata: { clinica_id, plan_id: String(plan_id) },
      success_url: `${return_url}?checkout=success`,
      cancel_url: `${return_url}?checkout=cancelado`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('create-checkout-session:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
