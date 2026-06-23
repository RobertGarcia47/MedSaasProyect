-- 2026-06-19 — Informes: columnas extra + RPCs actualizadas
-- Corre en Supabase SQL Editor (prod).

-- ── 1. Columnas nuevas en informes ──────────────────────────────────────────
ALTER TABLE public.informes
  ADD COLUMN IF NOT EXISTS visibilidad  text    NOT NULL DEFAULT 'expediente'
    CHECK (visibilidad IN ('expediente', 'compartido', 'privado')),
  ADD COLUMN IF NOT EXISTS tags         text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fecha_informe date;   -- NULL = usa created_at como fecha

-- ── 2. Reemplazar crear_informe ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.crear_informe(uuid, tipo_informe, text, text, uuid);

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
BEGIN
  -- Derivar clinica_id desde el expediente (guard RLS: si el usuario no ve el
  -- expediente, este SELECT devuelve NULL y el INSERT falla por NOT NULL).
  SELECT clinica_id INTO v_clinica_id
    FROM expedientes WHERE id = p_expediente_id;

  v_medico_id := auth.uid();

  -- Cifrar el cuerpo solo si viene con contenido.
  IF p_cuerpo IS NOT NULL AND trim(p_cuerpo) <> '' THEN
    v_cuerpo_enc := encrypt_text(p_cuerpo);
  END IF;

  INSERT INTO public.informes
    (clinica_id, expediente_id, consulta_id, medico_id,
     tipo, titulo, cuerpo_enc,
     visibilidad, tags, fecha_informe)
  VALUES
    (v_clinica_id, p_expediente_id, p_consulta_id, v_medico_id,
     p_tipo, p_titulo, v_cuerpo_enc,
     p_visibilidad, p_tags, p_fecha_informe)
  RETURNING id INTO v_informe_id;

  RETURN v_informe_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_informe(uuid, tipo_informe, text, text, uuid, text, text[], date)
  TO authenticated, service_role;

-- ── 3. Reemplazar obtener_informes ───────────────────────────────────────────
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
  created_at     timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  SELECT clinica_id INTO v_clinica_id
    FROM expedientes WHERE id = p_expediente_id;

  -- Registrar el READ en auditoría (0 filas si RLS oculta el expediente → sin fugas).
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
      i.created_at
    FROM public.informes i
    WHERE i.expediente_id = p_expediente_id
    ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_informes(uuid)
  TO authenticated, service_role;
