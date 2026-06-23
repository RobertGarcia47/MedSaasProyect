-- 2026-06-19 — RLS de visibilidad en informes
-- Reemplaza la policy de SELECT para respetar la columna visibilidad:
--   expediente / compartido → cualquier miembro de la clínica
--   privado                 → solo el médico autor (medico_id = auth.uid())
-- INSERT/UPDATE/DELETE sin cambios (siguen requiriendo es_miembro).

DROP POLICY IF EXISTS "informes_select" ON public.informes;

CREATE POLICY "informes_select" ON public.informes
  FOR SELECT TO authenticated
  USING (
    es_miembro(clinica_id)
    AND (
      visibilidad IN ('expediente', 'compartido')
      OR medico_id = auth.uid()
    )
  );
