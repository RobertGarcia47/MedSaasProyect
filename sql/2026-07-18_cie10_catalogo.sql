-- ============================================================================
-- CIE-10: catálogo completo + búsqueda server-side
--
-- Contexto: la tabla `cie10` tenía 10 códigos sembrados a mano y el frontend
-- descargaba el catálogo entero para filtrarlo en memoria. Ese SELECT sin
-- `limit` topaba con el corte de 1000 filas de PostgREST, así que a partir de
-- la fila 1000 el buscador de diagnósticos dejaba de encontrar códigos sin
-- reportar error. Aquí se amplía el esquema y se mueve la búsqueda al servidor.
--
-- Fuente del catálogo: Catálogo CIE-10, Hospital Juárez de México
-- https://www.datos.gob.mx/dataset/catalogo_cie_10  (14,498 filas, 76 columnas)
-- De esas 76 columnas se conservan las 9 con uso clínico en esta app.
--
-- Correr ANTES de los archivos 2026-07-18_cie10_seed_01..06.sql
-- ============================================================================

-- ── Extensiones ─────────────────────────────────────────────────────────────
-- pg_trgm: búsqueda por similitud (tolera errores de dedo).
-- unaccent: que "colera" encuentre "CÓLERA" y "diabetes mellitus" no dependa
--           de que el médico escriba los acentos.
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- `unaccent(text)` es STABLE, no IMMUTABLE, así que no se puede usar dentro de
-- una columna generada ni de un índice. La forma de 2 argumentos, que recibe el
-- diccionario explícito, sí es inmutable: este wrapper la fija.
create or replace function f_unaccent(text)
  returns text
  language sql
  immutable
  strict
  parallel safe
as $$ select public.unaccent('public.unaccent', $1) $$;

-- ── Columnas nuevas del catálogo ────────────────────────────────────────────
-- Aditivas; `codigo` y `descripcion` ya existían y no se tocan.
alter table cie10 add column if not exists capitulo_clave   text;
alter table cie10 add column if not exists capitulo         text;
alter table cie10 add column if not exists vigente          boolean not null default true;
alter table cie10 add column if not exists consulta_externa boolean not null default true;
alter table cie10 add column if not exists sexo             text;
alter table cie10 add column if not exists asterisco        boolean not null default false;
alter table cie10 add column if not exists daga             boolean not null default false;

comment on column cie10.vigente is
  'VALID del catálogo. false = rúbrica derogada; se conserva para no romper la '
  'integridad referencial de diagnósticos históricos, pero el buscador la oculta.';
comment on column cie10.consulta_externa is
  'DIA_SIS: código válido como causa en consulta externa. Se usa para priorizar '
  'resultados, no para filtrarlos.';
comment on column cie10.sexo is
  'LSEX: M = solo hombre, F = solo mujer, null = sin restricción.';
comment on column cie10.asterisco is
  'Código de manifestación. Válido como código adicional, nunca como causa básica.';
comment on column cie10.daga is
  'Código de etiología. No debe usarse solo.';

do $$ begin
  alter table cie10 add constraint cie10_sexo_check check (sexo in ('M', 'F'));
exception when duplicate_object then null;
end $$;

-- ── Columna de búsqueda + índices ───────────────────────────────────────────
-- Materializar el texto normalizado evita recalcular unaccent/lower en cada
-- búsqueda y permite indexarlo.
alter table cie10 drop column if exists busqueda;
alter table cie10 add column busqueda text
  generated always as (f_unaccent(lower(descripcion))) stored;

create index if not exists cie10_busqueda_trgm on cie10 using gin (busqueda gin_trgm_ops);
create index if not exists cie10_codigo_prefijo on cie10 (upper(codigo) text_pattern_ops);
create index if not exists cie10_vigente        on cie10 (vigente) where vigente;

-- ── RPC de búsqueda ─────────────────────────────────────────────────────────
-- Un solo round-trip por tecleo, con orden de relevancia decidido en el
-- servidor. El catálogo es público (no lleva clinica_id ni datos de paciente),
-- así que SECURITY INVOKER + grant a authenticated basta; no hay nada que
-- auditar aquí.
create or replace function buscar_cie10(
  p_query   text,
  p_limit   int     default 20,
  p_vigentes boolean default true
)
returns table (
  codigo           text,
  descripcion      text,
  capitulo         text,
  sexo             text,
  vigente          boolean,
  consulta_externa boolean,
  asterisco        boolean,
  daga             boolean
)
language sql
stable
security invoker
parallel safe
as $$
  with q as (
    select
      f_unaccent(lower(trim(p_query)))    as texto,
      upper(replace(trim(p_query), '.', '')) as clave
  )
  select c.codigo, c.descripcion, c.capitulo, c.sexo,
         c.vigente, c.consulta_externa, c.asterisco, c.daga
  from cie10 c, q
  where length(q.texto) >= 2
    and (not p_vigentes or c.vigente)
    and (
      replace(upper(c.codigo), '.', '') like q.clave || '%'
      or c.busqueda like '%' || q.texto || '%'
      or c.busqueda %  q.texto
    )
  order by
    -- 1. el código tecleado, exacto      ("e119" / "e11.9" -> E11.9)
    case when replace(upper(c.codigo), '.', '') = q.clave then 0
    -- 2. el código como prefijo          ("j45" -> J45.0, J45.1, …)
         when replace(upper(c.codigo), '.', '') like q.clave || '%' then 1
    -- 3. la descripción empieza así      ("diabetes" -> DIABETES MELLITUS…)
         when c.busqueda like q.texto || '%' then 2
    -- 4. la descripción lo contiene
         when c.busqueda like '%' || q.texto || '%' then 3
    -- 5. parecido por trigramas (errores de dedo)
         else 4 end,
    -- a igual relevancia, primero lo que se usa en consulta externa
    c.consulta_externa desc,
    similarity(c.busqueda, q.texto) desc,
    length(c.descripcion),
    c.codigo
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

comment on function buscar_cie10 is
  'Busca en el catálogo CIE-10 por código o descripción, sin acentos y tolerante '
  'a errores de dedo. Devuelve como máximo 50 filas ordenadas por relevancia.';

revoke all on function buscar_cie10(text, int, boolean) from public;
grant execute on function buscar_cie10(text, int, boolean) to authenticated;

-- El catálogo es de lectura para cualquier usuario autenticado.
grant select on cie10 to authenticated;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tras correr los 6 archivos de seed, esto debe devolver ~14,486 / ~12,551:
--   select count(*) filas, count(*) filter (where vigente) vigentes from cie10;
-- Y estas búsquedas deben responder al instante:
--   select codigo, descripcion from buscar_cie10('colera');
--   select codigo, descripcion from buscar_cie10('j45');
--   select codigo, descripcion from buscar_cie10('diabetes tipo 2');
