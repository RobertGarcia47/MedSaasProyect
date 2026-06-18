-- ============================================================================
-- MedSaaS — Receta: instrucciones por medicamento + flag de controlado
-- Fecha: 2026-06-18
-- ----------------------------------------------------------------------------
-- El diseño de "Nueva receta" agrega, por medicamento:
--   - instrucciones (texto libre por fármaco)
--   - controlado (boolean; dispara aviso normativo de folio/receta especial)
-- La tabla receta_medicamentos no tenía esas columnas. Este script las agrega
-- y actualiza crear_receta (para guardarlas) y obtener_receta? (para devolverlas
-- anidadas). Idempotente.
--
-- ⚠️ Mantiene el patrón existente: crear_receta sigue recibiendo p_medicamentos
--    como jsonb; solo se leen 2 claves más por elemento ('instrucciones',
--    'controlado'). obtener_recetas las incluye en el jsonb de medicamentos.
-- ============================================================================

-- 1. Columnas nuevas (idempotente)
ALTER TABLE public.receta_medicamentos
  ADD COLUMN IF NOT EXISTS instrucciones text,
  ADD COLUMN IF NOT EXISTS controlado    boolean NOT NULL DEFAULT false;

-- 2. crear_receta — ahora mapea instrucciones y controlado de cada medicamento
CREATE OR REPLACE FUNCTION public.crear_receta(
  p_expediente_id     uuid,
  p_diagnostico_cie10 text  DEFAULT NULL,
  p_indicaciones      text  DEFAULT NULL,
  p_medicamentos      jsonb DEFAULT '[]'::jsonb,
  p_consulta_id       uuid  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica uuid;
  v_receta  uuid;
  v_med     jsonb;
BEGIN
  select clinica_id into v_clinica from expedientes where id = p_expediente_id;

  insert into recetas (clinica_id, expediente_id, consulta_id, medico_id,
                       diagnostico_cie10, indicaciones_enc)
  values (v_clinica, p_expediente_id, p_consulta_id, auth.uid(),
          p_diagnostico_cie10,
          case when p_indicaciones is null or p_indicaciones = '' then null
               else encrypt_text(p_indicaciones) end)
  returning id into v_receta;

  for v_med in select * from jsonb_array_elements(coalesce(p_medicamentos, '[]'::jsonb))
  loop
    insert into receta_medicamentos (receta_id, clinica_id, medicamento, dosis,
                                     frecuencia, duracion, via, instrucciones, controlado)
    values (v_receta, v_clinica,
            v_med->>'medicamento', v_med->>'dosis', v_med->>'frecuencia',
            v_med->>'duracion',    v_med->>'via',   v_med->>'instrucciones',
            coalesce((v_med->>'controlado')::boolean, false));
  end loop;

  return v_receta;
END; $$;

-- 3. obtener_recetas — devuelve instrucciones y controlado anidados
CREATE OR REPLACE FUNCTION public.obtener_recetas(p_expediente_id uuid)
RETURNS TABLE (
  id                uuid,
  consulta_id       uuid,
  medico_id         uuid,
  diagnostico_cie10 text,
  indicaciones      text,
  medicamentos      jsonb,
  created_at        timestamptz
)
LANGUAGE plpgsql
AS $$
begin
  insert into auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  select e.clinica_id, auth.uid(), 'READ', 'recetas', e.id
  from expedientes e where e.id = p_expediente_id;

  return query
  select r.id, r.consulta_id, r.medico_id, r.diagnostico_cie10,
         case when r.indicaciones_enc is null then null
              else decrypt_text(r.indicaciones_enc) end,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'medicamento', m.medicamento, 'dosis', m.dosis,
                    'frecuencia', m.frecuencia, 'duracion', m.duracion, 'via', m.via,
                    'instrucciones', m.instrucciones, 'controlado', m.controlado))
           from receta_medicamentos m where m.receta_id = r.id
         ), '[]'::jsonb),
         r.created_at
  from recetas r
  where r.expediente_id = p_expediente_id   -- RLS filtra lo demás
  order by r.created_at desc;
end; $$;

-- Fin del script.
