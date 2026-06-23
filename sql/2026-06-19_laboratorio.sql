-- 2026-06-19 — Módulo de Laboratorio
-- Tabla estudios_laboratorio + Storage bucket + RLS + RPCs
-- Patrón consistente con citas/recetas/informes del mismo schema.

-- ── 1. Tabla ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estudios_laboratorio (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id          uuid        NOT NULL REFERENCES public.clinicas(id)     ON DELETE CASCADE,
  expediente_id       uuid        NOT NULL REFERENCES public.expedientes(id)  ON DELETE CASCADE,
  consulta_id         uuid                 REFERENCES public.consultas(id)    ON DELETE SET NULL,
  creado_por          uuid        NOT NULL REFERENCES public.profiles(id)     ON DELETE RESTRICT,
  tipo_estudio        text        NOT NULL,           -- texto libre: "BH", "Química sanguínea"…
  fecha_estudio       date        NOT NULL,
  laboratorio_externo text,                           -- EN CLARO, no sensible
  notas_enc           bytea,                          -- cifrado, mismo patrón que informes.cuerpo_enc
  archivo_url         text        NOT NULL,           -- path en Storage (bucket laboratorios)
  archivo_nombre      text,                           -- nombre original del archivo
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estudioslab_expediente
  ON public.estudios_laboratorio (expediente_id, fecha_estudio DESC);
CREATE INDEX IF NOT EXISTS idx_estudioslab_clinica
  ON public.estudios_laboratorio (clinica_id);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.estudios_laboratorio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estudioslab_select" ON public.estudios_laboratorio;
CREATE POLICY "estudioslab_select" ON public.estudios_laboratorio
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));

DROP POLICY IF EXISTS "estudioslab_insert" ON public.estudios_laboratorio;
CREATE POLICY "estudioslab_insert" ON public.estudios_laboratorio
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));

DROP POLICY IF EXISTS "estudioslab_update" ON public.estudios_laboratorio;
CREATE POLICY "estudioslab_update" ON public.estudios_laboratorio
  FOR UPDATE TO authenticated USING (es_miembro(clinica_id));

DROP POLICY IF EXISTS "estudioslab_delete" ON public.estudios_laboratorio;
CREATE POLICY "estudioslab_delete" ON public.estudios_laboratorio
  FOR DELETE TO authenticated USING (es_miembro(clinica_id));

-- ── 3. Trigger de auditoría ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_estudioslab ON public.estudios_laboratorio;
CREATE TRIGGER trg_audit_estudioslab
  AFTER INSERT OR UPDATE OR DELETE ON public.estudios_laboratorio
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- ── 4. Storage bucket (privado) ──────────────────────────────────────────────
-- Si ya existe, el ON CONFLICT lo ignora.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'laboratorios',
  'laboratorios',
  false,
  20971520,   -- 20 MB máximo por archivo
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Storage RLS ───────────────────────────────────────────────────────────
-- Path: {clinica_id}/{expediente_id}/{timestamp}-{nombre}
-- El primer segmento del path es clinica_id → lo usamos para validar es_miembro.

DROP POLICY IF EXISTS "lab_storage_select" ON storage.objects;
CREATE POLICY "lab_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'laboratorios'
    AND es_miembro((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "lab_storage_insert" ON storage.objects;
CREATE POLICY "lab_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'laboratorios'
    AND es_miembro((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "lab_storage_delete" ON storage.objects;
CREATE POLICY "lab_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'laboratorios'
    AND es_miembro((storage.foldername(name))[1]::uuid)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estudios_laboratorio TO authenticated, service_role;

-- ── 6. RPC crear_estudio_laboratorio ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_estudio_laboratorio(
  p_expediente_id       uuid,
  p_tipo_estudio        text,
  p_fecha_estudio       date,
  p_archivo_url         text,
  p_archivo_nombre      text       DEFAULT NULL,
  p_laboratorio_externo text       DEFAULT NULL,
  p_notas               text       DEFAULT NULL,
  p_consulta_id         uuid       DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica_id uuid;
  v_estudio_id uuid;
  v_notas_enc  bytea;
BEGIN
  SELECT e.clinica_id INTO v_clinica_id
    FROM expedientes e WHERE e.id = p_expediente_id;

  IF p_notas IS NOT NULL AND trim(p_notas) <> '' THEN
    v_notas_enc := encrypt_text(p_notas);
  END IF;

  INSERT INTO public.estudios_laboratorio
    (clinica_id, expediente_id, consulta_id, creado_por,
     tipo_estudio, fecha_estudio, laboratorio_externo,
     notas_enc, archivo_url, archivo_nombre)
  VALUES
    (v_clinica_id, p_expediente_id, p_consulta_id, auth.uid(),
     p_tipo_estudio, p_fecha_estudio, p_laboratorio_externo,
     v_notas_enc, p_archivo_url, p_archivo_nombre)
  RETURNING id INTO v_estudio_id;

  RETURN v_estudio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_estudio_laboratorio(uuid, text, date, text, text, text, text, uuid)
  TO authenticated, service_role;

-- ── 7. RPC obtener_estudios_laboratorio ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obtener_estudios_laboratorio(
  p_expediente_id uuid
)
RETURNS TABLE (
  id                  uuid,
  consulta_id         uuid,
  creado_por          uuid,
  tipo_estudio        text,
  fecha_estudio       date,
  laboratorio_externo text,
  notas               text,
  archivo_url         text,
  archivo_nombre      text,
  created_at          timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  SELECT e.clinica_id INTO v_clinica_id
    FROM expedientes e WHERE e.id = p_expediente_id;

  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
    SELECT v_clinica_id, auth.uid(), 'READ', 'estudios_laboratorio', p_expediente_id
    WHERE v_clinica_id IS NOT NULL;

  RETURN QUERY
    SELECT
      el.id,
      el.consulta_id,
      el.creado_por,
      el.tipo_estudio,
      el.fecha_estudio,
      el.laboratorio_externo,
      CASE WHEN el.notas_enc IS NOT NULL THEN decrypt_text(el.notas_enc) ELSE NULL END,
      el.archivo_url,
      el.archivo_nombre,
      el.created_at
    FROM public.estudios_laboratorio el
    WHERE el.expediente_id = p_expediente_id
    ORDER BY el.fecha_estudio DESC, el.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_estudios_laboratorio(uuid)
  TO authenticated, service_role;
