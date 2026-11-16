-- ============================================================================
-- MedSaaS — Temas de diseño (Marino y coral por defecto)
-- Fecha: 2026-11-16
-- ----------------------------------------------------------------------------
-- La columna profiles.accent_color guarda el tema de diseño de cada usuario. Hasta ahora solo
-- admitía 'teal' | 'blue' | 'indigo' (acento de color sobre el mismo diseño). Ahora guarda el
-- TEMA completo: 'marino' (defecto) | 'azul' | 'grafito' | 'verde' (el diseño original).
--
--   * Se amplía el CHECK para aceptar los ids nuevos (se conservan los viejos mientras dura la
--     migración; la app ya sabe leerlos: lib/db.ts → normalizarTema()).
--   * El valor por defecto pasa de 'teal' a 'marino' (las cuentas nuevas lo heredan).
--   * Se migran los valores viejos:  teal → marino (era el defecto de todos),  blue → azul,
--     indigo → marino (no tiene equivalente).
--     Si prefieres que quien ya tenía 'teal' conserve el diseño verde de antes, cambia en el
--     UPDATE de abajo  'teal' THEN 'marino'  por  'teal' THEN 'verde'.
--
-- Sin correr este script la app funciona igual (el tema se aplica en el navegador), pero la
-- elección no se guarda en la base: en otro dispositivo o al volver a entrar se vería el tema
-- por defecto. No cambia RLS ni auditoría.
-- ============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_accent_color_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_accent_color_check
  CHECK (accent_color IN ('marino', 'azul', 'grafito', 'verde', 'teal', 'blue', 'indigo'));

ALTER TABLE public.profiles
  ALTER COLUMN accent_color SET DEFAULT 'marino';

UPDATE public.profiles
   SET accent_color = CASE accent_color
                        WHEN 'teal'   THEN 'marino'
                        WHEN 'blue'   THEN 'azul'
                        WHEN 'indigo' THEN 'marino'
                        ELSE accent_color
                      END
 WHERE accent_color IN ('teal', 'blue', 'indigo');

-- ── Verificación sugerida tras correrlo ───────────────────────────────────────
--   select accent_color, count(*) from public.profiles group by 1 order by 2 desc;
--   select column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name = 'accent_color';  -- 'marino'
