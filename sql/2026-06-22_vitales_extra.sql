-- 2026-06-22 — Campos vitales extra en consultas
-- Nuevos: fr, spo2, glucosa, perimetro_abdominal_cm, grasa_corporal_pct
-- Se agregan a la tabla y se actualizan las RPCs crear_consulta / obtener_consultas.

-- ── 1. Columnas nuevas en consultas ──────────────────────────────────────────
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS fr                     integer,   -- frecuencia respiratoria (rpm)
  ADD COLUMN IF NOT EXISTS spo2                   integer,   -- saturación O2 (%)
  ADD COLUMN IF NOT EXISTS glucosa                numeric,   -- glucosa capilar (mg/dL)
  ADD COLUMN IF NOT EXISTS perimetro_abdominal_cm numeric,   -- perímetro abdominal (cm)
  ADD COLUMN IF NOT EXISTS grasa_corporal_pct     numeric;   -- grasa corporal (%)

-- ── 2. Recrear crear_consulta ─────────────────────────────────────────────────
-- Firma original: (uuid, text, text, numeric, numeric, integer, integer, integer, numeric)
DROP FUNCTION IF EXISTS public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric);

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

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_consulta(uuid, text, text, numeric, numeric, integer, integer, integer, numeric, integer, integer, numeric, numeric, numeric)
  TO authenticated, service_role;

-- ── 3. Recrear obtener_consultas ──────────────────────────────────────────────
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
  notas                   text
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
         decrypt_text(c.motivo_enc), decrypt_text(c.notas_enc)
  FROM consultas c
  WHERE c.expediente_id = p_expediente_id
  ORDER BY c.fecha DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_consultas(uuid) TO authenticated, service_role;
