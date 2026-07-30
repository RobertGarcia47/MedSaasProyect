-- ============================================================================
-- MedSaaS — profiles: el owner debe poder ver el nombre de CUALQUIER miembro
-- de su clínica, incluso si ya lo dio de baja.
-- Fecha: 2026-07-29
-- ----------------------------------------------------------------------------
-- Bug destapado en la verificación end-to-end del equipo: al dar de baja a un
-- miembro (clinica_miembros.activo=false), su nombre en el roster (Profile.tsx
-- → Equipo) se caía a "—". Causa confirmada vía diagnóstico de pg_policies:
-- la policy SELECT existente "profiles_colegas" exige que AMBOS lados de la
-- relación (quien consulta y el consultado) tengan m1.activo/m2.activo=true:
--
--   EXISTS (SELECT 1 FROM clinica_miembros m1 JOIN clinica_miembros m2
--             ON m1.clinica_id = m2.clinica_id
--            WHERE m1.profile_id = auth.uid() AND m2.profile_id = profiles.id
--              AND m1.activo AND m2.activo)
--
-- Tiene sentido para el caso "colegas viéndose entre sí" (ej. médico picker),
-- pero rompe un caso legítimo: el owner administrando su roster necesita ver
-- a alguien que ACABA de desactivar. Aditiva — no toca profiles_colegas,
-- Postgres combina policies permisivas del mismo cmd con OR.
-- ============================================================================

DROP POLICY IF EXISTS "profiles_owner_ve_equipo" ON public.profiles;
CREATE POLICY "profiles_owner_ve_equipo" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_miembros m
      WHERE m.profile_id = profiles.id AND es_owner(m.clinica_id)
    )
  );

-- Fin del script.
