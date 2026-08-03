// Verifica que quien llama a la función esté autenticado y sea OWNER activo de
// la clínica indicada — mismo criterio que es_owner() en Postgres, pero resuelto
// aquí porque las Edge Functions no corren dentro de una sesión SQL con auth.uid().
// Usa la propia RLS (cliente con el JWT del caller, no service_role) para que
// nadie pueda consultar la membresía de otra clínica.

import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface OwnerContext {
  userId: string;
  email: string | null;
}

export async function requireOwner(req: Request, clinicaId: string): Promise<OwnerContext | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: miembro } = await supabase
    .from('clinica_miembros')
    .select('rol, activo')
    .eq('clinica_id', clinicaId)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!miembro || !miembro.activo || miembro.rol !== 'owner') return null;

  return { userId: user.id, email: user.email ?? null };
}
