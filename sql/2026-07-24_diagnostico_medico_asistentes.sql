-- Diagnóstico: entender el modelo completo de medico_asistentes ya existente
-- en el schema base (no versionado en sql/, nunca lo había visto) antes de
-- seguir tocando políticas a ciegas.

-- 1. Estructura exacta de la tabla
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'medico_asistentes'
ORDER BY ordinal_position;

-- 2. Sus propias políticas RLS (¿quién puede leer/escribir esa tabla?)
SELECT tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'medico_asistentes'
ORDER BY cmd;

-- 3. ¿Qué otras tablas clínicas la referencian en sus propias políticas?
--    (para saber si consultas/recetas/informes/expedientes también dependen
--    de esta asignación médico-asistente, o solo pacientes/citas)
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('consultas', 'recetas', 'receta_medicamentos', 'informes', 'expedientes', 'expediente_alergias', 'laboratorio', 'consulta_diagnosticos')
  AND (qual ILIKE '%medico_asistentes%' OR with_check ILIKE '%medico_asistentes%')
ORDER BY tablename, cmd;
