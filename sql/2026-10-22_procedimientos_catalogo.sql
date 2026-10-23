-- ============================================================================
-- MedSaaS — Catálogo de procedimientos y precios (Dentista, Fase 2)
-- Fecha: 2026-10-22
-- ----------------------------------------------------------------------------
-- Dos tablas:
--   procedimientos_base  GLOBAL y de solo lectura (como cie10 / tipos_estudio_lab):
--                        catálogo sugerido de procedimientos dentales, sin precios.
--   procedimientos       POR CLÍNICA: el catálogo real de cada consultorio, con su
--                        precio y duración. Lo ve todo el equipo; solo el owner lo edita
--                        (los precios son decisión del dueño, no del asistente).
--
-- Una RPC copia el catálogo base a la clínica (cargar_procedimientos_base): es
-- idempotente (no duplica ni pisa precios ya puestos) y SECURITY INVOKER, así que la
-- política de INSERT (solo owner) es la que la autoriza — un no-owner recibe 42501.
--
-- Fase siguiente (NO incluida aquí): citas.procedimiento_id y el plan de tratamiento
-- tomarán nombre/precio de esta tabla como instantánea al momento de usarlos, por lo que
-- borrar o cambiar un procedimiento aquí no altera nada ya registrado.
--
-- Supuestos a confirmar al correrlo:
--   * es_miembro(uuid) / es_owner(uuid) existen (ver 2026-06-17_citas_recetas_informes.sql).
--   * fn_auditoria() existe (se usa igual en oportunidades_citas); aquí solo audita
--     UPDATE y DELETE — el alta masiva del catálogo base no llena la auditoría.
-- ============================================================================

-- ── 1. Catálogo base global ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procedimientos_base (
  codigo        text PRIMARY KEY,
  nombre        text NOT NULL,
  categoria     text NOT NULL,
  especialidad  text NOT NULL DEFAULT 'dental',
  duracion_min  integer NOT NULL DEFAULT 30 CHECK (duracion_min > 0)
);

ALTER TABLE public.procedimientos_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "procedimientos_base_select" ON public.procedimientos_base;
CREATE POLICY "procedimientos_base_select" ON public.procedimientos_base
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.procedimientos_base TO authenticated, service_role;

-- ── 2. Catálogo por clínica ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procedimientos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  codigo        text,                                   -- opcional; único por clínica si existe
  nombre        text NOT NULL CHECK (length(btrim(nombre)) > 0),
  categoria     text,
  duracion_min  integer NOT NULL DEFAULT 30 CHECK (duracion_min > 0),
  precio        numeric(12,2) CHECK (precio IS NULL OR precio >= 0),   -- MXN; NULL = sin precio aún
  activo        boolean NOT NULL DEFAULT true,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Los NULL no chocan entre sí en UNIQUE: varios procedimientos sin código son válidos.
  CONSTRAINT procedimientos_clinica_codigo_uk UNIQUE (clinica_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_procedimientos_clinica_activo
  ON public.procedimientos (clinica_id, activo, categoria, nombre);

CREATE OR REPLACE FUNCTION public.procedimientos_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procedimientos_updated_at ON public.procedimientos;
CREATE TRIGGER trg_procedimientos_updated_at
  BEFORE UPDATE ON public.procedimientos
  FOR EACH ROW EXECUTE FUNCTION public.procedimientos_set_updated_at();

-- ── 3. RLS: lee todo el equipo, escribe solo el owner ─────────────────────────
ALTER TABLE public.procedimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "procedimientos_select" ON public.procedimientos;
CREATE POLICY "procedimientos_select" ON public.procedimientos
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));

DROP POLICY IF EXISTS "procedimientos_insert" ON public.procedimientos;
CREATE POLICY "procedimientos_insert" ON public.procedimientos
  FOR INSERT TO authenticated WITH CHECK (es_owner(clinica_id));

DROP POLICY IF EXISTS "procedimientos_update" ON public.procedimientos;
CREATE POLICY "procedimientos_update" ON public.procedimientos
  FOR UPDATE TO authenticated USING (es_owner(clinica_id)) WITH CHECK (es_owner(clinica_id));

DROP POLICY IF EXISTS "procedimientos_delete" ON public.procedimientos;
CREATE POLICY "procedimientos_delete" ON public.procedimientos
  FOR DELETE TO authenticated USING (es_owner(clinica_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedimientos TO authenticated, service_role;

-- Auditoría de cambios de precio/baja (no del alta masiva del catálogo base).
DROP TRIGGER IF EXISTS trg_audit_procedimientos ON public.procedimientos;
CREATE TRIGGER trg_audit_procedimientos
  AFTER UPDATE OR DELETE ON public.procedimientos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

-- ── 4. RPC: copiar el catálogo base a la clínica ──────────────────────────────
-- Devuelve cuántos procedimientos NUEVOS agregó (0 si ya los tenía todos).
-- No toca los que ya existen (mismo código): conserva precio, nombre y estado.
CREATE OR REPLACE FUNCTION public.cargar_procedimientos_base(
  p_clinica_id   uuid,
  p_especialidad text DEFAULT 'dental'
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.procedimientos (clinica_id, codigo, nombre, categoria, duracion_min)
  SELECT p_clinica_id, b.codigo, b.nombre, b.categoria, b.duracion_min
  FROM public.procedimientos_base b
  WHERE b.especialidad = p_especialidad
  ON CONFLICT (clinica_id, codigo) DO NOTHING;   -- la RLS de INSERT exige es_owner

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cargar_procedimientos_base(uuid, text) TO authenticated, service_role;

-- ── 5. Catálogo base dental (sin precios) ─────────────────────────────────────
INSERT INTO public.procedimientos_base (codigo, nombre, categoria, especialidad, duracion_min) VALUES
  -- Diagnóstico
  ('DX01', 'Consulta de valoración',                      'Diagnóstico',     'dental', 30),
  ('DX02', 'Radiografía periapical',                      'Diagnóstico',     'dental', 10),
  ('DX03', 'Radiografía de aleta de mordida',             'Diagnóstico',     'dental', 10),
  ('DX04', 'Radiografía panorámica',                      'Diagnóstico',     'dental', 15),
  ('DX05', 'Estudio fotográfico y modelos',               'Diagnóstico',     'dental', 30),
  -- Prevención
  ('PR01', 'Profilaxis (limpieza dental)',                'Prevención',      'dental', 45),
  ('PR02', 'Aplicación de flúor',                         'Prevención',      'dental', 20),
  ('PR03', 'Sellador de fosetas y fisuras (por diente)',  'Prevención',      'dental', 20),
  ('PR04', 'Control de placa y técnica de cepillado',     'Prevención',      'dental', 30),
  -- Operatoria
  ('OP01', 'Resina de 1 superficie',                      'Operatoria',      'dental', 40),
  ('OP02', 'Resina de 2 superficies',                     'Operatoria',      'dental', 50),
  ('OP03', 'Resina de 3 o más superficies',               'Operatoria',      'dental', 60),
  ('OP04', 'Restauración con ionómero de vidrio',         'Operatoria',      'dental', 40),
  ('OP05', 'Reconstrucción de muñón',                     'Operatoria',      'dental', 60),
  -- Endodoncia
  ('EN01', 'Endodoncia unirradicular',                    'Endodoncia',      'dental', 60),
  ('EN02', 'Endodoncia birradicular',                     'Endodoncia',      'dental', 75),
  ('EN03', 'Endodoncia multirradicular',                  'Endodoncia',      'dental', 90),
  ('EN04', 'Pulpotomía',                                  'Endodoncia',      'dental', 40),
  ('EN05', 'Retratamiento de conductos',                  'Endodoncia',      'dental', 90),
  -- Periodoncia
  ('PE01', 'Raspado y alisado radicular (por cuadrante)', 'Periodoncia',     'dental', 45),
  ('PE02', 'Curetaje',                                    'Periodoncia',     'dental', 45),
  ('PE03', 'Gingivectomía',                               'Periodoncia',     'dental', 60),
  ('PE04', 'Aumento de corona clínica',                   'Periodoncia',     'dental', 60),
  -- Cirugía
  ('CI01', 'Extracción simple',                           'Cirugía',         'dental', 30),
  ('CI02', 'Extracción quirúrgica',                       'Cirugía',         'dental', 60),
  ('CI03', 'Extracción de tercer molar retenido',         'Cirugía',         'dental', 75),
  ('CI04', 'Incisión y drenaje de absceso',               'Cirugía',         'dental', 30),
  ('CI05', 'Frenectomía',                                 'Cirugía',         'dental', 40),
  ('CI06', 'Biopsia de tejido blando',                    'Cirugía',         'dental', 40),
  -- Prótesis
  ('PT01', 'Corona metal-porcelana',                      'Prótesis',        'dental', 60),
  ('PT02', 'Corona de zirconia o cerámica',               'Prótesis',        'dental', 60),
  ('PT03', 'Incrustación (inlay / onlay)',                'Prótesis',        'dental', 60),
  ('PT04', 'Carilla de porcelana',                        'Prótesis',        'dental', 60),
  ('PT05', 'Prótesis parcial removible',                  'Prótesis',        'dental', 45),
  ('PT06', 'Prótesis total',                              'Prótesis',        'dental', 45),
  ('PT07', 'Puente fijo (por unidad)',                    'Prótesis',        'dental', 60),
  ('PT08', 'Reparación o rebase de prótesis',             'Prótesis',        'dental', 30),
  ('PT09', 'Recementado de corona',                       'Prótesis',        'dental', 20),
  -- Implantología
  ('IM01', 'Colocación de implante',                      'Implantología',   'dental', 90),
  ('IM02', 'Pilar y corona sobre implante',               'Implantología',   'dental', 60),
  ('IM03', 'Injerto óseo / regeneración',                 'Implantología',   'dental', 90),
  -- Ortodoncia
  ('OR01', 'Estudio ortodóntico',                         'Ortodoncia',      'dental', 45),
  ('OR02', 'Colocación de aparatología fija',             'Ortodoncia',      'dental', 90),
  ('OR03', 'Control mensual de ortodoncia',               'Ortodoncia',      'dental', 30),
  ('OR04', 'Retenedor',                                   'Ortodoncia',      'dental', 30),
  -- Estética
  ('ES01', 'Blanqueamiento en consultorio',               'Estética',        'dental', 75),
  ('ES02', 'Blanqueamiento ambulatorio (guardas)',        'Estética',        'dental', 30),
  -- Odontopediatría
  ('OD01', 'Corona de acero-cromo',                       'Odontopediatría', 'dental', 40),
  ('OD02', 'Mantenedor de espacio',                       'Odontopediatría', 'dental', 40),
  -- Oclusión y urgencias
  ('OC01', 'Guarda oclusal (placa miorrelajante)',        'Oclusión',        'dental', 45),
  ('UR01', 'Atención de urgencia dental',                 'Urgencias',       'dental', 30)
ON CONFLICT (codigo) DO NOTHING;

-- ── Verificación sugerida tras correrlo ───────────────────────────────────────
--   select count(*) from public.procedimientos_base;                     -- 51
--   select polname, polcmd from pg_policy where polrelid = 'public.procedimientos'::regclass;
--   -- como owner:   select public.cargar_procedimientos_base('<clinica_id>');   -- 51, y 0 en la 2ª vez
