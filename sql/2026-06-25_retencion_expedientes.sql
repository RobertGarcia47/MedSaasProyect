-- 2026-06-25 — Retención mínima de expedientes clínicos (NOM-024 §7)
-- Reglas:
--   · Adultos  : conservar mínimo 5 años desde el último contacto clínico.
--   · Menores  : conservar hasta que el paciente cumpla 25 años.
-- Solo bloquea DELETE — nunca borra nada automáticamente.

-- ── 1. Columna fecha_ultimo_contacto en expedientes ──────────────────────────
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS fecha_ultimo_contacto timestamptz;

-- Inicializar con created_at para expedientes ya existentes.
UPDATE public.expedientes
  SET fecha_ultimo_contacto = created_at
  WHERE fecha_ultimo_contacto IS NULL;

-- A partir de ahora NOT NULL con DEFAULT now().
ALTER TABLE public.expedientes
  ALTER COLUMN fecha_ultimo_contacto SET DEFAULT now(),
  ALTER COLUMN fecha_ultimo_contacto SET NOT NULL;

-- ── 2. Función trigger: actualiza fecha_ultimo_contacto ──────────────────────
-- Se dispara al INSERT en consultas, recetas e informes.
-- Deriva el expediente_id de la fila recién insertada y actualiza la fecha.

CREATE OR REPLACE FUNCTION public.fn_actualizar_ultimo_contacto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.expedientes
    SET fecha_ultimo_contacto = now()
    WHERE id = NEW.expediente_id;
  RETURN NEW;
END;
$$;

-- ── 3. Triggers en las tres tablas clínicas ──────────────────────────────────

DROP TRIGGER IF EXISTS trg_contacto_consulta ON public.consultas;
CREATE TRIGGER trg_contacto_consulta
  AFTER INSERT ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_ultimo_contacto();

DROP TRIGGER IF EXISTS trg_contacto_receta ON public.recetas;
CREATE TRIGGER trg_contacto_receta
  AFTER INSERT ON public.recetas
  FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_ultimo_contacto();

DROP TRIGGER IF EXISTS trg_contacto_informe ON public.informes;
CREATE TRIGGER trg_contacto_informe
  AFTER INSERT ON public.informes
  FOR EACH ROW EXECUTE FUNCTION public.fn_actualizar_ultimo_contacto();

-- ── 4. Política RESTRICTIVE en expedientes ───────────────────────────────────
-- Bloquea DELETE si:
--   a) No han pasado 5 años desde el último contacto, O
--   b) El paciente aún no tiene 25 años cumplidos.
-- Solo permite DELETE si AMBAS condiciones de retención han vencido.

DROP POLICY IF EXISTS "expedientes_retencion" ON public.expedientes;
CREATE POLICY "expedientes_retencion"
  ON public.expedientes
  AS RESTRICTIVE
  FOR DELETE
  USING (
    -- Condición 1: han pasado al menos 5 años desde el último contacto
    fecha_ultimo_contacto <= now() - interval '5 years'
    AND
    -- Condición 2: el paciente ya tiene 25 años o más (protección de menores)
    (
      SELECT COALESCE(p.fecha_nacimiento, '1900-01-01'::date) + interval '25 years' <= now()
      FROM public.pacientes p
      WHERE p.id = expedientes.paciente_id
    )
  );

-- ── 5. Política RESTRICTIVE en pacientes ─────────────────────────────────────
-- Bloquea DELETE en pacientes si tiene algún expediente con retención vigente.
-- (DELETE en pacientes ya estaba bloqueado por ausencia de política permisiva;
--  esta política lo documenta explícitamente y lo hace robusto ante cambios futuros.)

DROP POLICY IF EXISTS "pacientes_retencion" ON public.pacientes;
CREATE POLICY "pacientes_retencion"
  ON public.pacientes
  AS RESTRICTIVE
  FOR DELETE
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.paciente_id = pacientes.id
        AND (
          -- Retención activa si NO han pasado 5 años desde último contacto
          e.fecha_ultimo_contacto > now() - interval '5 years'
          OR
          -- O el paciente aún no tiene 25 años
          COALESCE(pacientes.fecha_nacimiento, '1900-01-01'::date) + interval '25 years' > now()
        )
    )
  );

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Después de correr el script, verifica con:
--
-- 1. Columna y valor inicial:
--    SELECT id, created_at, fecha_ultimo_contacto FROM expedientes LIMIT 5;
--
-- 2. Políticas nuevas:
--    SELECT tablename, policyname, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('expedientes', 'pacientes')
--      AND policyname IN ('expedientes_retencion', 'pacientes_retencion');
--
-- 3. Triggers:
--    SELECT trigger_name, event_object_table
--    FROM information_schema.triggers
--    WHERE trigger_schema = 'public'
--      AND trigger_name IN ('trg_contacto_consulta','trg_contacto_receta','trg_contacto_informe');
