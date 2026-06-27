-- 2026-06-25 — RFC y CLUES del establecimiento (NOM-024 §5)
-- RFC  : obligatorio en documentos con valor legal (recetas, informes con membrete).
-- CLUES: Clave Única de Establecimientos de Salud — COFEPRIS para clínicas privadas.

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS rfc   varchar(13),
  ADD COLUMN IF NOT EXISTS clues varchar(20);

-- Verificación:
-- SELECT id, nombre, rfc, clues FROM clinicas LIMIT 5;
