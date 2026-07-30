-- ============================================================================
-- MedSaaS — Lista de espera para adelanto de citas ("Oportunidades")
-- Fecha: 2026-07-30
-- ----------------------------------------------------------------------------
-- Feature: un paciente con una cita ya agendada puede pedir "avísenme si se
-- libera algo antes" (mismo médico únicamente). Cuando se cancela una cita, si
-- hay candidatos esperando un hueco más cercano de ESE médico, se les ofrece
-- el hueco — la asignación siempre la decide el personal, nunca es automática.
--
-- Diagnóstico previo confirmado (sql/2026-07-30_diagnostico_citas_policies.sql):
-- las 4 políticas de `citas` son es_miembro(clinica_id) sin distinción por
-- médico (nada de medico_asistentes aplica a citas) — se mirrorea ese mismo
-- patrón aquí, no se adivina.
-- ============================================================================

-- 1. Flag en la cita ya agendada: "avísenme si se libera algo antes".
ALTER TABLE public.citas
  ADD COLUMN IF NOT EXISTS acepta_adelanto boolean NOT NULL DEFAULT false;

-- 2. Tabla de oportunidades — una fila por hueco liberado que tuvo al menos
--    un candidato en el momento de la cancelación. Estado explícito
--    (abierta/asignada/descartada) para poder distinguir "nadie la ha
--    resuelto todavía" de "se revisó y no se usó", y para el badge de
--    Dashboard, que solo cuenta 'abierta'.
CREATE TABLE IF NOT EXISTS public.oportunidades_citas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id        uuid NOT NULL REFERENCES public.clinicas(id)  ON DELETE CASCADE,
  medico_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  fecha             timestamptz NOT NULL,            -- inicio del hueco liberado
  duracion_min      integer NOT NULL DEFAULT 30,
  origen_cita_id    uuid REFERENCES public.citas(id) ON DELETE SET NULL,
  estado            text NOT NULL DEFAULT 'abierta'
                      CHECK (estado IN ('abierta', 'asignada', 'descartada')),
  cita_asignada_id  uuid REFERENCES public.citas(id) ON DELETE SET NULL,
  creada_por        uuid REFERENCES public.profiles(id),
  creada_en         timestamptz NOT NULL DEFAULT now(),
  resuelta_en       timestamptz,
  resuelta_por      uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_oportunidades_clinica_estado
  ON public.oportunidades_citas (clinica_id, estado);
CREATE INDEX IF NOT EXISTS idx_oportunidades_medico
  ON public.oportunidades_citas (medico_id);

-- 3. RLS — mismo patrón que citas (es_miembro(clinica_id), sin distinción por
--    médico, confirmado por diagnóstico).
ALTER TABLE public.oportunidades_citas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oportunidades_select" ON public.oportunidades_citas;
CREATE POLICY "oportunidades_select" ON public.oportunidades_citas
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));

DROP POLICY IF EXISTS "oportunidades_insert" ON public.oportunidades_citas;
CREATE POLICY "oportunidades_insert" ON public.oportunidades_citas
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));

DROP POLICY IF EXISTS "oportunidades_update" ON public.oportunidades_citas;
CREATE POLICY "oportunidades_update" ON public.oportunidades_citas
  FOR UPDATE TO authenticated USING (es_miembro(clinica_id)) WITH CHECK (es_miembro(clinica_id));

-- 4. Auditoría — mismo trigger genérico que ya usan citas/recetas/informes.
DROP TRIGGER IF EXISTS trg_audit_oportunidades ON public.oportunidades_citas;
CREATE TRIGGER trg_audit_oportunidades
  AFTER INSERT OR UPDATE OR DELETE ON public.oportunidades_citas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- Fin del script.
