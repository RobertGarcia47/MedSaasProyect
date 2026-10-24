-- ============================================================================
-- MedSaaS — La cita lleva el procedimiento (Dentista, Fase 2 pendiente)
-- Fecha: 2026-10-24
-- ----------------------------------------------------------------------------
-- Agrega a `citas` dos columnas OPCIONALES:
--   procedimiento_id  → qué procedimiento del catálogo se va a realizar (puede quedar NULL:
--                       las citas de siempre y las de otras especialidades no lo usan).
--                       ON DELETE SET NULL: borrar un procedimiento del catálogo no borra ni
--                       invalida las citas que ya lo usaron.
--   precio            → precio ESTIMADO en MXN, copiado del catálogo al agendar (instantánea,
--                       igual que en planes_tratamiento_items): cambiar el precio en el catálogo
--                       no altera citas ya agendadas.
-- El nombre del procedimiento ya viaja en `motivo` ("[tipo] Nombre del procedimiento"), y la
-- duración en `duracion_min`, así que no hace falta guardarlos aparte.
--
-- No cambia ninguna política de RLS ni los triggers de auditoría: las políticas de `citas` son
-- por fila (es_miembro(clinica_id)) y las columnas nuevas quedan cubiertas igual.
-- Supuesto: sql/2026-10-22_procedimientos_catalogo.sql ya está aplicado (FK a procedimientos).
-- ============================================================================

ALTER TABLE public.citas
  ADD COLUMN IF NOT EXISTS procedimiento_id uuid
    REFERENCES public.procedimientos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS precio numeric(12,2)
    CHECK (precio IS NULL OR precio >= 0);

CREATE INDEX IF NOT EXISTS idx_citas_procedimiento
  ON public.citas (procedimiento_id)
  WHERE procedimiento_id IS NOT NULL;

-- ── Verificación sugerida tras correrlo ───────────────────────────────────────
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'citas'
--      and column_name in ('procedimiento_id', 'precio');          -- 2 filas
