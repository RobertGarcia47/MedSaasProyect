-- ============================================================================
-- MedSaaS — Documentos y radiografías del paciente (Dentista)
-- Fecha: 2026-10-24
-- ----------------------------------------------------------------------------
-- Galería de archivos por EXPEDIENTE: radiografías, fotografías (antes/después),
-- documentos (PDF) y otros. Mismo patrón que el módulo de laboratorio
-- (sql/2026-06-19_laboratorio.sql): metadatos en una tabla, el archivo en un bucket
-- PRIVADO de Storage (se ve con URLs firmadas), notas CIFRADAS vía RPC. Diferencias:
--   * miniatura_path: el front sube también una miniatura (la galería no descarga
--     radiografías de varios MB para mostrar una cuadrícula).
--   * categoria + diente (texto libre; el odontograma lo reemplazará) + titulo.
--   * NO hay borrado: un archivo clínico se ARCHIVA (archivado = true) y se puede
--     restaurar. La tabla no tiene política de DELETE y el bucket tampoco.
--   * La RLS hereda el acceso del EXPEDIENTE (EXISTS sobre `expedientes`), igual que
--     planes_tratamiento: cualquier restricción por médico/asistente se hereda.
--
-- Supuestos a confirmar al correrlo:
--   * es_miembro(uuid), fn_auditoria(), encrypt_text(), decrypt_text() existen.
--   * El bucket se crea aquí (privado, 25 MB, imágenes y PDF). Si prefieres crearlo desde
--     el panel de Supabase, borra la sección 4 y crea "archivos-paciente" con esos límites.
-- ============================================================================

-- ── 1. Tabla ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expediente_archivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id      uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id),
  creado_por      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  categoria       text NOT NULL DEFAULT 'otro'
                    CHECK (categoria IN ('radiografia', 'fotografia', 'documento', 'otro')),
  titulo          text NOT NULL CHECK (length(btrim(titulo)) > 0),
  fecha           date NOT NULL DEFAULT current_date,   -- fecha de la toma / del documento
  diente          text,                                  -- texto libre ("16", "cuadrante 2")
  notas_enc       bytea,                                 -- cifrado con encrypt_text
  archivo_path    text NOT NULL,                         -- path en Storage (bucket archivos-paciente)
  miniatura_path  text,                                  -- miniatura de imágenes (puede faltar)
  archivo_nombre  text,
  mime            text,
  tamano_bytes    bigint CHECK (tamano_bytes IS NULL OR tamano_bytes >= 0),
  archivado       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archivos_expediente
  ON public.expediente_archivos (expediente_id, fecha DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.archivos_paciente_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archivos_updated_at ON public.expediente_archivos;
CREATE TRIGGER trg_archivos_updated_at
  BEFORE UPDATE ON public.expediente_archivos
  FOR EACH ROW EXECUTE FUNCTION public.archivos_paciente_set_updated_at();

-- ── 2. RLS: hereda el acceso del expediente; sin DELETE ───────────────────────
ALTER TABLE public.expediente_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archivos_select" ON public.expediente_archivos;
CREATE POLICY "archivos_select" ON public.expediente_archivos
  FOR SELECT TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = expediente_archivos.expediente_id));

DROP POLICY IF EXISTS "archivos_insert" ON public.expediente_archivos;
CREATE POLICY "archivos_insert" ON public.expediente_archivos
  FOR INSERT TO authenticated
  WITH CHECK (es_miembro(clinica_id)
              AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = expediente_archivos.expediente_id));

DROP POLICY IF EXISTS "archivos_update" ON public.expediente_archivos;
CREATE POLICY "archivos_update" ON public.expediente_archivos
  FOR UPDATE TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = expediente_archivos.expediente_id))
  WITH CHECK (es_miembro(clinica_id));

-- (a propósito no hay política de DELETE: los archivos clínicos se archivan, no se borran)

GRANT SELECT, INSERT, UPDATE ON public.expediente_archivos TO authenticated, service_role;

-- ── 3. Auditoría (altas, ediciones y archivados) ──────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_archivos ON public.expediente_archivos;
CREATE TRIGGER trg_audit_archivos
  AFTER INSERT OR UPDATE ON public.expediente_archivos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- ── 4. Storage: bucket privado ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archivos-paciente',
  'archivos-paciente',
  false,
  26214400,   -- 25 MB por archivo
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Path: {clinica_id}/{expediente_id}/{timestamp}-{nombre}  (miniaturas: .../thumbs/...)
-- El primer segmento es clinica_id → valida es_miembro. Sin política de DELETE.
DROP POLICY IF EXISTS "archivos_storage_select" ON storage.objects;
CREATE POLICY "archivos_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'archivos-paciente'
         AND es_miembro((storage.foldername(name))[1]::uuid));

DROP POLICY IF EXISTS "archivos_storage_insert" ON storage.objects;
CREATE POLICY "archivos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'archivos-paciente'
              AND es_miembro((storage.foldername(name))[1]::uuid));

-- ── 5. RPCs (SECURITY INVOKER: la RLS autoriza; aquí solo se cifra/descifra) ──
CREATE OR REPLACE FUNCTION public.crear_archivo_paciente(
  p_expediente_id  uuid,
  p_categoria      text,
  p_titulo         text,
  p_archivo_path   text,
  p_fecha          date    DEFAULT current_date,
  p_diente         text    DEFAULT NULL,
  p_notas          text    DEFAULT NULL,
  p_miniatura_path text    DEFAULT NULL,
  p_archivo_nombre text    DEFAULT NULL,
  p_mime           text    DEFAULT NULL,
  p_tamano_bytes   bigint  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica uuid;
  v_id      uuid;
BEGIN
  SELECT clinica_id INTO v_clinica FROM public.expedientes WHERE id = p_expediente_id;

  INSERT INTO public.expediente_archivos
    (clinica_id, expediente_id, categoria, titulo, fecha, diente, notas_enc,
     archivo_path, miniatura_path, archivo_nombre, mime, tamano_bytes)
  VALUES
    (v_clinica, p_expediente_id, p_categoria, p_titulo, COALESCE(p_fecha, current_date),
     NULLIF(btrim(p_diente), ''),
     CASE WHEN p_notas IS NULL OR btrim(p_notas) = '' THEN NULL ELSE encrypt_text(p_notas) END,
     p_archivo_path, p_miniatura_path, p_archivo_nombre, p_mime, p_tamano_bytes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Recibe el estado completo (permite vaciar notas/diente) y archivar/restaurar.
CREATE OR REPLACE FUNCTION public.actualizar_archivo_paciente(
  p_id         uuid,
  p_categoria  text,
  p_titulo     text,
  p_fecha      date,
  p_diente     text,
  p_notas      text,
  p_archivado  boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.expediente_archivos
     SET categoria = p_categoria,
         titulo    = COALESCE(NULLIF(btrim(p_titulo), ''), titulo),
         fecha     = COALESCE(p_fecha, fecha),
         diente    = NULLIF(btrim(p_diente), ''),
         notas_enc = CASE WHEN p_notas IS NULL OR btrim(p_notas) = '' THEN NULL ELSE encrypt_text(p_notas) END,
         archivado = COALESCE(p_archivado, archivado)
   WHERE id = p_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- La RLS no lanza error al rechazar un UPDATE: 0 filas = no existe o sin permiso.
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Archivo no encontrado o sin permiso' USING ERRCODE = '42501';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.obtener_archivos_paciente(uuid);
CREATE OR REPLACE FUNCTION public.obtener_archivos_paciente(p_expediente_id uuid)
RETURNS TABLE (
  id              uuid,
  categoria       text,
  titulo          text,
  fecha           date,
  diente          text,
  notas           text,
  archivo_path    text,
  miniatura_path  text,
  archivo_nombre  text,
  mime            text,
  tamano_bytes    bigint,
  archivado       boolean,
  creado_por      uuid,
  created_at      timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT e.clinica_id, auth.uid(), 'READ', 'expediente_archivos', e.id
  FROM public.expedientes e WHERE e.id = p_expediente_id;

  RETURN QUERY
  SELECT a.id, a.categoria, a.titulo, a.fecha, a.diente,
         CASE WHEN a.notas_enc IS NULL THEN NULL ELSE decrypt_text(a.notas_enc) END,
         a.archivo_path, a.miniatura_path, a.archivo_nombre, a.mime, a.tamano_bytes,
         a.archivado, a.creado_por, a.created_at
  FROM public.expediente_archivos a
  WHERE a.expediente_id = p_expediente_id
  ORDER BY a.fecha DESC, a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_archivo_paciente(uuid, text, text, text, date, text, text, text, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_archivo_paciente(uuid, text, text, date, text, text, boolean)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_archivos_paciente(uuid)                                                             TO authenticated, service_role;

-- ── Verificación sugerida tras correrlo ───────────────────────────────────────
--   select id, public, file_size_limit from storage.buckets where id = 'archivos-paciente';   -- 1 fila, public = false
--   select count(*) from pg_policy where polrelid = 'public.expediente_archivos'::regclass;   -- 3
--   select count(*) from pg_policies where schemaname = 'storage' and policyname like 'archivos_storage_%';   -- 2
