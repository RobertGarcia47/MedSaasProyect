-- Diagnóstico: antes de tocar plans/suscripciones/metodos_pago para conectar Stripe, necesito
-- confirmar el esquema y RLS REALES en vivo (documentados solo en memoria, nunca versionados en
-- sql/) — mismo patrón ya usado esta sesión para citas/profiles, no se adivina.

-- 1. Columnas exactas de las 3 tablas.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('plans', 'suscripciones', 'metodos_pago')
ORDER BY table_name, ordinal_position;

-- 2. Sus policies RLS actuales.
SELECT tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('plans', 'suscripciones', 'metodos_pago')
ORDER BY tablename, cmd;

-- 3. Catálogo de planes ya sembrado (para saber qué Products/Prices crear en Stripe).
SELECT id, nombre, precio_mxn, max_medicos, max_asistentes_por_medico, max_pacientes, activo
FROM public.plans
ORDER BY precio_mxn;
