-- 2026-09-28 — Fase 3 de adaptación a salud mental (psicología/psiquiatría)
-- Dos piezas independientes entre sí:
--   1. Plan de tratamiento — objeto a nivel EXPEDIENTE (no por consulta), mismo
--      patrón exacto que antecedentes médicos (sql/2026-06-18_antecedentes_rpcs.sql):
--      JSON cifrado en una columna de `expedientes`, RPCs SECURITY INVOKER,
--      autorización vía la RLS de `expedientes` ya existente.
--   2. Notas de proceso privadas — tabla NUEVA con su PROPIA RLS restringida al
--      autor: a diferencia de todo lo demás en la app (que es visible a toda la
--      clínica), esto no lo ve nadie más que quien la escribió, ni el owner ni
--      un asistente. A propósito NO se inserta en `auditoria`: incluso que
--      "existe una nota privada en esta consulta" es información que no debe
--      llegar a quien audita la clínica. Tampoco es inmutable como consultas/
--      recetas/informes (sql/2026-06-25_inmutabilidad_registros.sql) — al ser
--      un apunte personal fuera del expediente legal, sí se puede editar.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Plan de tratamiento (a nivel expediente)
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS plan_tratamiento_enc bytea;

CREATE OR REPLACE FUNCTION public.guardar_plan_tratamiento(
  p_expediente_id   uuid,
  p_objetivos       text DEFAULT NULL,
  p_intervenciones  text DEFAULT NULL,
  p_frecuencia      text DEFAULT NULL,
  p_fecha_revision  date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $fn_guardar_plan$
DECLARE
  v_json text;
BEGIN
  v_json := jsonb_build_object(
    'objetivos',      coalesce(p_objetivos, ''),
    'intervenciones', coalesce(p_intervenciones, ''),
    'frecuencia',      coalesce(p_frecuencia, ''),
    'fecha_revision', p_fecha_revision
  )::text;

  UPDATE public.expedientes
     SET plan_tratamiento_enc = encrypt_text(v_json)
   WHERE id = p_expediente_id;   -- RLS de expedientes valida el UPDATE

  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT e.clinica_id, auth.uid(), 'UPDATE', 'expedientes', e.id
  FROM public.expedientes e WHERE e.id = p_expediente_id;
END;
$fn_guardar_plan$;

GRANT EXECUTE ON FUNCTION public.guardar_plan_tratamiento(uuid, text, text, text, date) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.obtener_plan_tratamiento(uuid);

CREATE OR REPLACE FUNCTION public.obtener_plan_tratamiento(p_expediente_id uuid)
RETURNS TABLE (
  objetivos       text,
  intervenciones  text,
  frecuencia      text,
  fecha_revision  date
)
LANGUAGE plpgsql
AS $fn_obtener_plan$
DECLARE
  v_json jsonb;
BEGIN
  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT e.clinica_id, auth.uid(), 'READ', 'expedientes', e.id
  FROM public.expedientes e WHERE e.id = p_expediente_id;

  SELECT CASE WHEN e.plan_tratamiento_enc IS NULL THEN NULL
              ELSE decrypt_text(e.plan_tratamiento_enc)::jsonb END
    INTO v_json
  FROM public.expedientes e
  WHERE e.id = p_expediente_id;   -- RLS filtra

  RETURN QUERY SELECT
    coalesce(v_json->>'objetivos', ''),
    coalesce(v_json->>'intervenciones', ''),
    coalesce(v_json->>'frecuencia', ''),
    (v_json->>'fecha_revision')::date;
END;
$fn_obtener_plan$;

GRANT EXECUTE ON FUNCTION public.obtener_plan_tratamiento(uuid) TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Notas de proceso privadas (a nivel consulta, solo el autor las ve)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.consulta_notas_privadas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id  uuid NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
  clinica_id   uuid NOT NULL,
  autor_id     uuid NOT NULL DEFAULT auth.uid(),
  nota_enc     bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consulta_id, autor_id)
);

ALTER TABLE public.consulta_notas_privadas ENABLE ROW LEVEL SECURITY;

-- Única política: el autor y nadie más, para las 4 operaciones. Sin excepción
-- para 'owner' — a propósito, es justo el punto de esta tabla.
DROP POLICY IF EXISTS notas_privadas_solo_autor ON public.consulta_notas_privadas;
CREATE POLICY notas_privadas_solo_autor
  ON public.consulta_notas_privadas
  FOR ALL
  USING (autor_id = auth.uid())
  WITH CHECK (autor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guardar_nota_privada(p_consulta_id uuid, p_nota text)
RETURNS void
LANGUAGE plpgsql
AS $fn_guardar_nota$
DECLARE
  v_clinica uuid;
BEGIN
  SELECT clinica_id INTO v_clinica FROM public.consultas WHERE id = p_consulta_id;

  INSERT INTO public.consulta_notas_privadas (consulta_id, clinica_id, autor_id, nota_enc, updated_at)
  VALUES (p_consulta_id, v_clinica, auth.uid(), encrypt_text(p_nota), now())
  ON CONFLICT (consulta_id, autor_id) DO UPDATE
    SET nota_enc = excluded.nota_enc, updated_at = now();
END;
$fn_guardar_nota$;

GRANT EXECUTE ON FUNCTION public.guardar_nota_privada(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.obtener_nota_privada(p_consulta_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $fn_obtener_nota$
DECLARE
  v_nota bytea;
BEGIN
  SELECT nota_enc INTO v_nota
  FROM public.consulta_notas_privadas
  WHERE consulta_id = p_consulta_id;   -- la RLS ya limita a autor_id = auth.uid()

  IF v_nota IS NULL THEN RETURN NULL; END IF;
  RETURN decrypt_text(v_nota);
END;
$fn_obtener_nota$;

GRANT EXECUTE ON FUNCTION public.obtener_nota_privada(uuid) TO authenticated, service_role;
