// Edge Function: stripe-webhook
// Único lugar que escribe status/periodo_fin/gateway_*/gracia_hasta en
// `suscripciones` (RLS de cliente ya no lo permite, ver
// sql/2026-07-30_billing_schema.sql). Usa service_role a propósito.
//
// Eventos manejados:
//   checkout.session.completed → primera alta: guarda gateway_customer_id/
//     gateway_subscription_id, status='activa', periodo_fin real de Stripe.
//   invoice.paid               → renovación: refresca periodo_fin, status='activa',
//     limpia gracia_hasta.
//   invoice.payment_failed     → status='morosa', gracia_hasta = now()+72h.
//   customer.subscription.deleted → status='cancelada'.
//
// Idempotencia: cada evento de Stripe puede reintentarse/duplicarse — se
// registra su id en webhook_events_procesados y se corta temprano si ya se vio.

import Stripe from 'npm:stripe@17';
import { stripe, cryptoProvider, supabaseAdmin } from '../_shared/stripe.ts';

function toDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().split('T')[0];
}

/** Busca la fila de suscripciones dueña de esta subscription de Stripe. */
async function findByGatewaySubscriptionId(subscriptionId: string) {
  const { data, error } = await supabaseAdmin
    .from('suscripciones')
    .select('id, clinica_id')
    .eq('gateway_subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const rawBody = await req.text(); // crudo, sin parsear — la firma se calcula sobre esto

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error('Falta el header Stripe-Signature');
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error('stripe-webhook: firma inválida:', err);
    return new Response(JSON.stringify({ error: 'Firma inválida' }), { status: 400 });
  }

  // Idempotencia: si ya se procesó este evento, no repetir el efecto.
  const { error: dupError } = await supabaseAdmin
    .from('webhook_events_procesados')
    .insert({ event_id: event.id });
  if (dupError) {
    // Violación de PK = ya lo habíamos procesado antes. Cualquier otro error sí se reporta.
    if ((dupError as { code?: string }).code === '23505') {
      return new Response(JSON.stringify({ ok: true, duplicado: true }), { status: 200 });
    }
    console.error('stripe-webhook: error registrando idempotencia:', dupError);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clinicaId = session.client_reference_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (!clinicaId || !customerId || !subscriptionId) {
          console.error('checkout.session.completed sin clinica_id/customer/subscription', session.id);
          break;
        }
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const { error } = await supabaseAdmin
          .from('suscripciones')
          .update({
            status: 'activa',
            gateway_customer_id: customerId,
            gateway_subscription_id: subscriptionId,
            periodo_fin: toDateStr(sub.current_period_end),
            gracia_hasta: null,
          })
          .eq('clinica_id', clinicaId);
        if (error) throw error;
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subscriptionId) break;
        const row = await findByGatewaySubscriptionId(subscriptionId);
        if (!row) { console.error('invoice.paid: sin suscripcion local para', subscriptionId); break; }
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const { error } = await supabaseAdmin
          .from('suscripciones')
          .update({ status: 'activa', periodo_fin: toDateStr(sub.current_period_end), gracia_hasta: null })
          .eq('id', row.id);
        if (error) throw error;
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subscriptionId) break;
        const row = await findByGatewaySubscriptionId(subscriptionId);
        if (!row) { console.error('invoice.payment_failed: sin suscripcion local para', subscriptionId); break; }
        const graciaHasta = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        const { error } = await supabaseAdmin
          .from('suscripciones')
          .update({ status: 'morosa', gracia_hasta: graciaHasta })
          .eq('id', row.id);
        if (error) throw error;
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const row = await findByGatewaySubscriptionId(sub.id);
        if (!row) { console.error('customer.subscription.deleted: sin suscripcion local para', sub.id); break; }
        const { error } = await supabaseAdmin
          .from('suscripciones')
          .update({ status: 'cancelada' })
          .eq('id', row.id);
        if (error) throw error;
        break;
      }

      default:
        // Evento que no nos interesa — Stripe solo manda los que suscribimos en el
        // dashboard, pero no está de más ignorar silenciosamente el resto.
        break;
    }
  } catch (err) {
    console.error(`stripe-webhook: error procesando ${event.type}:`, err);
    // Si el procesamiento falló, se borra la marca de "ya procesado" que se puso
    // arriba — si no, un reintento legítimo de Stripe (que sí espera que
    // reprocesemos) quedaría descartado para siempre como "duplicado".
    await supabaseAdmin.from('webhook_events_procesados').delete().eq('event_id', event.id);
    return new Response(JSON.stringify({ error: 'Error interno procesando el evento' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
