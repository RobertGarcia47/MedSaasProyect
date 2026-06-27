-- 2026-06-25 — Auditoría de escrituras en RPCs clínicas (NOM-024 §6)
-- Agrega INSERT INTO auditoria con acción 'CREATE' al final de:
--   crear_consulta, crear_receta, crear_informe
-- Mismo patrón seguro que usan las RPCs de lectura: usa SELECT desde expedientes
-- para derivar clinica_id → si el usuario no tiene acceso al expediente, 0 filas = sin registro.
-- No cambia ninguna lógica de negocio ni firmas de las funciones.

-- ── 1. crear_consulta ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.crear_consulta(
  p_expediente_id          uuid,
  p_motivo                 text    DEFAULT NULL,
  p_notas                  text    DEFAULT NULL,
  p_peso                   numeric DEFAULT NULL,
  p_talla                  numeric DEFAULT NULL,
  p_ta_sis                 integer DEFAULT NULL,
  p_ta_dia                 integer DEFAULT NULL,
  p_fc                     integer DEFAULT NULL,
  p_temp                   numeric DEFAULT NULL,
  p_fr                     integer DEFAULT NULL,
  p_spo2                   integer DEFAULT NULL,
  p_glucosa                numeric DEFAULT NULL,
  p_perimetro_abdominal    numeric DEFAULT NULL,
  p_grasa_corporal_pct     numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica uuid;
  v_id      uuid;
BEGIN
  SELECT clinica_id INTO v_clinica FROM expedientes WHERE id = p_expediente_id;

  INSERT INTO consultas (
    expediente_id, clinica_id, medico_id,
    peso_kg, talla_cm, ta_sistolica, ta_diastolica, fc, temp_c,
    fr, spo2, glucosa, perimetro_abdominal_cm, grasa_corporal_pct,
    motivo_enc, notas_enc
  ) VALUES (
    p_expediente_id, v_clinica, auth.uid(),
    p_peso, p_talla, p_ta_sis, p_ta_dia, p_fc, p_temp,
    p_fr, p_spo2, p_glucosa, p_perimetro_abdominal, p_grasa_corporal_pct,
    encrypt_text(p_motivo), encrypt_text(p_notas)
  )
  RETURNING id INTO v_id;

  -- Auditoría de escritura (NOM-024 §6)
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica, auth.uid(), 'CREATE', 'consultas', v_id
  WHERE v_clinica IS NOT NULL;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric)
  TO authenticated, service_role;


-- ── 2. crear_receta ──────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.crear_receta(uuid, text, text, jsonb, uuid, date);

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

  -- Auditoría de escritura (NOM-024 §6)
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica, auth.uid(), 'CREATE', 'recetas', v_receta
  WHERE v_clinica IS NOT NULL;

  RETURN v_receta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_receta(uuid, text, text, jsonb, uuid, date)
  TO authenticated, service_role;


-- ── 3. crear_informe ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.crear_informe(uuid, tipo_informe, text, text, uuid, text, text[], date);

CREATE OR REPLACE FUNCTION public.crear_informe(
  p_expediente_id  uuid,
  p_tipo           tipo_informe,
  p_titulo         text,
  p_cuerpo         text       DEFAULT NULL,
  p_consulta_id    uuid       DEFAULT NULL,
  p_visibilidad    text       DEFAULT 'expediente',
  p_tags           text[]     DEFAULT '{}',
  p_fecha_informe  date       DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica_id  uuid;
  v_medico_id   uuid;
  v_informe_id  uuid;
  v_cuerpo_enc  bytea;
  v_folio_num   integer;
BEGIN
  SELECT clinica_id INTO v_clinica_id
    FROM expedientes WHERE id = p_expediente_id;

  v_medico_id := auth.uid();

  IF p_cuerpo IS NOT NULL AND trim(p_cuerpo) <> '' THEN
    v_cuerpo_enc := encrypt_text(p_cuerpo);
  END IF;

  -- Incremento atómico del contador personal del médico.
  INSERT INTO public.informes_folios (medico_id, ultimo_folio)
    VALUES (v_medico_id, 1)
  ON CONFLICT (medico_id) DO UPDATE
    SET ultimo_folio = informes_folios.ultimo_folio + 1
  RETURNING ultimo_folio INTO v_folio_num;

  INSERT INTO public.informes
    (clinica_id, expediente_id, consulta_id, medico_id,
     tipo, titulo, cuerpo_enc,
     visibilidad, tags, fecha_informe, folio_num)
  VALUES
    (v_clinica_id, p_expediente_id, p_consulta_id, v_medico_id,
     p_tipo, p_titulo, v_cuerpo_enc,
     p_visibilidad, p_tags, p_fecha_informe, v_folio_num)
  RETURNING id INTO v_informe_id;

  -- Auditoría de escritura (NOM-024 §6)
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica_id, auth.uid(), 'CREATE', 'informes', v_informe_id
  WHERE v_clinica_id IS NOT NULL;

  RETURN v_informe_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_informe(uuid, tipo_informe, text, text, uuid, text, text[], date)
  TO authenticated, service_role;
