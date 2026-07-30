-- Diagnóstico: ¿por qué un asistente no puede crear un paciente para un médico
-- que no es él mismo? Necesito ver el nombre, tipo (permissive/restrictive) y
-- definición exacta (qual/with_check) de TODAS las policies de pacientes y
-- citas para saber cuál está rechazando el INSERT.
SELECT tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('pacientes', 'citas')
ORDER BY tablename, cmd;
