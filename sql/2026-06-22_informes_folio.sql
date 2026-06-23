-- 2026-06-22 — Folio real en informes, secuencial POR MÉDICO
-- Cada doctor tiene su propio contador independiente.
-- Dos médicos distintos pueden tener F1 sin colisión.
-- Formato de display: F{n} - dd-mm-yyyy   (ej. F1 - 22-06-2026)
-- La fecha mostrada sale de fecha_informe (o created_at) → calculada en frontend.

-- ── 1. Tabla contador de folios por médico ────────────────────────────────────
-- Una fila por médico; ultimo_folio se incrementa atómicamente en crear_informe
-- con INSERT … ON CONFLICT DO UPDATE — sin riesgo de duplicados concurrentes.

CREATE TABLE IF NOT EXISTS public.informes_folios (
  medico_id    uuid    PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ultimo_folio integer NOT NULL DEFAULT 0
);

ALTER TABLE public.informes_folios ENABLE ROW LEVEL SECURITY;

-- Cada médico solo puede ver y modificar su propia fila.
DROP POLICY IF EXISTS "ifol_own" ON public.informes_folios;
CREATE POLICY "ifol_own" ON public.informes_folios
  FOR ALL TO authenticated
  USING   (medico_id = auth.uid())
  WITH CHECK (medico_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.informes_folios TO authenticated, service_role;

-- ── 2. Columna folio_num en informes ─────────────────────────────────────────
ALTER TABLE public.informes
  ADD COLUMN IF NOT EXISTS folio_num integer;

-- Informes existentes quedan con folio_num NULL (sin folio histórico).
-- Opcional — rellenar en orden cronológico por médico:
--   UPDATE informes i
--   SET folio_num = sub.rn
--   FROM (
--     SELECT id,
--            ROW_NUMBER() OVER (PARTITION BY medico_id ORDER BY created_at) AS rn
--     FROM informes
--   ) sub
--   WHERE i.id = sub.id;

-- ── 3. Recrear crear_informe con asignación de folio por médico ───────────────
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
  -- Si es su primer informe, inserta la fila con folio 1.
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

  RETURN v_informe_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_informe(uuid, tipo_informe, text, text, uuid, text, text[], date)
  TO authenticated, service_role;

-- ── 4. Recrear obtener_informes devolviendo folio_num ────────────────────────
DROP FUNCTION IF EXISTS public.obtener_informes(uuid);

CREATE OR REPLACE FUNCTION public.obtener_informes(
  p_expediente_id uuid
)
RETURNS TABLE (
  id             uuid,
  consulta_id    uuid,
  medico_id      uuid,
  tipo           tipo_informe,
  titulo         text,
  cuerpo         text,
  visibilidad    text,
  tags           text[],
  fecha_informe  date,
  folio_num      integer,
  created_at     timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  SELECT e.clinica_id INTO v_clinica_id
    FROM expedientes e WHERE e.id = p_expediente_id;

  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
    SELECT v_clinica_id, auth.uid(), 'READ', 'informes', p_expediente_id
    WHERE v_clinica_id IS NOT NULL;

  RETURN QUERY
    SELECT
      i.id,
      i.consulta_id,
      i.medico_id,
      i.tipo,
      i.titulo,
      CASE WHEN i.cuerpo_enc IS NOT NULL THEN decrypt_text(i.cuerpo_enc) ELSE NULL END,
      i.visibilidad,
      i.tags,
      i.fecha_informe,
      i.folio_num,
      i.created_at
    FROM public.informes i
    WHERE i.expediente_id = p_expediente_id
    ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_informes(uuid)
  TO authenticated, service_role;
