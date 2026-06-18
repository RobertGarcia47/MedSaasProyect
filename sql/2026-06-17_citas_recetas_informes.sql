-- ============================================================================
-- MedSaaS — Tablas clínicas: citas, recetas (+ medicamentos) e informes
-- Fecha: 2026-06-17
-- ----------------------------------------------------------------------------
-- Decisiones de diseño (sesión 2026-06-17):
--   A. recetas/informes se anclan a expediente_id (no a paciente_id), por
--      consistencia con la capa clínica cifrada (consultas) y para auditoría.
--   B. La receta puede crearse en cualquier momento; consulta_id es OPCIONAL.
--   C. informes.titulo va EN CLARO (para listar/buscar); el cuerpo va cifrado.
--   - citas = tabla operativa SEPARADA, SIN cifrado (motivo corto no sensible).
--   - Narrativa libre (receta.indicaciones, informe.cuerpo) → CIFRADA (§2.3).
--
-- ⚠️ El frontend NUNCA cifra/descifra: recetas/informes se escriben y leen SOLO
--    vía las RPCs de este script. receta_medicamentos y citas son texto plano.
--
-- ⚠️ Reglas reutilizadas (de la MEMORY del onboarding):
--   - Helpers RLS existentes: es_miembro(clinica_id), es_owner(clinica_id).
--   - Auditoría genérica fn_auditoria() (lee NEW.clinica_id → todas las tablas
--     nuevas tienen clinica_id, así que sirve directo).
--   - El cifrado se hace con el wrapper propio encrypt_text(text)->bytea y su
--     pareja decrypt_text(bytea)->text (los mismos que usa crear_consulta).
--     Esos wrappers encapsulan get_encryption_key()/pgcrypto; las RPCs de aquí
--     NO llaman pgcrypto directo (idéntico a crear_consulta).
--   - Patrón idéntico a crear_consulta: RPCs SECURITY INVOKER, sin set
--     search_path, SIN chequeo explícito de es_miembro → la autorización la da
--     la RLS de las tablas (de ahí que recetas/informes tengan políticas, NO
--     deny-all). Si el usuario no puede ver el expediente, clinica_id sale NULL
--     y el INSERT falla por NOT NULL (mismo guard implícito que crear_consulta).
--   - Los grants de tablas/funciones nuevas los cubre el ALTER DEFAULT
--     PRIVILEGES del setup (§4.1); abajo se añaden explícitos por si acaso.
--
-- ✅ VERIFICADO contra crear_consulta y obtener_consultas (2026-06-17):
--    - Cifrado: encrypt_text() / decrypt_text().
--    - RPCs INVOKER, sin set search_path, autorización por RLS.
--    - READ en auditoría vía INSERT…SELECT FROM expedientes (no-op si la RLS
--      oculta el expediente). Script listo para correr.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums (idempotentes)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE estado_cita AS ENUM (
    'programada', 'confirmada', 'sala_espera', 'en_curso',
    'completada', 'cancelada', 'no_asistio'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_informe AS ENUM (
    'nota_evolucion', 'nota_consulta', 'nota_obstetrica', 'interconsulta', 'otro'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. Tabla citas (agenda — texto plano, acceso directo del cliente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.citas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    uuid NOT NULL REFERENCES public.clinicas(id)   ON DELETE CASCADE,
  medico_id     uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE RESTRICT,
  paciente_id   uuid NOT NULL REFERENCES public.pacientes(id)  ON DELETE CASCADE,
  fecha         timestamptz NOT NULL,
  duracion_min  integer NOT NULL DEFAULT 30,
  estado        estado_cita NOT NULL DEFAULT 'programada',
  motivo        text,                                  -- corto, NO sensible
  consulta_id   uuid REFERENCES public.consultas(id)   ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_citas_clinica_fecha ON public.citas (clinica_id, fecha);
CREATE INDEX IF NOT EXISTS idx_citas_paciente      ON public.citas (paciente_id);

-- ---------------------------------------------------------------------------
-- 3. Tabla recetas (cabecera) + receta_medicamentos (líneas estructuradas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recetas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id         uuid NOT NULL REFERENCES public.clinicas(id)    ON DELETE CASCADE,
  expediente_id      uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  consulta_id        uuid REFERENCES public.consultas(id)            ON DELETE SET NULL,
  medico_id          uuid NOT NULL REFERENCES public.profiles(id)    ON DELETE RESTRICT,
  diagnostico_cie10  text REFERENCES public.cie10(codigo),           -- estructurado, plano
  indicaciones_enc   bytea,                                          -- narrativa libre CIFRADA
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recetas_expediente ON public.recetas (expediente_id);
CREATE INDEX IF NOT EXISTS idx_recetas_clinica    ON public.recetas (clinica_id);

CREATE TABLE IF NOT EXISTS public.receta_medicamentos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receta_id    uuid NOT NULL REFERENCES public.recetas(id)  ON DELETE CASCADE,
  clinica_id   uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  medicamento  text NOT NULL,
  dosis        text,
  frecuencia   text,
  duracion     text,
  via          text
);
CREATE INDEX IF NOT EXISTS idx_recetameds_receta ON public.receta_medicamentos (receta_id);

-- ---------------------------------------------------------------------------
-- 4. Tabla informes (título plano, cuerpo cifrado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.informes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id     uuid NOT NULL REFERENCES public.clinicas(id)    ON DELETE CASCADE,
  expediente_id  uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  consulta_id    uuid REFERENCES public.consultas(id)            ON DELETE SET NULL,
  medico_id      uuid NOT NULL REFERENCES public.profiles(id)    ON DELETE RESTRICT,
  tipo           tipo_informe NOT NULL DEFAULT 'otro',
  titulo         text NOT NULL,                                   -- EN CLARO
  cuerpo_enc     bytea,                                           -- narrativa libre CIFRADA
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_informes_expediente ON public.informes (expediente_id);
CREATE INDEX IF NOT EXISTS idx_informes_clinica    ON public.informes (clinica_id);

-- ---------------------------------------------------------------------------
-- 5. RLS — políticas es_miembro en TODAS (mismo patrón que consultas).
--    El cliente lee columnas estructuradas directo (rápido, sin RPC); las
--    columnas _enc simplemente no se seleccionan desde el front. La escritura
--    de recetas/informes pasa por las RPCs INVOKER, cuyo INSERT respeta estas
--    mismas políticas (igual que crear_consulta respeta la RLS de consultas).
-- ---------------------------------------------------------------------------
ALTER TABLE public.citas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recetas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receta_medicamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.informes            ENABLE ROW LEVEL SECURITY;

-- citas
DROP POLICY IF EXISTS "citas_select" ON public.citas;
CREATE POLICY "citas_select" ON public.citas
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));
DROP POLICY IF EXISTS "citas_insert" ON public.citas;
CREATE POLICY "citas_insert" ON public.citas
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));
DROP POLICY IF EXISTS "citas_update" ON public.citas;
CREATE POLICY "citas_update" ON public.citas
  FOR UPDATE TO authenticated USING (es_miembro(clinica_id)) WITH CHECK (es_miembro(clinica_id));
DROP POLICY IF EXISTS "citas_delete" ON public.citas;
CREATE POLICY "citas_delete" ON public.citas
  FOR DELETE TO authenticated USING (es_miembro(clinica_id));

-- recetas
DROP POLICY IF EXISTS "recetas_select" ON public.recetas;
CREATE POLICY "recetas_select" ON public.recetas
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));
DROP POLICY IF EXISTS "recetas_insert" ON public.recetas;
CREATE POLICY "recetas_insert" ON public.recetas
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));
DROP POLICY IF EXISTS "recetas_update" ON public.recetas;
CREATE POLICY "recetas_update" ON public.recetas
  FOR UPDATE TO authenticated USING (es_miembro(clinica_id)) WITH CHECK (es_miembro(clinica_id));

-- receta_medicamentos
DROP POLICY IF EXISTS "receta_meds_select" ON public.receta_medicamentos;
CREATE POLICY "receta_meds_select" ON public.receta_medicamentos
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));
DROP POLICY IF EXISTS "receta_meds_insert" ON public.receta_medicamentos;
CREATE POLICY "receta_meds_insert" ON public.receta_medicamentos
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));
DROP POLICY IF EXISTS "receta_meds_delete" ON public.receta_medicamentos;
CREATE POLICY "receta_meds_delete" ON public.receta_medicamentos
  FOR DELETE TO authenticated USING (es_miembro(clinica_id));

-- informes
DROP POLICY IF EXISTS "informes_select" ON public.informes;
CREATE POLICY "informes_select" ON public.informes
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));
DROP POLICY IF EXISTS "informes_insert" ON public.informes;
CREATE POLICY "informes_insert" ON public.informes
  FOR INSERT TO authenticated WITH CHECK (es_miembro(clinica_id));
DROP POLICY IF EXISTS "informes_update" ON public.informes;
CREATE POLICY "informes_update" ON public.informes
  FOR UPDATE TO authenticated USING (es_miembro(clinica_id)) WITH CHECK (es_miembro(clinica_id));

-- ---------------------------------------------------------------------------
-- 6. Auditoría — triggers (fn_auditoria genérica; todas tienen clinica_id)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_citas ON public.citas;
CREATE TRIGGER trg_audit_citas
  AFTER INSERT OR UPDATE OR DELETE ON public.citas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_audit_recetas ON public.recetas;
CREATE TRIGGER trg_audit_recetas
  AFTER INSERT OR UPDATE OR DELETE ON public.recetas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_audit_receta_meds ON public.receta_medicamentos;
CREATE TRIGGER trg_audit_receta_meds
  AFTER INSERT OR UPDATE OR DELETE ON public.receta_medicamentos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_audit_informes ON public.informes;
CREATE TRIGGER trg_audit_informes
  AFTER INSERT OR UPDATE OR DELETE ON public.informes
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- ---------------------------------------------------------------------------
-- 7. RPCs cifradas — recetas e informes
--    Patrón IDÉNTICO a crear_consulta: SECURITY INVOKER (default), sin set
--    search_path, cifrado vía encrypt_text() / descifrado vía decrypt_text().
--    La autorización la da la RLS de las tablas (la RLS de expedientes filtra
--    el SELECT de clinica_id; si el usuario no ve el expediente → v_clinica
--    NULL → el INSERT falla por NOT NULL, igual que crear_consulta).
-- ---------------------------------------------------------------------------

-- 7.1 crear_receta: inserta cabecera (cifra indicaciones) + medicamentos.
--     p_medicamentos: jsonb array de {medicamento, dosis, frecuencia, duracion, via}
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
  -- RLS de expedientes ya validó que el usuario puede ver ese expediente.

  insert into recetas (clinica_id, expediente_id, consulta_id, medico_id,
                       diagnostico_cie10, indicaciones_enc)
  values (v_clinica, p_expediente_id, p_consulta_id, auth.uid(),
          p_diagnostico_cie10,
          case when p_indicaciones is null or p_indicaciones = '' then null
               else encrypt_text(p_indicaciones) end)
  returning id into v_receta;

  for v_med in select * from jsonb_array_elements(coalesce(p_medicamentos, '[]'::jsonb))
  loop
    insert into receta_medicamentos (receta_id, clinica_id, medicamento, dosis, frecuencia, duracion, via)
    values (v_receta, v_clinica,
            v_med->>'medicamento', v_med->>'dosis', v_med->>'frecuencia',
            v_med->>'duracion',    v_med->>'via');
  end loop;

  return v_receta;
END; $$;

-- 7.2 obtener_recetas: descifra indicaciones, anida medicamentos, registra READ.
--     Mismo molde que obtener_consultas: INVOKER, decrypt_text(), y el READ se
--     registra con INSERT…SELECT FROM expedientes (la RLS lo vuelve no-op si el
--     usuario no puede ver el expediente). tabla='recetas' para granularidad.
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
                    'frecuencia', m.frecuencia, 'duracion', m.duracion, 'via', m.via))
           from receta_medicamentos m where m.receta_id = r.id
         ), '[]'::jsonb),
         r.created_at
  from recetas r
  where r.expediente_id = p_expediente_id   -- RLS filtra lo demás
  order by r.created_at desc;
end; $$;

-- 7.3 crear_informe: cifra el cuerpo, título en claro.
CREATE OR REPLACE FUNCTION public.crear_informe(
  p_expediente_id uuid,
  p_tipo          tipo_informe,
  p_titulo        text,
  p_cuerpo        text DEFAULT NULL,
  p_consulta_id   uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_clinica uuid;
  v_informe uuid;
BEGIN
  select clinica_id into v_clinica from expedientes where id = p_expediente_id;

  insert into informes (clinica_id, expediente_id, consulta_id, medico_id, tipo, titulo, cuerpo_enc)
  values (v_clinica, p_expediente_id, p_consulta_id, auth.uid(), p_tipo, p_titulo,
          case when p_cuerpo is null or p_cuerpo = '' then null
               else encrypt_text(p_cuerpo) end)
  returning id into v_informe;

  return v_informe;
END; $$;

-- 7.4 obtener_informes: descifra el cuerpo, registra READ (mismo molde que 7.2).
CREATE OR REPLACE FUNCTION public.obtener_informes(p_expediente_id uuid)
RETURNS TABLE (
  id          uuid,
  consulta_id uuid,
  medico_id   uuid,
  tipo        tipo_informe,
  titulo      text,
  cuerpo      text,
  created_at  timestamptz
)
LANGUAGE plpgsql
AS $$
begin
  insert into auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  select e.clinica_id, auth.uid(), 'READ', 'informes', e.id
  from expedientes e where e.id = p_expediente_id;

  return query
  select i.id, i.consulta_id, i.medico_id, i.tipo, i.titulo,
         case when i.cuerpo_enc is null then null
              else decrypt_text(i.cuerpo_enc) end,
         i.created_at
  from informes i
  where i.expediente_id = p_expediente_id   -- RLS filtra lo demás
  order by i.created_at desc;
end; $$;

-- ---------------------------------------------------------------------------
-- 8. Grants explícitos (belt-and-suspenders; el ALTER DEFAULT PRIVILEGES del
--    setup ya debería cubrirlos para objetos nuevos).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.citas               TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recetas             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receta_medicamentos TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.informes            TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.crear_receta(uuid, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_recetas(uuid)                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crear_informe(uuid, tipo_informe, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_informes(uuid)                       TO authenticated, service_role;

-- Fin del script.
