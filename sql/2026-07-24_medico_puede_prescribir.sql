-- ============================================================================
-- MedSaaS — medico_detalles.puede_prescribir
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- Base del toggle "no todo médico prescribe" (psicólogos, nutriólogos, etc.):
-- un profesional puede tener cédula y usar consultas/expediente sin poder (o
-- deber) emitir recetas. Primer booleano de lo que más adelante puede crecer
-- a más columnas del mismo tipo (signos vitales, laboratorio) siguiendo este
-- mismo patrón — no requiere una migración distinta cada vez.
--
-- Default true: ningún médico existente pierde acceso a recetas al correr
-- este script. Idempotente.
-- ============================================================================

ALTER TABLE public.medico_detalles
  ADD COLUMN IF NOT EXISTS puede_prescribir boolean NOT NULL DEFAULT true;

-- Fin del script.
