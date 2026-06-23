-- 2026-06-19 — Fix obtener_informes: "column reference id is ambiguous"
-- El RETURNS TABLE define una columna "id" que colisionaba con expedientes.id
-- en el WHERE del primer SELECT. Fix: usar alias de tabla en todas las refs.

DROP FUNCTION IF EXISTS public.obtener_informes(uuid);

CREATE OR REPLACE FUNCTION public.obtener_informes(
  p_expediente_id uuid
)
RETURNS TABLE (
  id             uuid,
  consulta_id    uuid,
  medico_id      uuid,
  tipo           tipo_informe,
  titulo         text,
  cuerpo         text,
  visibilidad    text,
  tags           text[],
  fecha_informe  date,
  created_at     timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica_id uuid;
BEGIN
  SELECT e.clinica_id INTO v_clinica_id
    FROM expedientes e WHERE e.id = p_expediente_id;

  INSERT INTO public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
    SELECT v_clinica_id, auth.uid(), 'READ', 'informes', p_expediente_id
    WHERE v_clinica_id IS NOT NULL;

  RETURN QUERY
    SELECT
      i.id,
      i.consulta_id,
      i.medico_id,
      i.tipo,
      i.titulo,
      CASE WHEN i.cuerpo_enc IS NOT NULL THEN decrypt_text(i.cuerpo_enc) ELSE NULL END,
      i.visibilidad,
      i.tags,
      i.fecha_informe,
      i.created_at
    FROM public.informes i
    WHERE i.expediente_id = p_expediente_id
    ORDER BY i.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_informes(uuid) TO authenticated, service_role;
