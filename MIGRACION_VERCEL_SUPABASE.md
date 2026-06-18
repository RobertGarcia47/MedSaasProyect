# Informe — Configuración Vercel + Supabase en MedSaasProyect

> Fecha: 2026-06-17. Basado en `medsaas-onboarding-multi-tenant` (que NO se modificó).
> MedSaasProyect = la **app post-onboarding** (§8.4 de la MEMORY del onboarding):
> la app clínica real que comparte la **misma DB de Supabase** (ref `esvhhkwgquffdxkuoimt`).

---

## 1. Qué se cambió (resumen)

### Fase A — Configuración (Vercel + Supabase + TypeScript) ✅
- **`package.json`**: + `@supabase/supabase-js`, + `typescript` y `@types/*` (node/react/react-dom),
  + script `typecheck` (`tsc --noEmit`). Se conservó `firebase` (aún no se desinstala).
- **`tsconfig.json`** (nuevo): TS con `allowJs: true` (conviven `.jsx` y `.tsx`, migración
  incremental como el onboarding). Alias `@/* → ./src/*`.
- **`vite.config.js` → `vite.config.ts`**: + alias `@`, se mantiene el header COOP
  (`same-origin-allow-popups`) que necesita el popup de Google OAuth.
- **`src/lib/supabase.ts`** (nuevo): cliente Supabase (espejo del onboarding) + aviso ruidoso
  si faltan las env vars.
- **`.env.example`**: ahora documenta `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (Firebase queda comentado como legado).
- **`.env.local`** (nuevo, git-ignored): apunta al proyecto Supabase real.
- **`.gitignore`**: protege `.env*` (excepto `.env.example`) y `.vercel`.
- **`vercel.json`** (nuevo): framework Vite, rewrites SPA (todo → `/index.html`) y header COOP.

### Fase B — Auth: Firebase → Supabase ✅
- **`src/pages/Login.jsx` → `Login.tsx`**: login con `supabase.auth.signInWithPassword`,
  Google con `supabase.auth.signInWithOAuth` (redirect). La pestaña "Registrarse" sigue
  abriendo el onboarding (`medsaasr.web.app`). Mensajes de error mapeados al español.
- **`src/App.jsx` → `App.tsx`**: el guard ahora usa Supabase
  (`getSession` + `onAuthStateChange`). Reemplaza el check de Firestore `users/{uid}`
  por el perfil real de `profiles`. La identidad del shell (sidebar/topbar/menú) sale del
  perfil real, no del mock. Gates de trial y cédula activos (§6.1).
- **`src/main.jsx` → `main.tsx`** + `index.html` apunta a `main.tsx`.

### Fase C — Datos clínicos ✅ (páginas con schema real)

#### Capa de datos (`src/lib/`)
- **`src/lib/db.ts`**: carga contexto de cuenta desde `profiles`, `clinica_miembros`,
  `clinicas`, `suscripciones`, `plans`, `medico_detalles`. Gates de trial y cédula.
- **`src/lib/types.ts`**: interfaces TS para las 16 tablas del esquema actual.
- **`src/lib/patients.ts`**: `fetchPacientes`, `countPacientes`, `fetchPacienteDetalle`.
  Query anidado: `expediente_alergias`, `consultas`, `consulta_diagnosticos`, `cie10`.
- **`src/lib/consultas.ts`**: `fetchConsultasDia`, `fetchConsultasSemana`, `countConsultas`.
  Estado computado por tiempo (completada / en-curso / pendiente). Color determinista por UUID.
- **`src/context/AccountContext.tsx`**: contexto `AccountCtx` + hook `useAccount()`.

#### Páginas migradas a `.tsx` con datos reales
| Página | Archivo | Estado | Datos |
|---|---|---|---|
| Dashboard | `src/pages/Dashboard.tsx` | ✅ real | consultas hoy, total pacientes, consultas del mes |
| Agenda | `src/pages/Calendar.tsx` | ✅ real | vista día y semana; nav prev/next; "Hoy" |
| Pacientes | `src/pages/Patients.tsx` | ✅ real | lista + expediente; vitales, alergias, diagnósticos, historial |
| Login | `src/pages/Login.tsx` | ✅ real | email + Google OAuth |
| App shell | `src/App.tsx` | ✅ real | guard, gates, identidad médico |

#### Páginas que siguen con sidecars `.d.ts` (aún en `.jsx`)
| Página | Sidecar | Motivo |
|---|---|---|
| `Clinical.jsx` | `src/pages/Clinical.d.ts` | RPCs de cifrado (`crear_consulta`, `obtener_consultas`, etc.) sin firmas aún |
| `Profile.jsx` | `src/pages/Profile.d.ts` | sin prioridad inmediata |
| `Settings.jsx` | `src/pages/Settings.d.ts` | sin prioridad inmediata |
| Componentes | `src/components/index.d.ts` | todos los `.jsx` de `src/components/` |

#### Tablas sin datos reales (EmptyState "Próximamente")
- **Recetas** (`recetas`) — tabla no existe aún en el esquema
- **Informes** (tabla no existe)
- **Laboratorio** (tabla no existe)

---

## 2. Lo que necesitas hacer tú

1. **Supabase → Auth → URL Configuration**: agrega el dominio de Vercel (p. ej.
   `https://medsaasproyect.vercel.app` y tu dominio final) a **Site URL** y **Redirect URLs**.
   Sin esto, el login con Google (OAuth redirect) y los correos fallan.
2. **Vercel → Project → Settings → Environment Variables**: carga
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Vercel NO lee tu `.env.local`).
   Valores en `.env.local`. Marca Production + Preview + Development.
3. **Crea el proyecto en Vercel** apuntando a este repo. Detecta Vite solo; `vercel.json`
   ya fija build/output/rewrites.
4. **(Recomendado) `git init`**: este proyecto NO es repo git todavía; los cambios no son
   recuperables por historial.
5. **Prueba el login real** con un usuario que YA completó el onboarding. Verifica en consola
   que las queries a `clinica_miembros` (con join `clinicas(nombre)`) y `suscripciones`
   no devuelvan errores de RLS/relación.

---

## 3. Para terminar la Fase C (módulo clínico)

La única parte de Fase C pendiente es el **módulo de consulta activa** (`Clinical.jsx`), que necesita:

- **Firmas de RPCs cifrados**: `crear_consulta`, `obtener_consultas`, `guardar_antecedentes`,
  `obtener_antecedentes` (parámetros de entrada y columnas que devuelven).

Una vez que proporciones esas firmas, migro `Clinical.jsx → Clinical.tsx` con llamadas RPC
reales (sin que el frontend toque nunca campos `_enc` directamente).

---

## 4. Verificación
- `npm run build` → ✅ OK (490 kB, 303 ms).
- `npm run typecheck` (`tsc --noEmit`) → ✅ 0 errores.
- Sin imports de Firebase en código activo.

## 5. Notas de seguridad / arquitectura
- El frontend **NUNCA** cifra ni descifra. Solo llama RPCs para campos `_enc`.
- `get_encryption_key()` tiene REVOKE para anon/authenticated — la llave no es accesible
  desde el cliente bajo ninguna circunstancia.
- Todos los queries llevan `.eq('clinica_id', clinicaId)` aunque RLS lo refuerce: defensa en profundidad.
- `src/firebase.js` y la dependencia `firebase` se conservan (regla §8.11: quitar Firebase
  solo cuando todo esté estable). Hoy son código muerto.
- Colores de pacientes: deterministas (hash DJB2 del UUID → paleta de 12 tonos). No hay columna
  de color en el esquema; el mismo UUID siempre da el mismo color.
