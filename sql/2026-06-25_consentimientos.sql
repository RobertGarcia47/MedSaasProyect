-- 2026-06-25 — Consentimiento informado (NOM-004 §10.1)
-- Implementación: consentimiento TÁCITO automático al crear el expediente.
-- El paciente proporcionó sus datos voluntariamente → consentimiento implícito.
-- Pendiente: complementar con PDF firmado cuando esté disponible la API .NET.
--
-- Flujo: createPaciente (frontend) → INSERT expedientes → trigger → INSERT consentimientos
-- El médico no necesita hacer nada extra.

-- ── 1. Tabla consentimientos ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consentimientos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id      uuid        NOT NULL REFERENCES public.clinicas(id),
  expediente_id   uuid        NOT NULL REFERENCES public.expedientes(id),
  tipo            text        NOT NULL DEFAULT 'general',   -- 'general' | 'procedimiento'
  metodo          text        NOT NULL DEFAULT 'tacito',    -- 'tacito' | 'firmado'
  registrado_por  uuid        REFERENCES public.profiles(id),
  registrado_en   timestamptz NOT NULL DEFAULT now(),
  notas           text,
  documento_url   text,       -- null hasta tener API .NET; se llenará con la URL del PDF firmado
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consentimientos ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro de la clínica puede ver los consentimientos
DROP POLICY IF EXISTS "consentimientos_select" ON public.consentimientos;
CREATE POLICY "consentimientos_select"
  ON public.consentimientos FOR SELECT TO authenticated
  USING (es_miembro(clinica_id));

-- INSERT: solo vía trigger (SECURITY DEFINER) — bloqueado desde cliente
DROP POLICY IF EXISTS "consentimientos_insert" ON public.consentimientos;
CREATE POLICY "consentimientos_insert"
  ON public.consentimientos FOR INSERT TO authenticated
  WITH CHECK (es_miembro(clinica_id));

-- UPDATE: solo owner puede añadir el documento_url cuando llegue el PDF
DROP POLICY IF EXISTS "consentimientos_update" ON public.consentimientos;
CREATE POLICY "consentimientos_update"
  ON public.consentimientos FOR UPDATE TO authenticated
  USING (es_owner(clinica_id))
  WITH CHECK (es_owner(clinica_id));

-- DELETE: bloqueado siempre (el consentimiento es un registro legal)
DROP POLICY IF EXISTS "consentimientos_no_delete" ON public.consentimientos;
CREATE POLICY "consentimientos_no_delete"
  ON public.consentimientos AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

GRANT SELECT, INSERT, UPDATE ON public.consentimientos TO authenticated, service_role;

-- ── 2. Trigger: consentimiento tácito al crear expediente ────────────────────

CREATE OR REPLACE FUNCTION public.fn_consentimiento_tacito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.consentimientos (
    clinica_id,
    expediente_id,
    tipo,
    metodo,
    registrado_por,
    notas
  ) VALUES (
    NEW.clinica_id,
    NEW.id,
    'general',
    'tacito',
    auth.uid(),
    'Consentimiento tácito: el paciente proporcionó sus datos voluntariamente para la creación de su expediente clínico electrónico. Pendiente complementar con documento físico o PDF firmado si se requiere.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consentimiento_tacito ON public.expedientes;
CREATE TRIGGER trg_consentimiento_tacito
  AFTER INSERT ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_consentimiento_tacito();

-- ── Verificación ──────────────────────────────────────────────────────────────
-- Da de alta un paciente nuevo desde la app y luego corre:
--
-- SELECT c.tipo, c.metodo, c.registrado_en, c.notas, c.documento_url,
--        e.id AS expediente_id
-- FROM consentimientos c
-- JOIN expedientes e ON e.id = c.expediente_id
-- ORDER BY c.created_at DESC LIMIT 5;
