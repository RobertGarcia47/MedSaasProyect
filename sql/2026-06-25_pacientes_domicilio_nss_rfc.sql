-- 2026-06-25 — Domicilio, NSS y RFC del paciente (NOM-024 §5.2)
-- domicilio / municipio / estado : identificación mínima del paciente (NOM-024)
-- nss                            : interoperabilidad IMSS/ISSSTE
-- rfc                            : dato fiscal / identificación complementaria

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS domicilio  text,
  ADD COLUMN IF NOT EXISTS municipio  text,
  ADD COLUMN IF NOT EXISTS estado     text,
  ADD COLUMN IF NOT EXISTS nss        varchar(11),
  ADD COLUMN IF NOT EXISTS rfc        varchar(13);

-- Verificación:
-- SELECT id, nombre, domicilio, municipio, estado, nss, rfc FROM pacientes LIMIT 3;
