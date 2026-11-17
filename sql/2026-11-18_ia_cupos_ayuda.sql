-- ============================================================================
-- MedSaaS — IA: cupos mensuales por plan + reportes del chat de ayuda
-- Fecha: 2026-11-18
-- ----------------------------------------------------------------------------
-- 1. CUPOS. Cada plan trae una bolsa de "créditos de IA" al mes (1 llamada de texto = 1 crédito;
--    el dictado por voz, cuando exista, descontará más). El costo real de una llamada de texto es
--    ~0.05 centavos de dólar (Haiku 5.5), así que los cupos son un tope de seguridad y un
--    diferenciador de plan, no un freno al uso normal.
--
--      Prueba (status = 'trial' o sin plan)   1,000   -> ia_config.creditos_prueba
--      Básico                                  3,000
--      Pro                                    15,000
--      Premium                                40,000
--
--    Todo se cambia con un UPDATE (ver sección 6). El mes se cuenta en hora de Ciudad de México.
--    ia_estado() ahora devuelve también cupo_mes, creditos_mes y renueva_el.
--
-- 2. CHAT DE AYUDA. La conversación no se guarda; solo si el usuario pulsa "Enviar al equipo" se
--    guarda un reporte (tabla ayuda_reportes) con su mensaje y la conversación. No hay notificación
--    automática: los reportes se leen en Supabase (Table Editor > ayuda_reportes).
--
-- Supuestos: existen es_miembro(uuid), es_owner(uuid), plans(id, nombre), suscripciones(clinica_id,
-- plan_id, status) y lo creado por sql/2026-11-17_ia_consentimiento_uso.sql (debe correrse ANTES).
-- ============================================================================

-- ── 1. Créditos por plan ──────────────────────────────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS ia_creditos_mes integer CHECK (ia_creditos_mes IS NULL OR ia_creditos_mes >= 0);

UPDATE public.plans
   SET ia_creditos_mes = CASE
         WHEN lower(nombre) IN ('básico', 'basico') THEN 3000
         WHEN lower(nombre) = 'pro'                 THEN 15000
         WHEN lower(nombre) = 'premium'             THEN 40000
       END
 WHERE ia_creditos_mes IS NULL
   AND lower(nombre) IN ('básico', 'basico', 'pro', 'premium');

-- ── 2. Configuración general (una sola fila) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_config (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),   -- fuerza una sola fila
  creditos_prueba  integer NOT NULL DEFAULT 1000 CHECK (creditos_prueba >= 0),   -- clínicas en prueba o sin plan
  creditos_defecto integer NOT NULL DEFAULT 1000 CHECK (creditos_defecto >= 0)   -- plan sin créditos definidos
);
INSERT INTO public.ia_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.ia_config ENABLE ROW LEVEL SECURITY;   -- sin políticas: solo la lee ia_estado() (SECURITY DEFINER)

-- ── 3. Cada uso lleva su costo en créditos ────────────────────────────────────
ALTER TABLE public.ia_uso
  ADD COLUMN IF NOT EXISTS creditos integer NOT NULL DEFAULT 1 CHECK (creditos >= 0);   -- ayuda = 0

-- ── 4. ia_estado v2 (cambia el tipo de retorno: hay que recrearla) ────────────
DROP FUNCTION IF EXISTS public.ia_estado(uuid);

CREATE FUNCTION public.ia_estado(p_clinica_id uuid)
RETURNS TABLE (
  habilitada             boolean,
  consentimiento_version text,
  consentimiento_at      timestamptz,
  consentimiento_por     text,
  usos_mes               integer,
  usos_5min              integer,
  creditos_mes           integer,
  cupo_mes               integer,
  renueva_el             date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.ia_habilitada,
    c.ia_consentimiento_version,
    c.ia_consentimiento_at,
    NULLIF(btrim(concat_ws(' ', pr.nombre, pr.apellido_paterno)), ''),
    mes.usos,
    reciente.n,
    mes.creditos,
    CASE
      WHEN s.plan_id IS NULL OR s.status::text = 'trial' THEN cfg.creditos_prueba
      ELSE coalesce(pl.ia_creditos_mes, cfg.creditos_defecto)
    END,
    ((ini.mes_local + interval '1 month')::date)
  FROM public.clinicas c
  CROSS JOIN public.ia_config cfg
  CROSS JOIN LATERAL (
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Mexico_City') AS mes_local
  ) ini
  LEFT JOIN public.profiles pr ON pr.id = c.ia_consentimiento_por
  LEFT JOIN LATERAL (
    SELECT su.plan_id, su.status FROM public.suscripciones su WHERE su.clinica_id = c.id LIMIT 1
  ) s ON true
  LEFT JOIN public.plans pl ON pl.id = s.plan_id
  CROSS JOIN LATERAL (
    -- El chat de ayuda ('ayuda', 0 créditos) no cuenta como uso de IA clínica.
    SELECT count(*)::int AS usos, coalesce(sum(u.creditos), 0)::int AS creditos
      FROM public.ia_uso u
     WHERE u.clinica_id = c.id AND u.funcion <> 'ayuda'
       AND u.created_at >= (ini.mes_local AT TIME ZONE 'America/Mexico_City')
  ) mes
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS n
      FROM public.ia_uso u
     WHERE u.clinica_id = c.id AND u.profile_id = auth.uid() AND u.funcion <> 'ayuda'
       AND u.created_at >= now() - interval '5 minutes'
  ) reciente
  WHERE c.id = p_clinica_id AND es_miembro(p_clinica_id);
$$;

REVOKE ALL ON FUNCTION public.ia_estado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_estado(uuid) TO authenticated;

-- ── 5. Reportes del chat de ayuda ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ayuda_reportes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id   uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  tipo         text NOT NULL DEFAULT 'problema' CHECK (tipo IN ('problema', 'sugerencia', 'pregunta')),
  mensaje      text NOT NULL CHECK (length(btrim(mensaje)) > 0 AND length(mensaje) <= 4000),
  conversacion jsonb,                       -- lo que se dijeron el usuario y el asistente (sin datos de pacientes)
  pantalla     text,                        -- en qué pantalla estaba
  estado       text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'en_revision', 'resuelto')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ayuda_reportes_fecha ON public.ayuda_reportes (created_at DESC);

ALTER TABLE public.ayuda_reportes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ayuda_reportes_insert" ON public.ayuda_reportes;
CREATE POLICY "ayuda_reportes_insert" ON public.ayuda_reportes
  FOR INSERT TO authenticated
  WITH CHECK (es_miembro(clinica_id) AND profile_id = auth.uid());

-- Cada quien ve los suyos (el equipo de MedSaaS los lee desde el panel de Supabase, con service_role).
DROP POLICY IF EXISTS "ayuda_reportes_select" ON public.ayuda_reportes;
CREATE POLICY "ayuda_reportes_select" ON public.ayuda_reportes
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

GRANT SELECT, INSERT ON public.ayuda_reportes TO authenticated, service_role;
GRANT UPDATE ON public.ayuda_reportes TO service_role;

-- ── 6. Ajustes y verificación (opcional) ──────────────────────────────────────
-- Cambiar cupos:
--   UPDATE public.plans SET ia_creditos_mes = 5000 WHERE nombre = 'Básico';
--   UPDATE public.ia_config SET creditos_prueba = 500;
-- Ver el estado de una clínica:
--   SELECT * FROM public.ia_estado('<clinica_id>');
-- Leer reportes del chat de ayuda:
--   SELECT created_at, tipo, mensaje, pantalla FROM public.ayuda_reportes ORDER BY created_at DESC;
