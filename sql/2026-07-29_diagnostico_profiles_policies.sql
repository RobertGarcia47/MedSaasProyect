-- Diagnóstico: al dar de baja a un miembro del equipo (clinica_miembros.activo=false),
-- su nombre desaparece del roster (aparece "—") aunque rol y badge activo/inactivo se ven
-- bien. fetchMiembros() en src/lib/equipo.ts hace un embed
-- `profiles!profile_id(nombre, apellido_paterno, apellido_materno)` — si esto devuelve
-- null es porque la policy SELECT de `profiles` deja de aplicar cuando el miembro
-- consultado está inactivo. Necesito ver la policy exacta antes de tocarla.
SELECT policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd;
