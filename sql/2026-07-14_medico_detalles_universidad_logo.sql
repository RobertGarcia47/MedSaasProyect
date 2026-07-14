-- 2026-07-14 — Logo de la universidad/institución del médico
-- Mismo patrón que clinicas.logo_url: texto plano con la URL pública de Storage.
-- Reusa el bucket "logos" ya existente (path {profile_id}/universidad-logo).

ALTER TABLE public.medico_detalles
  ADD COLUMN IF NOT EXISTS universidad_logo_url text;

-- Verificación:
-- SELECT profile_id, universidad, universidad_logo_url FROM medico_detalles LIMIT 5;
