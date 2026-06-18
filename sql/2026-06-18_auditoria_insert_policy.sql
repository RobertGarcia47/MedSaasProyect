-- 2026-06-18 — Política de INSERT para `auditoria`.
--
-- Problema: `auditoria` tenía RLS activa pero SOLO política de SELECT
-- (`audit_select`, es_owner). Las RPCs de lectura (`obtener_consultas`,
-- `obtener_recetas`, `obtener_informes`) son SECURITY INVOKER y registran el
-- READ con `insert into auditoria ...` corriendo como el usuario → el INSERT
-- violaba RLS (42501 "new row violates row-level security policy") y tumbaba
-- toda la RPC → el Historial/Recetas/Informes del expediente salían vacíos.
--
-- Fix: permitir que un miembro registre auditoría de su propia clínica,
-- atribuida a sí mismo. No falsificable a otra clínica ni a nombre de otro.
-- El SELECT sigue siendo solo-owner (no se toca).

create policy auditoria_insert on auditoria
  for insert to authenticated
  with check ( es_miembro(clinica_id) and profile_id = auth.uid() );
