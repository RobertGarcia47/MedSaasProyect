-- 2026-06-29 — Múltiples cédulas profesionales por médico (1 a 3, una default)
-- Un médico puede registrar 1 cédula principal (default) + hasta 2 adicionales
-- (para otras especialidades). Total máximo: 3.
--
-- COMPATIBILIDAD: medico_detalles.cedula_profesional sigue reflejando la cédula
-- DEFAULT mediante un trigger de sincronización. Así el sello de autoría
-- (crear_consulta/receta/informe) y el gate de emisión (puedeEmitirClinico),
-- que leen medico_detalles.cedula_profesional, siguen funcionando sin cambios.
--
-- Tabla profile-scoped (1:N con profiles), SIN clinica_id — igual que
-- medico_detalles, porque la cédula pertenece al médico, no a la clínica.

-- ── 1. Tabla ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.medico_cedulas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  cedula          text        NOT NULL CHECK (length(trim(cedula)) > 0),
  especialidad_id integer              REFERENCES public.especialidades(id) ON DELETE SET NULL,
  es_default      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, cedula)            -- no repetir la misma cédula en un médico
);

-- Una sola cédula default por médico
CREATE UNIQUE INDEX IF NOT EXISTS medico_cedulas_one_default
  ON public.medico_cedulas (profile_id)
  WHERE es_default;

CREATE INDEX IF NOT EXISTS medico_cedulas_profile_idx
  ON public.medico_cedulas (profile_id);

-- ── 2. Tope de 3 cédulas por médico ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_medico_cedulas_max3()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.medico_cedulas WHERE profile_id = NEW.profile_id) >= 3 THEN
    RAISE EXCEPTION 'Un médico puede registrar máximo 3 cédulas profesionales';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_medico_cedulas_max3 ON public.medico_cedulas;
CREATE TRIGGER trg_medico_cedulas_max3
  BEFORE INSERT ON public.medico_cedulas
  FOR EACH ROW EXECUTE FUNCTION public.fn_medico_cedulas_max3();

-- ── 3. Sincroniza la cédula DEFAULT → medico_detalles.cedula_profesional ──────
-- Backward-compat: el sello y el gate leen medico_detalles. Cuando cambia la
-- default (insert/update/delete), reflejamos su cédula y especialidad allí.
CREATE OR REPLACE FUNCTION public.fn_sync_cedula_default()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_profile uuid := COALESCE(NEW.profile_id, OLD.profile_id);
  v_cedula  text;
  v_esp     integer;
BEGIN
  SELECT cedula, especialidad_id INTO v_cedula, v_esp
    FROM public.medico_cedulas
    WHERE profile_id = v_profile AND es_default
    LIMIT 1;

  IF v_cedula IS NOT NULL THEN
    UPDATE public.medico_detalles
       SET cedula_profesional = v_cedula,
           especialidad_id    = COALESCE(v_esp, especialidad_id)
     WHERE profile_id = v_profile;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cedula_default ON public.medico_cedulas;
CREATE TRIGGER trg_sync_cedula_default
  AFTER INSERT OR UPDATE OR DELETE ON public.medico_cedulas
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cedula_default();

-- ── 4. Backfill: la cédula actual de cada médico pasa a ser su default ───────
INSERT INTO public.medico_cedulas (profile_id, cedula, especialidad_id, es_default)
SELECT profile_id, cedula_profesional, especialidad_id, true
  FROM public.medico_detalles
  WHERE cedula_profesional IS NOT NULL AND trim(cedula_profesional) <> ''
ON CONFLICT (profile_id, cedula) DO NOTHING;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- El médico gestiona SOLO sus propias cédulas (mismo modelo que medico_detalles).
ALTER TABLE public.medico_cedulas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medico_cedulas_self_select" ON public.medico_cedulas;
CREATE POLICY "medico_cedulas_self_select" ON public.medico_cedulas
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "medico_cedulas_self_insert" ON public.medico_cedulas;
CREATE POLICY "medico_cedulas_self_insert" ON public.medico_cedulas
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "medico_cedulas_self_update" ON public.medico_cedulas;
CREATE POLICY "medico_cedulas_self_update" ON public.medico_cedulas
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "medico_cedulas_self_delete" ON public.medico_cedulas;
CREATE POLICY "medico_cedulas_self_delete" ON public.medico_cedulas
  FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- ── Verificación ─────────────────────────────────────────────────────────────
-- 1) Backfill correcto (cada médico con cédula tiene su default):
--    SELECT profile_id, cedula, especialidad_id, es_default FROM medico_cedulas ORDER BY profile_id;
-- 2) Tope de 3 (debe fallar al insertar la 4ª para un mismo profile_id).
-- 3) Single-default (debe fallar al marcar 2 default en el mismo médico):
--    UPDATE medico_cedulas SET es_default = true WHERE id = '<otra-cedula-del-mismo-medico>';
-- 4) Sincronía: al cambiar la default, medico_detalles.cedula_profesional se actualiza:
--    SELECT profile_id, cedula_profesional FROM medico_detalles;
