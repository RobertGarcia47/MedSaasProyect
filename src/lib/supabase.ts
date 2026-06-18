/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla ruidosamente en dev: olvidar el .env.local es el error #1 de setup.
  console.error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env.local (local) o configúralas en Vercel (deploy).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
