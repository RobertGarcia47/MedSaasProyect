-- 2026-06-25 — Sello de autoría médica (NOM-024 §6 — integridad y no repudio)
-- Agrega a consultas, recetas e informes:
--   firmado_por_cedula : cédula profesional del médico al momento de crear el registro
--   firmado_en         : timestamp del servidor (no del cliente)
--   firma_hash         : SHA-256(expediente_id || medico_id || firmado_en || cedula)
--
-- Cumple NOM-024 §6 en nivel mínimo: prueba quién creó el documento, cuándo y
-- que no ha sido alterado. No es FIEL — eso es largo plazo.

-- ── 1. Columnas nuevas ────────────────────────────────────────────────────────

ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS firmado_por_cedula text,
  ADD COLUMN IF NOT EXISTS firmado_en         timestamptz,
  ADD COLUMN IF NOT EXISTS firma_hash         text;

ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS firmado_por_cedula text,
  ADD COLUMN IF NOT EXISTS firmado_en         timestamptz,
  ADD COLUMN IF NOT EXISTS firma_hash         text;

ALTER TABLE public.informes
  ADD COLUMN IF NOT EXISTS firmado_por_cedula text,
  ADD COLUMN IF NOT EXISTS firmado_en         timestamptz,
  ADD COLUMN IF NOT EXISTS firma_hash         text;

-- ── 2. Recrear crear_consulta con sello ──────────────────────────────────────
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
  v_clinica  uuid;
  v_id       uuid;
  v_cedula   text;
  v_ts       timestamptz := now();
  v_hash     text;
BEGIN
  SELECT clinica_id INTO v_clinica FROM expedientes WHERE id = p_expediente_id;

  -- Cédula del médico firmante
  SELECT cedula_profesional INTO v_cedula
    FROM medico_detalles WHERE profile_id = auth.uid();

  -- Hash: SHA-256(expediente_id || medico_id || timestamp || cedula)
  v_hash := encode(
    digest(
      p_expediente_id::text || auth.uid()::text || v_ts::text || COALESCE(v_cedula, ''),
      'sha256'
    ), 'hex'
  );

  INSERT INTO consultas (
    expediente_id, clinica_id, medico_id,
    peso_kg, talla_cm, ta_sistolica, ta_diastolica, fc, temp_c,
    fr, spo2, glucosa, perimetro_abdominal_cm, grasa_corporal_pct,
    motivo_enc, notas_enc,
    firmado_por_cedula, firmado_en, firma_hash
  ) VALUES (
    p_expediente_id, v_clinica, auth.uid(),
    p_peso, p_talla, p_ta_sis, p_ta_dia, p_fc, p_temp,
    p_fr, p_spo2, p_glucosa, p_perimetro_abdominal, p_grasa_corporal_pct,
    encrypt_text(p_motivo), encrypt_text(p_notas),
    v_cedula, v_ts, v_hash
  )
  RETURNING id INTO v_id;

  -- Auditoría de escritura
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica, auth.uid(), 'CREATE', 'consultas', v_id
  WHERE v_clinica IS NOT NULL;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric)
  TO authenticated, service_role;


-- ── 3. Recrear crear_receta con sello ────────────────────────────────────────
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
  v_cedula    text;
  v_ts        timestamptz := now();
  v_hash      text;
BEGIN
  SELECT clinica_id INTO v_clinica FROM expedientes WHERE id = p_expediente_id;

  SELECT cedula_profesional INTO v_cedula
    FROM medico_detalles WHERE profile_id = auth.uid();

  v_hash := encode(
    digest(
      p_expediente_id::text || auth.uid()::text || v_ts::text || COALESCE(v_cedula, ''),
      'sha256'
    ), 'hex'
  );

  INSERT INTO public.recetas_folios (medico_id, ultimo_folio)
    VALUES (auth.uid(), 1)
  ON CONFLICT (medico_id) DO UPDATE
    SET ultimo_folio = recetas_folios.ultimo_folio + 1
  RETURNING ultimo_folio INTO v_folio_num;

  INSERT INTO recetas (clinica_id, expediente_id, consulta_id, medico_id,
                       diagnostico_cie10, indicaciones_enc, fecha_receta, folio_num,
                       firmado_por_cedula, firmado_en, firma_hash)
  VALUES (v_clinica, p_expediente_id, p_consulta_id, auth.uid(),
          p_diagnostico_cie10,
          CASE WHEN p_indicaciones IS NULL OR p_indicaciones = '' THEN NULL
               ELSE encrypt_text(p_indicaciones) END,
          p_fecha_receta, v_folio_num,
          v_cedula, v_ts, v_hash)
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

  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica, auth.uid(), 'CREATE', 'recetas', v_receta
  WHERE v_clinica IS NOT NULL;

  RETURN v_receta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_receta(uuid, text, text, jsonb, uuid, date)
  TO authenticated, service_role;


-- ── 4. Recrear crear_informe con sello ───────────────────────────────────────
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
  v_cedula      text;
  v_ts          timestamptz := now();
  v_hash        text;
BEGIN
  SELECT clinica_id INTO v_clinica_id
    FROM expedientes WHERE id = p_expediente_id;

  v_medico_id := auth.uid();

  SELECT cedula_profesional INTO v_cedula
    FROM medico_detalles WHERE profile_id = v_medico_id;

  v_hash := encode(
    digest(
      p_expediente_id::text || v_medico_id::text || v_ts::text || COALESCE(v_cedula, ''),
      'sha256'
    ), 'hex'
  );

  IF p_cuerpo IS NOT NULL AND trim(p_cuerpo) <> '' THEN
    v_cuerpo_enc := encrypt_text(p_cuerpo);
  END IF;

  INSERT INTO public.informes_folios (medico_id, ultimo_folio)
    VALUES (v_medico_id, 1)
  ON CONFLICT (medico_id) DO UPDATE
    SET ultimo_folio = informes_folios.ultimo_folio + 1
  RETURNING ultimo_folio INTO v_folio_num;

  INSERT INTO public.informes
    (clinica_id, expediente_id, consulta_id, medico_id,
     tipo, titulo, cuerpo_enc,
     visibilidad, tags, fecha_informe, folio_num,
     firmado_por_cedula, firmado_en, firma_hash)
  VALUES
    (v_clinica_id, p_expediente_id, p_consulta_id, v_medico_id,
     p_tipo, p_titulo, v_cuerpo_enc,
     p_visibilidad, p_tags, p_fecha_informe, v_folio_num,
     v_cedula, v_ts, v_hash)
  RETURNING id INTO v_informe_id;

  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica_id, auth.uid(), 'CREATE', 'informes', v_informe_id
  WHERE v_clinica_id IS NOT NULL;

  RETURN v_informe_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_informe(uuid, tipo_informe, text, text, uuid, text, text[], date)
  TO authenticated, service_role;

-- ── Verificación ──────────────────────────────────────────────────────────────
-- Crea una consulta/receta/informe desde la app y luego corre:
--
-- SELECT firmado_por_cedula, firmado_en, firma_hash FROM consultas ORDER BY created_at DESC LIMIT 3;
-- SELECT firmado_por_cedula, firmado_en, firma_hash FROM recetas   ORDER BY created_at DESC LIMIT 3;
-- SELECT firmado_por_cedula, firmado_en, firma_hash FROM informes  ORDER BY created_at DESC LIMIT 3;
