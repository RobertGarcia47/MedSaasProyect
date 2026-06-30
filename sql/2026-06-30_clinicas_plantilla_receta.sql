-- Plantilla de receta por clínica (preferencia de marca, elegida en Configuración).
-- Valores: 'teal' | 'oliva' | 'azul' (las 3 variantes del handoff). Default 'teal'.
-- La columna queda cubierta por las políticas RLS existentes de `clinicas`
-- (el dueño/editor del perfil de la clínica puede actualizarla; los miembros la leen).

alter table clinicas
  add column if not exists plantilla_receta text not null default 'teal';

alter table clinicas
  drop constraint if exists clinicas_plantilla_receta_check;

alter table clinicas
  add constraint clinicas_plantilla_receta_check
  check (plantilla_receta in ('teal', 'oliva', 'azul'));
