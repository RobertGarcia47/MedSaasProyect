-- ============================================================================
-- MedSaaS — medico_detalles: cualquier miembro de la MISMA clínica puede leer
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- Otro bug destapado al probar el alta de asistentes: fetchMedicosClinica()
-- (src/lib/equipo.ts) necesita ver qué médicos de la clínica tienen cédula,
-- para el picker "¿para qué médico?" de Nuevo paciente/Agendar cita. Si
-- medico_detalles solo es legible por el propio dueño de la fila (lo más
-- probable, es lo razonable por defecto), un asistente consultando la cédula
-- del owner/médico obtiene 0 filas — el picker sale vacío aunque SÍ haya
-- médicos con cédula en la clínica.
--
-- medico_detalles NO tiene columna clinica_id (es profile-scoped, 1:N con
-- profiles), así que no se puede usar es_miembro(clinica_id) directo como en
-- las demás tablas — se compara vía clinica_miembros de ambos lados: ¿el
-- dueño de esta fila de medico_detalles comparte alguna clínica activa con
-- quien está consultando?
--
-- Aditivo: policy nueva, no reemplaza ninguna existente (self-only sigue
-- funcionando si ya estaba, esto solo AMPLÍA a compañeros de clínica).
-- ============================================================================

DROP POLICY IF EXISTS "medico_detalles_select_colegas" ON public.medico_detalles;
CREATE POLICY "medico_detalles_select_colegas" ON public.medico_detalles
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.clinica_miembros cm_target
      JOIN public.clinica_miembros cm_self ON cm_self.clinica_id = cm_target.clinica_id
      WHERE cm_target.profile_id = medico_detalles.profile_id
        AND cm_self.profile_id = auth.uid()
        AND cm_target.activo
        AND cm_self.activo
    )
  );

-- Fin del script.
