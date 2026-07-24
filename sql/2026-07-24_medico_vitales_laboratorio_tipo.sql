-- ============================================================================
-- MedSaaS — medico_detalles: usa_signos_vitales, usa_laboratorio, tipo_profesional
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- Continúa el patrón de puede_prescribir (mismo día, sesión anterior): más
-- profesionales que no encajan en "médico que hace de todo" (psicólogo,
-- nutriólogo). usa_signos_vitales/usa_laboratorio siguen el mismo molde
-- (booleano, default true, gatea UI en el frontend).
--
-- tipo_profesional es SOLO informativo/preset: alimenta el selector de
-- "tipo de práctica" en Perfil, que pre-llena los 3 booleanos (puede_prescribir
-- + estos dos) al elegirlo. No tiene FK ni enum — los booleanos siguen siendo
-- la fuente de verdad real para cualquier gate. text simple a propósito: si la
-- lista de profesiones crece, se ajusta solo en el frontend sin migración.
--
-- Default true en los dos booleanos nuevos: nadie pierde acceso a vitales o
-- laboratorio al correr este script. Idempotente.
-- ============================================================================

ALTER TABLE public.medico_detalles
  ADD COLUMN IF NOT EXISTS usa_signos_vitales boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS usa_laboratorio    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tipo_profesional   text;

-- Fin del script.
