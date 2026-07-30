-- ============================================================================
-- MedSaaS — suscripciones: cualquier miembro activo puede LEER la suscripción
-- Fecha: 2026-07-24
-- ----------------------------------------------------------------------------
-- Bug destapado al probar el alta de asistentes (no causado por esa pieza,
-- solo es la primera vez que se probó un login de no-owner end-to-end):
-- loadAccountContext() (src/lib/db.ts) lee `suscripciones` para calcular
-- accesoVigente — si la RLS de esa tabla solo deja ver la fila al owner (lo
-- más probable dado que es info de facturación), cualquier no-owner
-- (asistente, o un médico que no sea el owner) obtiene `sus = null` aunque la
-- suscripción sí esté vigente, y la app lo manda a la pantalla de "tu prueba
-- terminó" — un falso bloqueo total, no relacionado con el trial real.
--
-- Fix puramente aditivo: se AGREGA una policy nueva con nombre propio, no se
-- toca ni se reemplaza la que ya exista. Postgres combina policies del mismo
-- comando (SELECT) con OR, así que esto solo puede ampliar acceso, nunca
-- quitarlo — no hay forma de que rompa lo que ya funcionaba para el owner.
-- ============================================================================

DROP POLICY IF EXISTS "suscripciones_select_miembros" ON public.suscripciones;
CREATE POLICY "suscripciones_select_miembros" ON public.suscripciones
  FOR SELECT TO authenticated USING (es_miembro(clinica_id));

-- Fin del script.
