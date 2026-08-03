-- ============================================================================
-- MedSaaS — Suscripciones con Stripe: schema + cierre de un hueco de RLS real
-- Fecha: 2026-07-30
-- ----------------------------------------------------------------------------
-- Diagnóstico previo (sql/2026-07-30_diagnostico_billing.sql +
-- sql/2026-07-30_diagnostico_enum_status.sql) confirmó:
--   - `suscripciones` tiene la policy "susc_owner" FOR ALL USING/WITH CHECK
--     es_owner(clinica_id) — HOY cualquier dueño de clínica puede hacer UPDATE
--     directo a su propia fila (status/periodo_fin) desde el navegador y
--     regalarse acceso pagado sin pagar. Se cierra abajo.
--   - `metodos_pago` tiene el mismo problema con "pago_owner" FOR ALL.
--   - `status_suscripcion` (enum) = trial | activa | cancelada | morosa.
--   - `plans` ya viene sembrado con 3 filas reales (Básico/Pro/Premium).
-- ============================================================================

-- 1. trial_config — una sola fila, editable a mano por SQL (sin panel todavía).
--    Controla cuántos días de trial reciben las clínicas que se registren de
--    aquí en adelante (medsaas-onboarding-multi-tenant la lee en vez de tener
--    90 hardcodeado). Default 90 = mismo valor que hoy, no cambia nada al
--    aplicar este script.
CREATE TABLE IF NOT EXISTS public.trial_config (
  id         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dias_trial int NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.trial_config (id, dias_trial) VALUES (1, 90)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.trial_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trial_config_select" ON public.trial_config;
CREATE POLICY "trial_config_select" ON public.trial_config
  FOR SELECT TO authenticated USING (true);
-- Sin INSERT/UPDATE/DELETE de cliente — se edita a mano desde el SQL Editor.

-- 2. Columnas nuevas para el flujo de Stripe.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS gracia_hasta timestamptz;

-- 3. Idempotencia de webhooks (un evento de Stripe puede reintentarse/duplicarse).
CREATE TABLE IF NOT EXISTS public.webhook_events_procesados (
  event_id     text PRIMARY KEY,
  procesado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_events_procesados ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo la Edge Function (service_role) la toca, nunca el cliente.

-- 4. Cierre del hueco de RLS en suscripciones.
--    Se reemplaza "susc_owner" (ALL) por:
--    - SELECT: la que ya existe (suscripciones_select_miembros, es_miembro) se
--      deja igual — cualquier miembro de la clínica puede ver su suscripción.
--    - INSERT: el owner solo puede crear la fila del trial inicial (status
--      'trial', periodo_fin acotado por trial_config.dias_trial, y solo si la
--      clínica no tiene ya ninguna fila — evita "resetear" el trial
--      re-insertando). Cubre exactamente el INSERT que ya hace hoy el
--      onboarding, sin más.
--    - Sin UPDATE ni DELETE de cliente: status/periodo_fin/gateway_*/
--      gracia_hasta de aquí en adelante los tocan solo las Edge Functions,
--      que usan la service_role key (ignora RLS por diseño).
DROP POLICY IF EXISTS "susc_owner" ON public.suscripciones;

DROP POLICY IF EXISTS "suscripciones_insert_trial" ON public.suscripciones;
CREATE POLICY "suscripciones_insert_trial" ON public.suscripciones
  FOR INSERT TO authenticated
  WITH CHECK (
    es_owner(clinica_id)
    AND status = 'trial'
    AND periodo_fin <= periodo_inicio
        + ((SELECT dias_trial FROM public.trial_config WHERE id = 1) || ' days')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.suscripciones s2 WHERE s2.clinica_id = suscripciones.clinica_id
    )
  );

-- 5. Cierre del mismo hueco en metodos_pago — el owner solo puede VER su
--    método de pago (para mostrarlo en la pestaña Suscripción); escribirlo es
--    exclusivo del webhook (refleja lo que Stripe reporta, el cliente nunca
--    debe poder inventarse una tarjeta "verificada").
DROP POLICY IF EXISTS "pago_owner" ON public.metodos_pago;

DROP POLICY IF EXISTS "metodos_pago_select" ON public.metodos_pago;
CREATE POLICY "metodos_pago_select" ON public.metodos_pago
  FOR SELECT TO authenticated USING (es_owner(clinica_id));

-- Fin del script.
