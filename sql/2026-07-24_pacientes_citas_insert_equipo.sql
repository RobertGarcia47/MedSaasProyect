-- ============================================================================
-- MedSaaS — pacientes/citas: permite INSERT a cualquier miembro (no solo al
-- propio médico), ahora que un asistente puede registrar pacientes/agendar
-- citas EN NOMBRE de un médico de la clínica.
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- Bug destapado al probar el alta de asistentes: al crear un paciente como
-- asistente, con medico_id = el médico elegido en el picker (no el propio
-- auth.uid() del asistente), Supabase devolvió "new row violates row-level
-- security policy for table pacientes". La policy de INSERT que ya existía
-- probablemente exige medico_id = auth.uid() (tenía sentido cuando SOLO un
-- médico podía crear sus propios pacientes/citas — antes de hoy no existía
-- otro caso). citas tiene el mismo patrón (medico_id elegido por el picker
-- de AppointmentModal/QuickCitaModal), así que se corrige igual por
-- adelantado aunque el error todavía no se haya visto ahí.
--
-- Aditivo: policies nuevas con nombre propio, no reemplazan ni tocan las que
-- ya existan (Postgres combina policies permisivas del mismo comando con OR
-- — esto solo AMPLÍA quién puede insertar, nunca quita acceso al que ya
-- funcionaba).
-- ============================================================================

DROP POLICY IF EXISTS "pacientes_insert_equipo" ON public.pacientes;
CREATE POLICY "pacientes_insert_equipo" ON public.pacientes
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));

DROP POLICY IF EXISTS "citas_insert_equipo" ON public.citas;
CREATE POLICY "citas_insert_equipo" ON public.citas
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));

-- Fin del script.
