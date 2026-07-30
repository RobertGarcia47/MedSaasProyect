-- Diagnóstico: antes de crear oportunidades_citas (feature de lista de espera / adelanto de
-- citas), necesito confirmar el scoping REAL de las policies de `citas` en la DB en vivo —
-- la migración versionada (sql/2026-06-17_citas_recetas_informes.sql) las define como
-- es_miembro(clinica_id) sin distinción por médico, pero esta sesión ya encontró antes que el
-- schema en vivo tiene policies más finas (medico_asistentes) que no están en ningún archivo
-- .sql. No quiero adivinar de nuevo.
SELECT policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'citas'
ORDER BY cmd;
