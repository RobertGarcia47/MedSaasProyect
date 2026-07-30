-- ============================================================================
-- MedSaaS — Usar el modelo medico_asistentes ya existente (en vez de las
-- políticas "cualquier miembro" que agregué antes de saber que esta tabla
-- existía)
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- El schema base YA tenía un diseño más fino: medico_asistentes(clinica_id,
-- medico_id, asistente_id) — un asistente solo puede crear/ver pacientes de
-- los médicos a los que está asignado (pacientes_write/pacientes_select ya lo
-- comprueban; consultas/expedientes también). Mis policies
-- pacientes_insert_equipo/citas_insert_equipo (script anterior de hoy)
-- pasaban por encima de eso dejando a CUALQUIER miembro crear pacientes/citas
-- para CUALQUIER médico — mal en una clínica con más de un médico. Se
-- revierten y en su lugar se completa el flujo real: la invitación de un
-- asistente ahora incluye a qué médico queda asignado, y aceptar_invitacion
-- crea esa fila en medico_asistentes.
-- ============================================================================

-- 1. Revertir las policies demasiado amplias.
DROP POLICY IF EXISTS "pacientes_insert_equipo" ON public.pacientes;
DROP POLICY IF EXISTS "citas_insert_equipo" ON public.citas;

-- 2. invitaciones_equipo: a qué médico se asigna (solo aplica si rol=asistente).
ALTER TABLE public.invitaciones_equipo
  ADD COLUMN IF NOT EXISTS medico_asignado_id uuid REFERENCES public.profiles(id);

-- 3. crear_invitacion: nuevo parámetro opcional.
CREATE OR REPLACE FUNCTION public.crear_invitacion(
  p_clinica_id uuid,
  p_rol        rol_invitacion,
  p_email      text,
  p_medico_asignado_id uuid DEFAULT NULL
) RETURNS public.invitaciones_equipo
LANGUAGE plpgsql
AS $$
DECLARE
  v_row public.invitaciones_equipo;
BEGIN
  INSERT INTO public.invitaciones_equipo (clinica_id, rol, email, invitado_por, medico_asignado_id)
  VALUES (p_clinica_id, p_rol, lower(trim(p_email)), auth.uid(), p_medico_asignado_id)
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.crear_invitacion(uuid, rol_invitacion, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_invitacion(uuid, rol_invitacion, text, uuid) TO authenticated;

-- 4. aceptar_invitacion: además de clinica_miembros, crea la asignación
--    médico↔asistente cuando aplica. SECURITY DEFINER (igual que antes) — no
--    pasa por la RLS de medico_asistentes (que exige medico_id=auth.uid() o
--    es_owner), porque quien acepta la invitación es el ASISTENTE, no el
--    médico ni el owner.
CREATE OR REPLACE FUNCTION public.aceptar_invitacion(p_codigo text, p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitaciones_equipo;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitaciones_equipo
  WHERE codigo = p_codigo AND estado = 'pendiente' AND expira_en > now()
  FOR UPDATE;

  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'Invitación inválida, vencida o ya usada';
  END IF;

  IF lower(v_inv.email) IS DISTINCT FROM lower(coalesce(auth.email(), '')) THEN
    RAISE EXCEPTION 'Esta invitación es para otro correo';
  END IF;

  INSERT INTO public.clinica_miembros (clinica_id, profile_id, rol, activo)
  VALUES (v_inv.clinica_id, auth.uid(), v_inv.rol::text::rol_clinica, true);

  IF v_inv.rol = 'asistente' AND v_inv.medico_asignado_id IS NOT NULL THEN
    INSERT INTO public.medico_asistentes (clinica_id, medico_id, asistente_id)
    VALUES (v_inv.clinica_id, v_inv.medico_asignado_id, auth.uid());
  END IF;

  UPDATE public.profiles
  SET nombre = p_nombre, onboarding_completed = true
  WHERE id = auth.uid();

  UPDATE public.invitaciones_equipo
  SET estado = 'aceptada', aceptada_en = now(), aceptada_por = auth.uid()
  WHERE id = v_inv.id;
END; $$;

REVOKE ALL ON FUNCTION public.aceptar_invitacion(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.aceptar_invitacion(text, text) TO authenticated;

-- Fin del script.
