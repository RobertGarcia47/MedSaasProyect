SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'status_suscripcion'::regtype
ORDER BY enumsortorder;
