-- 2026-06-22 — Folio real en recetas + columna fecha_receta
-- Mismo patrón que 2026-06-22_informes_folio.sql:
--   folio secuencial POR MÉDICO, contador en tabla recetas_folios.
-- Además se agrega fecha_receta (date) que el frontend ya capturaba
-- pero no persiste en la DB.

-- ── 1. Tabla contador de folios por médico ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recetas_folios (
  medico_id    uuid    PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ultimo_folio integer NOT NULL DEFAULT 0
);

ALTER TABLE public.recetas_folios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rfol_own" ON public.recetas_folios;
CREATE POLICY "rfol_own" ON public.recetas_folios
  FOR ALL TO authenticated
  USING   (medico_id = auth.uid())
  WITH CHECK (medico_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.recetas_folios TO authenticated, service_role;

-- ── 2. Columnas nuevas en recetas ────────────────────────────────────────────
ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS fecha_receta date,
  ADD COLUMN IF NOT EXISTS folio_num    integer;

-- ── 3. Recrear crear_receta con fecha_receta y folio por médico ───────────────
DROP FUNCTION IF EXISTS public.crear_receta(uuid, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.crear_receta(
  p_expediente_id     uuid,
  p_diagnostico_cie10 text  DEFAULT NULL,
  p_indicaciones      text  DEFAULT NULL,
  p_medicamentos      jsonb DEFAULT '[]'::jsonb,
  p_consulta_id       uuid  DEFAULT NULL,
  p_fecha_receta      date  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica   uuid;
  v_receta    uuid;
  v_med       jsonb;
  v_folio_num integer;
BEGIN
  SELECT clinica_id INTO v_clinica FROM expedientes WHERE id = p_expediente_id;

  -- Incremento atómico del contador personal del médico.
  INSERT INTO public.recetas_folios (medico_id, ultimo_folio)
    VALUES (auth.uid(), 1)
  ON CONFLICT (medico_id) DO UPDATE
    SET ultimo_folio = recetas_folios.ultimo_folio + 1
  RETURNING ultimo_folio INTO v_folio_num;

  INSERT INTO recetas (clinica_id, expediente_id, consulta_id, medico_id,
                       diagnostico_cie10, indicaciones_enc, fecha_receta, folio_num)
  VALUES (v_clinica, p_expediente_id, p_consulta_id, auth.uid(),
          p_diagnostico_cie10,
          CASE WHEN p_indicaciones IS NULL OR p_indicaciones = '' THEN NULL
               ELSE encrypt_text(p_indicaciones) END,
          p_fecha_receta,
          v_folio_num)
  RETURNING id INTO v_receta;

  FOR v_med IN SELECT * FROM jsonb_array_elements(COALESCE(p_medicamentos, '[]'::jsonb))
  LOOP
    INSERT INTO receta_medicamentos (receta_id, clinica_id, medicamento, dosis,
                                     frecuencia, duracion, via, instrucciones, controlado)
    VALUES (v_receta, v_clinica,
            v_med->>'medicamento', v_med->>'dosis', v_med->>'frecuencia',
            v_med->>'duracion',    v_med->>'via',   v_med->>'instrucciones',
            COALESCE((v_med->>'controlado')::boolean, false));
  END LOOP;

  RETURN v_receta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_receta(uuid, text, text, jsonb, uuid, date)
  TO authenticated, service_role;

-- ── 4. Recrear obtener_recetas devolviendo fecha_receta y folio_num ───────────
DROP FUNCTION IF EXISTS public.obtener_recetas(uuid);

CREATE OR REPLACE FUNCTION public.obtener_recetas(p_expediente_id uuid)
RETURNS TABLE (
  id                uuid,
  consulta_id       uuid,
  medico_id         uuid,
  diagnostico_cie10 text,
  indicaciones      text,
  medicamentos      jsonb,
  fecha_receta      date,
  folio_num         integer,
  created_at        timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT e.clinica_id, auth.uid(), 'READ', 'recetas', e.id
  FROM expedientes e WHERE e.id = p_expediente_id;

  RETURN QUERY
  SELECT r.id, r.consulta_id, r.medico_id, r.diagnostico_cie10,
         CASE WHEN r.indicaciones_enc IS NULL THEN NULL
              ELSE decrypt_text(r.indicaciones_enc) END,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'medicamento', m.medicamento, 'dosis', m.dosis,
                    'frecuencia', m.frecuencia, 'duracion', m.duracion, 'via', m.via,
                    'instrucciones', m.instrucciones, 'controlado', m.controlado))
           FROM receta_medicamentos m WHERE m.receta_id = r.id
         ), '[]'::jsonb),
         r.fecha_receta,
         r.folio_num,
         r.created_at
  FROM recetas r
  WHERE r.expediente_id = p_expediente_id
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_recetas(uuid) TO authenticated, service_role;
