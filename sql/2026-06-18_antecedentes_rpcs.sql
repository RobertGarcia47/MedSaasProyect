-- 2026-06-18 — Antecedentes médicos del expediente (4 categorías narrativas).
--
-- Almacenamiento: `expedientes.antecedentes_enc` (bytea, cifrado) ya existía.
-- Se guarda un JSON con las 4 categorías cifrado con encrypt_text() y se lee
-- con decrypt_text(). Alergias va aparte (tabla `expediente_alergias`).
--
-- Patrón idéntico a crear_consulta / crear_receta: SECURITY INVOKER (default),
-- sin set search_path. La autorización la da la RLS de `expedientes`
-- (USING/​WITH CHECK = es_miembro + medico propio). La auditoría usa la política
-- `auditoria_insert` (ver sql/2026-06-18_auditoria_insert_policy.sql).
--
-- Nota: se hace DROP de obtener_antecedentes porque existía un stub previo con
-- otro tipo de retorno (create or replace no puede cambiar el RETURNS).

alter table public.expedientes add column if not exists antecedentes_enc bytea;

-- ── GUARDAR ────────────────────────────────────────────────────────────────────
create or replace function public.guardar_antecedentes(
  p_expediente_id    uuid,
  p_patologicos      text default null,
  p_no_patologicos   text default null,
  p_heredofamiliares text default null,
  p_quirurgicos      text default null
) returns void
language plpgsql
as $fn_guardar$
declare
  v_json text;
begin
  v_json := jsonb_build_object(
    'patologicos',      coalesce(p_patologicos, ''),
    'no_patologicos',   coalesce(p_no_patologicos, ''),
    'heredofamiliares', coalesce(p_heredofamiliares, ''),
    'quirurgicos',      coalesce(p_quirurgicos, '')
  )::text;

  update public.expedientes
     set antecedentes_enc = encrypt_text(v_json)
   where id = p_expediente_id;   -- RLS de expedientes valida el UPDATE

  insert into public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  select e.clinica_id, auth.uid(), 'UPDATE', 'expedientes', e.id
  from public.expedientes e where e.id = p_expediente_id;
end;
$fn_guardar$;

-- ── OBTENER ────────────────────────────────────────────────────────────────────
drop function if exists public.obtener_antecedentes(uuid);

create or replace function public.obtener_antecedentes(p_expediente_id uuid)
returns table (
  patologicos      text,
  no_patologicos   text,
  heredofamiliares text,
  quirurgicos      text
)
language plpgsql
as $fn_obtener$
declare
  v_json jsonb;
begin
  insert into public.auditoria (clinica_id, profile_id, accion, tabla, registro_id)
  select e.clinica_id, auth.uid(), 'READ', 'expedientes', e.id
  from public.expedientes e where e.id = p_expediente_id;

  select case when e.antecedentes_enc is null then null
              else decrypt_text(e.antecedentes_enc)::jsonb end
    into v_json
  from public.expedientes e
  where e.id = p_expediente_id;   -- RLS filtra

  return query select
    coalesce(v_json->>'patologicos', ''),
    coalesce(v_json->>'no_patologicos', ''),
    coalesce(v_json->>'heredofamiliares', ''),
    coalesce(v_json->>'quirurgicos', '');
end;
$fn_obtener$;
