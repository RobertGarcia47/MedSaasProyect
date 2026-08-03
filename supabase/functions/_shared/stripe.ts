// Cliente de Stripe compartido — Deno necesita su propio HTTP client (no el de
// Node) y su propio crypto provider para verificar firmas de webhook.
import Stripe from 'npm:stripe@17';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

// Usado solo por stripe-webhook para verificar la firma con constructEventAsync
// (Deno no tiene el crypto síncrono que usa el SDK por default en Node).
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Cliente de Supabase con la service_role key — bypassa RLS a propósito, es el
// único lugar autorizado a escribir status/periodo_fin/gateway_*/gracia_hasta.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
