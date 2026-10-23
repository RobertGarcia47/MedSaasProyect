-- 2026-10-22 — Especialidad Dentista, Fase 1: examen oral en la consulta
-- Agrega a `consultas` la columna `examen_oral_enc` (bytea, CIFRADA con encrypt_text)
-- y la suma a crear_consulta / obtener_consultas.
--
-- El examen oral es un JSON { tejido_blando, oclusion, atm } (texto libre con chips
-- de opciones rápidas en la UI). A diferencia de estado_mental/tamizaje_riesgo/escalas
-- (jsonb en claro, sql/2026-09-28_salud_mental_consulta.sql), aquí se cifra igual que
-- motivo_enc / notas_enc.
--
-- Va DENTRO del INSERT de la consulta (no en un UPDATE posterior) porque las consultas
-- son inmutables (sql/2026-06-25_inmutabilidad_registros.sql: UPDATE bloqueado).
--
-- Se reescriben ambas funciones completas, igual que en el script de salud mental,
-- para conservar el sello de autoría (firmado_por_cedula/firmado_en/firma_hash,
-- NOM-024 §6) y la auditoría de escritura/lectura. El único parámetro nuevo es el
-- último y es opcional (DEFAULT NULL): no rompe ninguna llamada existente.
--
-- ANTES DE CORRER: comparar las definiciones vigentes en prod con las de
-- 2026-09-28_salud_mental_consulta.sql (ver consulta de verificación en el mensaje
-- de la sesión): select pg_get_functiondef('public.crear_consulta(...)'::regprocedure).

-- ── 1. Columna nueva ──────────────────────────────────────────────────────────
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS examen_oral_enc bytea;  -- JSON cifrado { tejido_blando, oclusion, atm }; solo dentistas

-- ── 2. Recrear crear_consulta con p_examen_oral ───────────────────────────────
DROP FUNCTION IF EXISTS public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric, jsonb, jsonb, jsonb);

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
  p_escalas                jsonb   DEFAULT NULL,
  p_examen_oral            jsonb   DEFAULT NULL
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
    estado_mental, tamizaje_riesgo, escalas,
    examen_oral_enc
  ) VALUES (
    p_expediente_id, v_clinica, auth.uid(),
    p_peso, p_talla, p_ta_sis, p_ta_dia, p_fc, p_temp,
    p_fr, p_spo2, p_glucosa, p_perimetro_abdominal, p_grasa_corporal_pct,
    encrypt_text(p_motivo), encrypt_text(p_notas),
    v_cedula, v_ts, v_hash,
    p_estado_mental, p_tamizaje_riesgo, p_escalas,
    CASE WHEN p_examen_oral IS NULL THEN NULL ELSE encrypt_text(p_examen_oral::text) END
  )
  RETURNING id INTO v_id;

  -- Auditoría de escritura (NOM-024 §6)
  INSERT INTO auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT v_clinica, auth.uid(), 'CREATE', 'consultas', v_id
  WHERE v_clinica IS NOT NULL;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric, jsonb, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

-- ── 3. Recrear obtener_consultas devolviendo examen_oral ─────────────────────
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
  escalas                 jsonb,
  examen_oral             jsonb
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
         c.estado_mental, c.tamizaje_riesgo, c.escalas,
         CASE WHEN c.examen_oral_enc IS NULL THEN NULL ELSE decrypt_text(c.examen_oral_enc)::jsonb END
  FROM consultas c
  WHERE c.expediente_id = p_expediente_id
  ORDER BY c.fecha DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_consultas(uuid) TO authenticated, service_role;
