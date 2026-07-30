-- ============================================================================
-- MedSaaS — Alta/baja de equipo (asistentes y médicos adicionales) por invitación
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- Hoy no existe ninguna forma de sumar personal a una clínica ya creada dentro
-- de MedSaasProyect (el tab "Registrarse" de Login.tsx solo abre el onboarding
-- externo, que crea CLÍNICAS nuevas, no personal para una existente).
--
-- Diseño: invitación por link/código que el owner comparte a mano (WhatsApp,
-- correo, etc.) — decisión explícita del usuario, sin infraestructura de envío
-- de correo nueva. El código es un token aleatorio de 16 bytes (32 hex chars),
-- no adivinable por fuerza bruta razonable.
--
-- Dos RPCs son SECURITY DEFINER a propósito (únicas excepciones al patrón
-- INVOKER del resto del proyecto): quien las llama TODAVÍA NO es miembro de la
-- clínica, así que la RLS normal (es_owner/es_miembro) no le dejaría ver nada.
-- Alcance de cada una deliberadamente angosto — ver comentarios en cada RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla invitaciones_equipo
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE rol_invitacion AS ENUM ('medico', 'asistente');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE estado_invitacion AS ENUM ('pendiente', 'aceptada', 'revocada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.invitaciones_equipo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  rol           rol_invitacion NOT NULL,
  email         text NOT NULL,
  codigo        text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  estado        estado_invitacion NOT NULL DEFAULT 'pendiente',
  invitado_por  uuid NOT NULL REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expira_en     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  aceptada_en   timestamptz,
  aceptada_por  uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_invitaciones_clinica ON public.invitaciones_equipo (clinica_id);
CREATE INDEX IF NOT EXISTS idx_invitaciones_codigo   ON public.invitaciones_equipo (codigo);

ALTER TABLE public.invitaciones_equipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitaciones_select" ON public.invitaciones_equipo;
CREATE POLICY "invitaciones_select" ON public.invitaciones_equipo
  FOR SELECT TO authenticated USING (es_owner(clinica_id));

DROP POLICY IF EXISTS "invitaciones_insert" ON public.invitaciones_equipo;
CREATE POLICY "invitaciones_insert" ON public.invitaciones_equipo
  FOR INSERT TO authenticated WITH CHECK (es_owner(clinica_id) AND invitado_por = auth.uid());

DROP POLICY IF EXISTS "invitaciones_update" ON public.invitaciones_equipo;
CREATE POLICY "invitaciones_update" ON public.invitaciones_equipo
  FOR UPDATE TO authenticated USING (es_owner(clinica_id)) WITH CHECK (es_owner(clinica_id));

GRANT SELECT, INSERT, UPDATE ON public.invitaciones_equipo TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. clinica_miembros — amplía SELECT a todo el equipo, UPDATE solo al owner
--    (hoy el frontend solo hacía SELECT de la fila propia; el roster del tab
--    "Equipo" necesita ver a todos los miembros de la clínica).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clinica_miembros_select" ON public.clinica_miembros;
CREATE POLICY "clinica_miembros_select" ON public.clinica_miembros
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));

DROP POLICY IF EXISTS "clinica_miembros_update_owner" ON public.clinica_miembros;
CREATE POLICY "clinica_miembros_update_owner" ON public.clinica_miembros
  FOR UPDATE TO authenticated USING (es_owner(clinica_id)) WITH CHECK (es_owner(clinica_id));

-- Sin política de INSERT client-side a propósito: la única vía de alta es la
-- RPC aceptar_invitacion (definer), no un INSERT directo desde el frontend.

-- ---------------------------------------------------------------------------
-- 3. crear_invitacion — INVOKER, la RLS de INSERT hace de guardia (es_owner).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_invitacion(
  p_clinica_id uuid,
  p_rol        rol_invitacion,
  p_email      text
) RETURNS public.invitaciones_equipo
LANGUAGE plpgsql
AS $$
DECLARE
  v_row public.invitaciones_equipo;
BEGIN
  INSERT INTO public.invitaciones_equipo (clinica_id, rol, email, invitado_por)
  VALUES (p_clinica_id, p_rol, lower(trim(p_email)), auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.crear_invitacion(uuid, rol_invitacion, text) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_invitacion(uuid, rol_invitacion, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. revocar_invitacion — INVOKER, la RLS de UPDATE hace de guardia (es_owner).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revocar_invitacion(p_invitacion_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.invitaciones_equipo
  SET estado = 'revocada'
  WHERE id = p_invitacion_id AND estado = 'pendiente';
END; $$;

REVOKE ALL ON FUNCTION public.revocar_invitacion(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revocar_invitacion(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. previsualizar_invitacion — DEFINER. Quien la llama puede no tener sesión
--    todavía (se muestra antes del signUp) o tenerla sin ser miembro de nada.
--    Alcance angosto: solo expone clínica+rol+email de un código PENDIENTE y
--    no expirado — nada más de la clínica ni de otras invitaciones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.previsualizar_invitacion(p_codigo text)
RETURNS TABLE (clinica_nombre text, rol rol_invitacion, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.nombre, i.rol, i.email
  FROM public.invitaciones_equipo i
  JOIN public.clinicas c ON c.id = i.clinica_id
  WHERE i.codigo = p_codigo
    AND i.estado = 'pendiente'
    AND i.expira_en > now();
END; $$;

REVOKE ALL ON FUNCTION public.previsualizar_invitacion(text) FROM public;
GRANT EXECUTE ON FUNCTION public.previsualizar_invitacion(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. aceptar_invitacion — DEFINER. La ejecuta un usuario YA autenticado (recién
--    hizo signUp) pero sin membresía todavía — por eso no puede depender de
--    es_miembro/es_owner. Lo único que hace: si el código es válido y el email
--    de la sesión coincide con el de la invitación, suma al llamante a ESA
--    clínica con ESE rol, marca su perfil como onboarding completo (si no, el
--    gate de loadAccountContext lo cerraría con "onboarding-incompleto"), y
--    cierra la invitación. No hay forma de usarla para unirse a otra clínica
--    ni con otro rol que los del código.
-- ---------------------------------------------------------------------------
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

  -- Sin ON CONFLICT: quien llega aquí acaba de hacer signUp por primera vez
  -- (flujo de aceptar invitación), no puede tener ya una fila en esta tabla.
  -- clinica_miembros.rol es el enum rol_clinica (no text) — cast vía texto,
  -- ambos enums comparten las etiquetas 'medico'/'asistente'.
  INSERT INTO public.clinica_miembros (clinica_id, profile_id, rol, activo)
  VALUES (v_inv.clinica_id, auth.uid(), v_inv.rol::text::rol_clinica, true);

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
