import { createContext, useContext } from 'react';
import type { AccountContext } from '../lib/db';

// El contexto es null solo cuando no hay sesión activa.
// Dentro de la zona autenticada del árbol (post-guard en App.tsx), siempre es no-null.
export const AccountCtx = createContext<AccountContext | null>(null);

/** Hook tipado: úsalo dentro de cualquier componente autenticado. */
export function useAccount(): AccountContext {
  const ctx = useContext(AccountCtx);
  if (!ctx) throw new Error('useAccount debe usarse dentro del árbol autenticado (App).');
  return ctx;
}
