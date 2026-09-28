-- 2026-09-28 — Fase 2 de adaptación a salud mental (psicología/psiquiatría)
-- Agrega a `consultas` 3 columnas jsonb nuevas y las suma a crear_consulta /
-- obtener_consultas. Se reescriben ambas funciones completas para no perder
-- el sello de autoría (firmado_por_cedula/firmado_en/firma_hash, NOM-024 §6)
-- ni la auditoría de escritura/lectura que ya tenían — solo se agregan
-- columnas y parámetros nuevos al final, todos opcionales (DEFAULT NULL), así
-- que no rompe ninguna llamada existente sin estos campos.

-- ── 1. Columnas nuevas ────────────────────────────────────────────────────────
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS estado_mental    jsonb,  -- Mental Status Exam (8 dominios), solo psicología/psiquiatría
  ADD COLUMN IF NOT EXISTS tamizaje_riesgo  jsonb,  -- { ideacion_suicida, autolesion, notas }
  ADD COLUMN IF NOT EXISTS escalas          jsonb;  -- { phq9: {respuestas,total}, gad7: {respuestas,total} }

-- ── 2. Recrear crear_consulta con los 3 campos nuevos ─────────────────────────
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
  p_grasa_corporal_pct     numeric DEFAULT NULL,
  p_estado_mental          jsonb   DEFAULT NULL,
  p_tamizaje_riesgo        jsonb   DEFAULT NULL,
  p_escalas                jsonb   DEFAULT NULL
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
    firmado_por_cedula, firmado_en, firma_hash,
    estado_mental, tamizaje_riesgo, escalas
  ) VALUES (
    p_expediente_id, v_clinica, auth.uid(),
    p_peso, p_talla, p_ta_sis, p_ta_dia, p_fc, p_temp,
    p_fr, p_spo2, p_glucosa, p_perimetro_abdominal, p_grasa_corporal_pct,
    encrypt_text(p_motivo), encrypt_text(p_notas),
    v_cedula, v_ts, v_hash,
    p_estado_mental, p_tamizaje_riesgo, p_escalas
  )
  RETURNING id INTO v_id;

  -- Auditoría de escritura (NOM-024 §6)
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica, auth.uid(), 'CREATE', 'consultas', v_id
  WHERE v_clinica IS NOT NULL;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

-- ── 3. Recrear obtener_consultas devolviendo los 3 campos nuevos ─────────────
DROP FUNCTION IF EXISTS public.obtener_consultas(uuid);

CREATE OR REPLACE FUNCTION public.obtener_consultas(p_expediente_id uuid)
RETURNS TABLE (
  id                      uuid,
  fecha                   timestamptz,
  medico_id               uuid,
  peso_kg                 numeric,
  talla_cm                numeric,
  ta_sistolica            integer,
  ta_diastolica           integer,
  fc                      integer,
  temp_c                  numeric,
  fr                      integer,
  spo2                    integer,
  glucosa                 numeric,
  perimetro_abdominal_cm  numeric,
  grasa_corporal_pct      numeric,
  motivo                  text,
  notas                   text,
  estado_mental           jsonb,
  tamizaje_riesgo         jsonb,
  escalas                 jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT e.clinica_id, auth.uid(), 'READ', 'expedientes', e.id
  FROM expedientes e WHERE e.id = p_expediente_id;

  RETURN QUERY
  SELECT c.id, c.fecha, c.medico_id,
         c.peso_kg, c.talla_cm, c.ta_sistolica, c.ta_diastolica,
         c.fc, c.temp_c,
         c.fr, c.spo2, c.glucosa, c.perimetro_abdominal_cm, c.grasa_corporal_pct,
         decrypt_text(c.motivo_enc), decrypt_text(c.notas_enc),
         c.estado_mental, c.tamizaje_riesgo, c.escalas
  FROM consultas c
  WHERE c.expediente_id = p_expediente_id
  ORDER BY c.fecha DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_consultas(uuid) TO authenticated, service_role;
