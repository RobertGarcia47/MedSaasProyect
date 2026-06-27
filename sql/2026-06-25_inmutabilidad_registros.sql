-- 2026-06-25 — Inmutabilidad de registros clínicos (NOM-024 §6)
-- Bloquea UPDATE y DELETE en consultas, recetas e informes.
-- Una vez creado un registro clínico no puede modificarse ni eliminarse.
--
-- Estrategia por tabla:
--   consultas → políticas RESTRICTIVE (se aplican con AND sobre la política ALL existente)
--   recetas   → eliminar recetas_update (DELETE ya estaba bloqueado sin política)
--   informes  → eliminar informes_update (DELETE ya estaba bloqueado sin política)

-- ── 1. consultas ─────────────────────────────────────────────────────────────
-- La política ALL existente (consultas_acceso) cubría también UPDATE y DELETE.
-- Las políticas RESTRICTIVE se evalúan con AND sobre cualquier política permisiva,
-- por lo que bloquean aunque la ALL las hubiera permitido.

DROP POLICY IF EXISTS "consultas_no_update" ON public.consultas;
CREATE POLICY "consultas_no_update"
  ON public.consultas
  AS RESTRICTIVE
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "consultas_no_delete" ON public.consultas;
CREATE POLICY "consultas_no_delete"
  ON public.consultas
  AS RESTRICTIVE
  FOR DELETE
  USING (false);

-- ── 2. recetas ───────────────────────────────────────────────────────────────
-- Eliminar la política de UPDATE (el DELETE ya estaba bloqueado por ausencia de política).
-- Agregamos RESTRICTIVE explícitos para que quede documentado y no pueda
-- reactivarse accidentalmente con una política futura.

DROP POLICY IF EXISTS "recetas_update" ON public.recetas;

DROP POLICY IF EXISTS "recetas_no_update" ON public.recetas;
CREATE POLICY "recetas_no_update"
  ON public.recetas
  AS RESTRICTIVE
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "recetas_no_delete" ON public.recetas;
CREATE POLICY "recetas_no_delete"
  ON public.recetas
  AS RESTRICTIVE
  FOR DELETE
  USING (false);

-- ── 3. informes ──────────────────────────────────────────────────────────────
-- Mismo tratamiento que recetas.

DROP POLICY IF EXISTS "informes_update" ON public.informes;

DROP POLICY IF EXISTS "informes_no_update" ON public.informes;
CREATE POLICY "informes_no_update"
  ON public.informes
  AS RESTRICTIVE
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "informes_no_delete" ON public.informes;
CREATE POLICY "informes_no_delete"
  ON public.informes
  AS RESTRICTIVE
  FOR DELETE
  USING (false);

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Corre esto después para confirmar que las políticas quedaron correctas:
--
-- SELECT tablename, policyname, cmd, roles, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('consultas', 'recetas', 'informes')
-- ORDER BY tablename, cmd;
--
-- Debes ver consultas_no_update, consultas_no_delete, recetas_no_update,
-- recetas_no_delete, informes_no_update, informes_no_delete con cmd UPDATE/DELETE.
