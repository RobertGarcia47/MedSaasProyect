-- ============================================================================
-- MedSaaS — Plan de tratamiento y presupuesto (Dentista, Fase 3)
-- Fecha: 2026-10-24
-- ----------------------------------------------------------------------------
-- Dos tablas, ligadas al EXPEDIENTE (no a la consulta):
--   planes_tratamiento        cabecera: título, estado, descuento del plan, notas (CIFRADAS)
--   planes_tratamiento_items  líneas: diente, procedimiento, cantidad, precio, estado,
--                             notas (CIFRADAS)
-- No confundir con el "plan de tratamiento" de salud mental (expedientes.
-- plan_tratamiento_enc, sql/2026-09-28_salud_mental_fase3.sql): aquel es un texto único
-- por expediente; este es una lista de procedimientos con precio.
--
-- Cada línea guarda una INSTANTÁNEA del procedimiento (código, nombre y precio al momento
-- de agregarla); procedimiento_id solo referencia el catálogo (ON DELETE SET NULL). Así
-- cambiar un precio o borrar un procedimiento del catálogo no altera presupuestos ya
-- entregados. El total NO se guarda: se calcula (suma de cantidad × precio de las líneas
-- no canceladas, menos el descuento del plan).
--
-- Acceso: la RLS sigue la del EXPEDIENTE (un EXISTS sobre `expedientes` evaluado con los
-- permisos de quien consulta), así que cualquier restricción por médico/asistente que
-- tenga `expedientes` se hereda aquí sin copiarla. Pueden crear y editar todos los
-- miembros con acceso al expediente (es trabajo clínico, no configuración de precios);
-- solo se pueden BORRAR planes en borrador.
--
-- Las notas viajan por RPCs (SECURITY INVOKER, mismo molde que crear_consulta): el
-- frontend nunca toca los bytea.
--
-- Supuestos a confirmar al correrlo:
--   * es_miembro(uuid), fn_auditoria(), encrypt_text(), decrypt_text() existen.
--   * sql/2026-10-22_procedimientos_catalogo.sql ya está aplicado (FK a procedimientos).
-- ============================================================================

-- ── 1. Cabecera del plan ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planes_tratamiento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id     uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  expediente_id  uuid NOT NULL REFERENCES public.expedientes(id),
  titulo         text NOT NULL DEFAULT 'Plan de tratamiento' CHECK (length(btrim(titulo)) > 0),
  estado         text NOT NULL DEFAULT 'borrador'
                   CHECK (estado IN ('borrador', 'presentado', 'aprobado', 'completado', 'cancelado')),
  descuento_pct  numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  notas_enc      bytea,                                   -- texto cifrado con encrypt_text
  medico_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planes_tratamiento_expediente
  ON public.planes_tratamiento (expediente_id, created_at DESC);

-- ── 2. Líneas del plan ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planes_tratamiento_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES public.planes_tratamiento(id) ON DELETE CASCADE,
  clinica_id       uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  procedimiento_id uuid REFERENCES public.procedimientos(id) ON DELETE SET NULL,
  codigo           text,                                  -- instantánea del catálogo
  nombre           text NOT NULL CHECK (length(btrim(nombre)) > 0),
  diente           text,                                  -- texto libre ("16", "cuadrante 2"); el odontograma lo reemplazará
  cantidad         integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario  numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),   -- MXN, instantánea
  estado           text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'en_curso', 'hecho', 'cancelado')),
  realizado_en     date,                                  -- se llena al marcar 'hecho'
  notas_enc        bytea,                                 -- texto cifrado con encrypt_text
  orden            integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planes_items_plan
  ON public.planes_tratamiento_items (plan_id, orden, created_at);

-- ── 3. updated_at automático ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.planes_tratamiento_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planes_updated_at ON public.planes_tratamiento;
CREATE TRIGGER trg_planes_updated_at
  BEFORE UPDATE ON public.planes_tratamiento
  FOR EACH ROW EXECUTE FUNCTION public.planes_tratamiento_set_updated_at();

DROP TRIGGER IF EXISTS trg_planes_items_updated_at ON public.planes_tratamiento_items;
CREATE TRIGGER trg_planes_items_updated_at
  BEFORE UPDATE ON public.planes_tratamiento_items
  FOR EACH ROW EXECUTE FUNCTION public.planes_tratamiento_set_updated_at();

-- ── 4. RLS: hereda el acceso del expediente ───────────────────────────────────
ALTER TABLE public.planes_tratamiento       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planes_tratamiento_items ENABLE ROW LEVEL SECURITY;

-- planes_tratamiento
DROP POLICY IF EXISTS "planes_select" ON public.planes_tratamiento;
CREATE POLICY "planes_select" ON public.planes_tratamiento
  FOR SELECT TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = planes_tratamiento.expediente_id));

DROP POLICY IF EXISTS "planes_insert" ON public.planes_tratamiento;
CREATE POLICY "planes_insert" ON public.planes_tratamiento
  FOR INSERT TO authenticated
  WITH CHECK (es_miembro(clinica_id)
              AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = planes_tratamiento.expediente_id));

DROP POLICY IF EXISTS "planes_update" ON public.planes_tratamiento;
CREATE POLICY "planes_update" ON public.planes_tratamiento
  FOR UPDATE TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = planes_tratamiento.expediente_id))
  WITH CHECK (es_miembro(clinica_id));

-- Solo se borran borradores: un plan presentado/aprobado se cancela, no desaparece.
DROP POLICY IF EXISTS "planes_delete" ON public.planes_tratamiento;
CREATE POLICY "planes_delete" ON public.planes_tratamiento
  FOR DELETE TO authenticated
  USING (estado = 'borrador'
         AND es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = planes_tratamiento.expediente_id));

-- planes_tratamiento_items: heredan el acceso de su plan
DROP POLICY IF EXISTS "planes_items_select" ON public.planes_tratamiento_items;
CREATE POLICY "planes_items_select" ON public.planes_tratamiento_items
  FOR SELECT TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.planes_tratamiento p WHERE p.id = planes_tratamiento_items.plan_id));

DROP POLICY IF EXISTS "planes_items_insert" ON public.planes_tratamiento_items;
CREATE POLICY "planes_items_insert" ON public.planes_tratamiento_items
  FOR INSERT TO authenticated
  WITH CHECK (es_miembro(clinica_id)
              AND EXISTS (SELECT 1 FROM public.planes_tratamiento p WHERE p.id = planes_tratamiento_items.plan_id));

DROP POLICY IF EXISTS "planes_items_update" ON public.planes_tratamiento_items;
CREATE POLICY "planes_items_update" ON public.planes_tratamiento_items
  FOR UPDATE TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.planes_tratamiento p WHERE p.id = planes_tratamiento_items.plan_id))
  WITH CHECK (es_miembro(clinica_id));

DROP POLICY IF EXISTS "planes_items_delete" ON public.planes_tratamiento_items;
CREATE POLICY "planes_items_delete" ON public.planes_tratamiento_items
  FOR DELETE TO authenticated
  USING (es_miembro(clinica_id)
         AND EXISTS (SELECT 1 FROM public.planes_tratamiento p WHERE p.id = planes_tratamiento_items.plan_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planes_tratamiento       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planes_tratamiento_items TO authenticated, service_role;

-- ── 5. Auditoría de cambios (precios y estados importan) ──────────────────────
DROP TRIGGER IF EXISTS trg_audit_planes ON public.planes_tratamiento;
CREATE TRIGGER trg_audit_planes
  AFTER INSERT OR UPDATE OR DELETE ON public.planes_tratamiento
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_audit_planes_items ON public.planes_tratamiento_items;
CREATE TRIGGER trg_audit_planes_items
  AFTER INSERT OR UPDATE OR DELETE ON public.planes_tratamiento_items
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- ── 6. RPCs (SECURITY INVOKER: la RLS autoriza; aquí solo se cifra/descifra) ──

-- Crea un plan; clinica_id sale del expediente (si no lo ves, queda NULL y el INSERT falla).
CREATE OR REPLACE FUNCTION public.crear_plan_tratamiento(
  p_expediente_id  uuid,
  p_titulo         text    DEFAULT 'Plan de tratamiento',
  p_notas          text    DEFAULT NULL,
  p_descuento_pct  numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica uuid;
  v_id      uuid;
BEGIN
  SELECT clinica_id INTO v_clinica FROM public.expedientes WHERE id = p_expediente_id;

  INSERT INTO public.planes_tratamiento (clinica_id, expediente_id, titulo, descuento_pct, notas_enc)
  VALUES (
    v_clinica, p_expediente_id,
    COALESCE(NULLIF(btrim(p_titulo), ''), 'Plan de tratamiento'),
    COALESCE(p_descuento_pct, 0),
    CASE WHEN p_notas IS NULL OR btrim(p_notas) = '' THEN NULL ELSE encrypt_text(p_notas) END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Actualiza cabecera. Recibe el estado completo (permite vaciar las notas).
CREATE OR REPLACE FUNCTION public.actualizar_plan_tratamiento(
  p_plan_id        uuid,
  p_titulo         text,
  p_notas          text,
  p_estado         text,
  p_descuento_pct  numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.planes_tratamiento
     SET titulo        = COALESCE(NULLIF(btrim(p_titulo), ''), titulo),
         notas_enc     = CASE WHEN p_notas IS NULL OR btrim(p_notas) = '' THEN NULL ELSE encrypt_text(p_notas) END,
         estado        = p_estado,
         descuento_pct = COALESCE(p_descuento_pct, 0)
   WHERE id = p_plan_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- La RLS no lanza error al rechazar un UPDATE: 0 filas = no existe o sin permiso.
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Plan de tratamiento no encontrado o sin permiso' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Crea (p_item_id NULL) o actualiza una línea. Devuelve su id.
CREATE OR REPLACE FUNCTION public.guardar_item_plan(
  p_plan_id          uuid,
  p_item_id          uuid    DEFAULT NULL,
  p_procedimiento_id uuid    DEFAULT NULL,
  p_codigo           text    DEFAULT NULL,
  p_nombre           text    DEFAULT NULL,
  p_diente           text    DEFAULT NULL,
  p_cantidad         integer DEFAULT 1,
  p_precio_unitario  numeric DEFAULT 0,
  p_estado           text    DEFAULT 'pendiente',
  p_notas            text    DEFAULT NULL,
  p_orden            integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica uuid;
  v_id      uuid;
  v_n       integer;
  v_notas   bytea := CASE WHEN p_notas IS NULL OR btrim(p_notas) = '' THEN NULL ELSE encrypt_text(p_notas) END;
BEGIN
  IF p_item_id IS NULL THEN
    SELECT clinica_id INTO v_clinica FROM public.planes_tratamiento WHERE id = p_plan_id;

    INSERT INTO public.planes_tratamiento_items
      (plan_id, clinica_id, procedimiento_id, codigo, nombre, diente, cantidad,
       precio_unitario, estado, realizado_en, notas_enc, orden)
    VALUES
      (p_plan_id, v_clinica, p_procedimiento_id, NULLIF(btrim(p_codigo), ''), p_nombre,
       NULLIF(btrim(p_diente), ''), COALESCE(p_cantidad, 1), COALESCE(p_precio_unitario, 0),
       p_estado, CASE WHEN p_estado = 'hecho' THEN current_date END, v_notas, COALESCE(p_orden, 0))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.planes_tratamiento_items
     SET procedimiento_id = p_procedimiento_id,
         codigo           = NULLIF(btrim(p_codigo), ''),
         nombre           = p_nombre,
         diente           = NULLIF(btrim(p_diente), ''),
         cantidad         = COALESCE(p_cantidad, 1),
         precio_unitario  = COALESCE(p_precio_unitario, 0),
         estado           = p_estado,
         -- conserva la fecha original si ya estaba hecho; la borra si deja de estarlo
         realizado_en     = CASE WHEN p_estado = 'hecho' THEN COALESCE(realizado_en, current_date) END,
         notas_enc        = v_notas,
         orden            = COALESCE(p_orden, 0)
   WHERE id = p_item_id AND plan_id = p_plan_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Línea del plan no encontrada o sin permiso' USING ERRCODE = '42501';
  END IF;
  RETURN p_item_id;
END;
$$;

-- Lectura de los planes de un expediente (notas descifradas) + auditoría de lectura.
DROP FUNCTION IF EXISTS public.obtener_planes_tratamiento(uuid);
CREATE OR REPLACE FUNCTION public.obtener_planes_tratamiento(p_expediente_id uuid)
RETURNS TABLE (
  id             uuid,
  titulo         text,
  estado         text,
  descuento_pct  numeric,
  notas          text,
  medico_id      uuid,
  created_at     timestamptz,
  updated_at     timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  SELECT e.clinica_id, auth.uid(), 'READ', 'planes_tratamiento', e.id
  FROM public.expedientes e WHERE e.id = p_expediente_id;

  RETURN QUERY
  SELECT p.id, p.titulo, p.estado, p.descuento_pct,
         CASE WHEN p.notas_enc IS NULL THEN NULL ELSE decrypt_text(p.notas_enc) END,
         p.medico_id, p.created_at, p.updated_at
  FROM public.planes_tratamiento p
  WHERE p.expediente_id = p_expediente_id
  ORDER BY p.created_at DESC;
END;
$$;

-- Todas las líneas de todos los planes del expediente, en una sola llamada.
DROP FUNCTION IF EXISTS public.obtener_items_planes(uuid);
CREATE OR REPLACE FUNCTION public.obtener_items_planes(p_expediente_id uuid)
RETURNS TABLE (
  id                uuid,
  plan_id           uuid,
  procedimiento_id  uuid,
  codigo            text,
  nombre            text,
  diente            text,
  cantidad          integer,
  precio_unitario   numeric,
  estado            text,
  realizado_en      date,
  notas             text,
  orden             integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.plan_id, i.procedimiento_id, i.codigo, i.nombre, i.diente, i.cantidad,
         i.precio_unitario, i.estado, i.realizado_en,
         CASE WHEN i.notas_enc IS NULL THEN NULL ELSE decrypt_text(i.notas_enc) END,
         i.orden
  FROM public.planes_tratamiento_items i
  JOIN public.planes_tratamiento p ON p.id = i.plan_id
  WHERE p.expediente_id = p_expediente_id
  ORDER BY i.plan_id, i.orden, i.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_plan_tratamiento(uuid, text, text, numeric)                                            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_plan_tratamiento(uuid, text, text, text, numeric)                                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guardar_item_plan(uuid, uuid, uuid, text, text, text, integer, numeric, text, text, integer)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_planes_tratamiento(uuid)                                                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_items_planes(uuid)                                                                   TO authenticated, service_role;

-- ── Verificación sugerida tras correrlo ───────────────────────────────────────
--   select polname, polcmd from pg_policy
--    where polrelid in ('public.planes_tratamiento'::regclass, 'public.planes_tratamiento_items'::regclass);
--   -- 8 políticas (4 por tabla). Las notas deben verse ilegibles en la tabla:
--   select notas_enc from public.planes_tratamiento where notas_enc is not null limit 1;
