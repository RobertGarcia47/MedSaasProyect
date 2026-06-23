-- 2026-06-19 — Catálogo de tipos de estudio de laboratorio
-- Tabla global (sin clinica_id, como cie10): cualquier médico puede leer y agregar.

CREATE TABLE IF NOT EXISTS public.tipos_estudio_lab (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text NOT NULL,
  CONSTRAINT tipos_estudio_lab_nombre_unique UNIQUE (nombre)
);

ALTER TABLE public.tipos_estudio_lab ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tipos_lab_select" ON public.tipos_estudio_lab;
CREATE POLICY "tipos_lab_select" ON public.tipos_estudio_lab
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tipos_lab_insert" ON public.tipos_estudio_lab;
CREATE POLICY "tipos_lab_insert" ON public.tipos_estudio_lab
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON public.tipos_estudio_lab TO authenticated, service_role;

-- ── Catálogo inicial ─────────────────────────────────────────────────────────
INSERT INTO public.tipos_estudio_lab (nombre) VALUES
  -- Hematología
  ('Biometría hemática (BH)'),
  ('Biometría hemática con diferencial'),
  ('Velocidad de sedimentación globular (VSG)'),
  ('Reticulocitos'),
  ('Frotis de sangre periférica'),
  -- Química sanguínea
  ('Química sanguínea 6 elementos'),
  ('Química sanguínea 12 elementos'),
  ('Glucosa en ayuno'),
  ('Glucosa postprandial'),
  ('Hemoglobina glucosilada (HbA1c)'),
  ('Curva de tolerancia a la glucosa'),
  ('Creatinina sérica'),
  ('BUN (nitrógeno ureico)'),
  ('Ácido úrico'),
  -- Perfil lipídico
  ('Perfil lipídico'),
  ('Colesterol total'),
  ('HDL colesterol'),
  ('LDL colesterol'),
  ('Triglicéridos'),
  -- Perfil hepático
  ('Perfil hepático'),
  ('TGO / AST'),
  ('TGP / ALT'),
  ('Fosfatasa alcalina'),
  ('Bilirrubinas (total/directa/indirecta)'),
  ('GGT'),
  ('Albúmina sérica'),
  -- Función tiroidea
  ('TSH'),
  ('T3 libre'),
  ('T4 libre'),
  ('Perfil tiroideo completo'),
  ('Anticuerpos antitiroideos (anti-TPO / anti-TG)'),
  -- Coagulación
  ('Tiempo de protrombina (TP)'),
  ('Tiempo de tromboplastina parcial (TTP)'),
  ('INR'),
  ('Dímero D'),
  ('Fibrinógeno'),
  -- Electrolitos / minerales
  ('Electrolitos séricos (Na, K, Cl)'),
  ('Sodio sérico'),
  ('Potasio sérico'),
  ('Calcio total'),
  ('Magnesio sérico'),
  ('Fósforo sérico'),
  ('Hierro sérico'),
  ('Ferritina'),
  ('Capacidad total de fijación de hierro (TIBC)'),
  ('Vitamina B12'),
  ('Ácido fólico'),
  ('Vitamina D (25-OH)'),
  -- Función renal / orina
  ('Examen general de orina (EGO)'),
  ('Proteínas en orina de 24 h'),
  ('Creatinina en orina'),
  ('Depuración de creatinina'),
  ('Microalbuminuria'),
  ('Urocultivo y antibiograma'),
  -- Marcadores cardíacos
  ('Troponina I'),
  ('Troponina T'),
  ('CPK total'),
  ('CPK-MB'),
  ('Mioglobina'),
  ('BNP / NT-proBNP'),
  ('Proteína C reactiva (PCR)'),
  ('Proteína C reactiva ultrasensible (hs-CRP)'),
  ('LDH'),
  -- Marcadores inflamatorios / inmunología
  ('Factor reumatoide (FR)'),
  ('Anti-CCP'),
  ('ANA (anticuerpos antinucleares)'),
  ('Anti-dsDNA'),
  ('Complemento C3 y C4'),
  ('IgE total'),
  -- Hormonas
  ('FSH'),
  ('LH'),
  ('Estradiol'),
  ('Progesterona'),
  ('Testosterona total'),
  ('Prolactina'),
  ('Cortisol basal'),
  ('Insulina basal'),
  ('HOMA-IR'),
  ('DHEA-S'),
  -- Microbiología / infecciones
  ('Hemocultivo'),
  ('Cultivo de secreción'),
  ('VDRL / RPR (sífilis)'),
  ('VIH 1/2 (Ag/Ac)'),
  ('Hepatitis B (HBsAg)'),
  ('Hepatitis C (anti-VHC)'),
  ('Toxoplasma IgG/IgM'),
  ('CMV IgG/IgM'),
  ('Rubeola IgG/IgM'),
  ('Dengue NS1 / IgG / IgM'),
  ('COVID-19 PCR'),
  ('COVID-19 antígenos'),
  ('Influenza A/B'),
  ('Streptococcus grupo A (rápido)'),
  -- Oncología / marcadores tumorales
  ('PSA total'),
  ('PSA libre'),
  ('CEA'),
  ('AFP (alfa-fetoproteína)'),
  ('CA 125'),
  ('CA 19-9'),
  ('CA 15-3'),
  -- Embarazo / ginecología
  ('βhCG cuantitativa'),
  ('βhCG cualitativa'),
  ('Prueba de embarazo (orina)'),
  ('Papanicolaou (Pap)'),
  ('Cultivo vaginal'),
  -- Otros
  ('Gases arteriales (gasometría)'),
  ('Lactato sérico'),
  ('Amilasa'),
  ('Lipasa'),
  ('Colinesterasa'),
  ('Plomo en sangre'),
  ('Alcoholemia')
ON CONFLICT (nombre) DO NOTHING;
