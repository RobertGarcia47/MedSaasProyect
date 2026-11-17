-- ============================================================================
-- MedSaaS — IA: consentimiento por clínica y registro de uso
-- Fecha: 2026-11-17
-- ----------------------------------------------------------------------------
-- Las funciones de IA (Resumen IA, sugerencia de CIE-10, y las que vengan) mandan texto clínico
-- sin identidad a un proveedor externo (Anthropic). Antes de eso la CLÍNICA debe haberlo
-- aceptado, y eso tiene que quedar en la base (no en el navegador de alguien):
--
--   1. clinicas.ia_habilitada (+ quién, cuándo y qué versión del texto aceptó). Por defecto
--      APAGADA: ninguna clínica existente usa IA hasta que su propietario la active.
--      Solo el propietario puede cambiarla (RPC configurar_ia_clinica).
--   2. ia_uso: una fila por cada llamada a la IA (función, modelo, tokens). Sirve para el
--      límite de frecuencia por usuario, el tope mensual por clínica y, más adelante, los
--      cupos por plan.
--   3. ia_estado(clinica): lo que necesitan la app y las Edge Functions en UNA llamada
--      (¿está habilitada?, datos del consentimiento, usos del mes y de los últimos 5 min).
--
-- Las Edge Functions (resumen-paciente, sugerir-cie10) rechazan la petición si la clínica no
-- tiene la IA habilitada, así que apagar el interruptor la corta de verdad, no solo en pantalla.
--
-- Supuestos: existen es_miembro(uuid), es_owner(uuid), y la tabla auditoria
-- (clinica_id, profile_id, accion, tabla, registro_id, detalles). Si el insert en auditoria
-- falla, la RPC NO falla (solo avisa).
-- ============================================================================

-- ── 1. Consentimiento en la clínica ───────────────────────────────────────────
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS ia_habilitada            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ia_consentimiento_at     timestamptz,
  ADD COLUMN IF NOT EXISTS ia_consentimiento_por    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS ia_consentimiento_version text;

-- ── 2. Registro de uso ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_uso (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinica_id    uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  funcion       text NOT NULL,                 -- 'resumen_paciente', 'sugerir_cie10', …
  modelo        text,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_uso_clinica_fecha ON public.ia_uso (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ia_uso_perfil_fecha  ON public.ia_uso (profile_id, created_at DESC);

ALTER TABLE public.ia_uso ENABLE ROW LEVEL SECURITY;

-- Cada quien ve lo suyo; el propietario ve todo el uso de su clínica.
DROP POLICY IF EXISTS "ia_uso_select" ON public.ia_uso;
CREATE POLICY "ia_uso_select" ON public.ia_uso
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR es_owner(clinica_id));

-- Solo se puede registrar uso propio y en una clínica de la que se es miembro.
DROP POLICY IF EXISTS "ia_uso_insert" ON public.ia_uso;
CREATE POLICY "ia_uso_insert" ON public.ia_uso
  FOR INSERT TO authenticated
  WITH CHECK (es_miembro(clinica_id) AND profile_id = auth.uid());

-- (a propósito no hay UPDATE ni DELETE: es un registro)
GRANT SELECT, INSERT ON public.ia_uso TO authenticated, service_role;

-- ── 3. Estado de la IA en una clínica ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ia_estado(p_clinica_id uuid)
RETURNS TABLE (
  habilitada             boolean,
  consentimiento_version text,
  consentimiento_at      timestamptz,
  consentimiento_por     text,
  usos_mes               integer,
  usos_5min              integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.ia_habilitada,
    c.ia_consentimiento_version,
    c.ia_consentimiento_at,
    NULLIF(btrim(concat_ws(' ', p.nombre, p.apellido_paterno)), ''),
    (SELECT count(*)::int FROM public.ia_uso u
       WHERE u.clinica_id = c.id AND u.created_at >= date_trunc('month', now())),
    (SELECT count(*)::int FROM public.ia_uso u
       WHERE u.clinica_id = c.id AND u.profile_id = auth.uid() AND u.created_at >= now() - interval '5 minutes')
  FROM public.clinicas c
  LEFT JOIN public.profiles p ON p.id = c.ia_consentimiento_por
  WHERE c.id = p_clinica_id AND es_miembro(p_clinica_id);
$$;

-- ── 4. Activar / desactivar (solo el propietario) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.configurar_ia_clinica(
  p_clinica_id uuid,
  p_habilitada boolean,
  p_version    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT es_owner(p_clinica_id) THEN
    RAISE EXCEPTION 'Solo el propietario de la clínica puede cambiar la configuración de IA'
      USING ERRCODE = '42501';
  END IF;

  IF p_habilitada THEN
    IF coalesce(btrim(p_version), '') = '' THEN
      RAISE EXCEPTION 'Falta la versión del consentimiento aceptado';
    END IF;
    UPDATE public.clinicas
       SET ia_habilitada = true,
           ia_consentimiento_at = now(),
           ia_consentimiento_por = auth.uid(),
           ia_consentimiento_version = p_version
     WHERE id = p_clinica_id;
  ELSE
    -- Se conserva quién/cuándo aceptó la última vez (historia); solo se apaga.
    UPDATE public.clinicas SET ia_habilitada = false WHERE id = p_clinica_id;
  END IF;

  BEGIN
    INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id, detalles)
    VALUES (p_clinica_id, auth.uid(), 'UPDATE', 'clinicas', p_clinica_id,
            jsonb_build_object('campo', 'ia_habilitada', 'valor', p_habilitada, 'version', p_version));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'configurar_ia_clinica: no se pudo auditar (%)', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.ia_estado(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.configurar_ia_clinica(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ia_estado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_ia_clinica(uuid, boolean, text) TO authenticated;

-- ── 5. Verificación (opcional) ────────────────────────────────────────────────
-- SELECT id, nombre, ia_habilitada FROM public.clinicas;            -- todas en false
-- SELECT * FROM public.ia_estado('<tu clinica_id>');                -- 1 fila si eres miembro
