-- Preferencias de apariencia por usuario (owner/médico/asistente), elegidas en
-- Configuración → Apariencia. La columna queda cubierta por las políticas RLS
-- existentes de `profiles` (cada usuario solo puede actualizar su propia fila).

-- Color de acento de la interfaz. Valores: 'teal' (base) | 'blue' | 'indigo'.
alter table profiles
  add column if not exists accent_color text not null default 'teal';

alter table profiles
  drop constraint if exists profiles_accent_color_check;

alter table profiles
  add constraint profiles_accent_color_check
  check (accent_color in ('teal', 'blue', 'indigo'));

-- Modo claro/oscuro. Antes vivía solo en memoria (se perdía al recargar).
alter table profiles
  add column if not exists theme_mode text not null default 'light';

alter table profiles
  drop constraint if exists profiles_theme_mode_check;

alter table profiles
  add constraint profiles_theme_mode_check
  check (theme_mode in ('light', 'dark'));
