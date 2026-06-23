# Informe — Configuración Vercel + Supabase en MedSaasProyect

> Fecha inicio: 2026-06-17. Última actualización: 2026-06-22.
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
- **`.env.example`**: ahora documenta `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **`.env.local`** (nuevo, git-ignored): apunta al proyecto Supabase real.
- **`.gitignore`**: protege `.env*` (excepto `.env.example`) y `.vercel`.
- **`vercel.json`** (nuevo): framework Vite, rewrites SPA (todo → `/index.html`) y header COOP.

### Fase B — Auth: Firebase → Supabase ✅
- **`src/pages/Login.tsx`**: login con `supabase.auth.signInWithPassword`, Google OAuth redirect.
- **`src/App.tsx`**: guard con Supabase (`getSession` + `onAuthStateChange`), perfil real de `profiles`.
  Gates de trial y cédula activos (§6.1).
- **`src/main.tsx`** + `index.html` apunta a `main.tsx`.

### Fase C — Datos clínicos ✅ (páginas con schema real)

#### Capa de datos (`src/lib/`)
- **`src/lib/db.ts`**: contexto de cuenta desde `profiles`, `clinica_miembros`, `clinicas`,
  `suscripciones`, `plans`, `medico_detalles`. Gates de trial y cédula.
- **`src/lib/types.ts`**: interfaces TS para las 16 tablas del esquema.
- **`src/lib/patients.ts`**: `fetchPacientes`, `fetchPacienteDetalle` (vitales, alergias, diagnósticos,
  historial), `createPaciente`, `actualizarPaciente`, `actualizarGrupoSanguineo`,
  `getOrCreateExpediente`, `fetchPacientesSelect`, `countPacientes`.
- **`src/lib/consultas.ts`**: calendario (`fetchConsultasDia`, `fetchConsultasSemana`), consulta
  clínica (`crearConsulta` RPC, `obtenerConsultas` RPC). Vitales básicos + fr/spo2/glucosa/
  perimetro_abdominal_cm/grasa_corporal_pct.
- **`src/lib/recetas.ts`**: `crearReceta`, `obtenerRecetas`, `formatFolioReceta`. Folio real per-médico.
- **`src/lib/informes.ts`**: `crearInforme`, `obtenerInformes`, `formatFolio`. Folio real per-médico.
  Tipos, iconos, colores y visibilidad de informes.
- **`src/lib/laboratorio.ts`**: `procesarArchivo`, `subirArchivo`, `urlDescarga` (signed URL 1h,
  caché módulo-nivel), `fetchTiposEstudio`, `crearTipoEstudio`, `crearEstudio`, `obtenerEstudios`.
- **`src/context/AccountContext.tsx`**: contexto `AccountCtx` + hook `useAccount()`.

#### Páginas activas (todas en `.tsx` con datos reales)
| Página | Archivo | Estado |
|---|---|---|
| Dashboard | `src/pages/Dashboard.tsx` | ✅ real — stats: consultas hoy, total pacientes, mes |
| Agenda | `src/pages/Calendar.tsx` | ✅ real — vista día/semana, nav prev/next |
| Pacientes (lista) | `src/pages/Patients.tsx` — `PatientList` | ✅ real — tabla + grid, búsqueda |
| Expediente | `src/pages/Patients.tsx` — `PatientRecord` | ✅ real — 5 tabs: Resumen, Historial, Recetas, Informes, Labs |
| Consulta | `src/pages/Consulta.tsx` | ✅ real — rail + lienzo, vitales completos, CIE-10, antecedentes |
| Receta | `src/pages/Receta.tsx` | ✅ real — medicamentos, folio real, diagnóstico CIE-10 |
| Informe | `src/pages/Informe.tsx` | ✅ real — tipos, visibilidad, folio real, tags, RTE |
| Laboratorio | `src/pages/Laboratorio.tsx` | ✅ real — archivo adjunto + notas cifradas |
| Login | `src/pages/Login.tsx` | ✅ real — email + Google OAuth |
| Perfil | `src/pages/Profile.tsx` | ✅ real — datos personales, clínica, alta como médico |

#### Páginas con sidecars `.d.ts` (aún en `.jsx`, baja prioridad)
| Archivo | Motivo |
|---|---|
| `Clinical.jsx` | Módulo legacy — los flujos principales se movieron a páginas dedicadas |
| `Settings.jsx` | Sin prioridad inmediata |
| Componentes `src/components/*.jsx` | Se migran al tocarlos |

---

## 2. SQL ejecutados en producción (cronológico)

| Fecha | Script | Qué hace |
|---|---|---|
| 2026-06-17 | `sql/2026-06-17_citas_recetas_informes.sql` | Crea `citas`, `recetas`, `receta_medicamentos`, `informes`, enums, RLS, triggers, RPCs |
| 2026-06-18 | `sql/2026-06-18_receta_medicamento_extra.sql` | Agrega `instrucciones` y `controlado` a `receta_medicamentos` |
| 2026-06-18 | `sql/2026-06-18_antecedentes_rpcs.sql` | RPCs `guardar_antecedentes` / `obtener_antecedentes` (JSON cifrado) + `expediente_alergias` |
| 2026-06-18 | `sql/2026-06-18_auditoria_insert_policy.sql` | Política INSERT en `auditoria` (sin ella las RPCs READ reventaban) |
| 2026-06-19 | `sql/2026-06-19_informes_extra.sql` | Agrega `visibilidad`, `tags`, `fecha_informe` a `informes`; recrea RPCs |
| 2026-06-19 | `sql/2026-06-19_informes_visibilidad_rls.sql` | RLS por visibilidad (`privado` solo autor; `expediente`/`compartido` cualquier miembro) |
| 2026-06-19 | `sql/2026-06-19_fix_obtener_informes_ambiguous.sql` | Fix alias `e.id` en `obtener_informes` (colisión con columna de RETURNS TABLE) |
| 2026-06-19 | `sql/2026-06-19_laboratorio.sql` | Tabla `estudios_laboratorio`, RLS, trigger, bucket Storage `laboratorios`, RPCs |
| 2026-06-19 | `sql/2026-06-19_tipos_estudio_lab.sql` | Tabla global `tipos_estudio_lab` + ~105 tipos pre-cargados |
| 2026-06-22 | `sql/2026-06-22_informes_folio.sql` | Tabla `informes_folios` (counter per-médico), columna `folio_num` en `informes`; recrea `crear_informe` / `obtener_informes` |
| 2026-06-22 | `sql/2026-06-22_recetas_folio.sql` | Tabla `recetas_folios`, columnas `folio_num` y `fecha_receta` en `recetas`; recrea `crear_receta` / `obtener_recetas` |
| 2026-06-22 | `sql/2026-06-22_vitales_extra.sql` | Columnas `fr`, `spo2`, `glucosa`, `perimetro_abdominal_cm`, `grasa_corporal_pct` en `consultas`; recrea `crear_consulta` / `obtener_consultas` |

---

## 3. Hecho en sesión 2026-06-22

### Aviso "antecedentes sin guardar" al cambiar de paciente
- `Consulta.tsx`: el selector de paciente verifica `antDirty` antes de cambiar;
  `window.confirm()` si hay cambios sin guardar.

### Folios reales per-médico
- **Diseño**: contador atómico `INSERT … ON CONFLICT DO UPDATE RETURNING` en tablas
  `informes_folios` / `recetas_folios` (PK = `medico_id`). Dos médicos pueden tener F1 sin colisión.
- **Formato**: `F3 - 22-06-2026` (informes) / `R3 - 22-06-2026` (recetas).
- **Frontend**: `formatFolio()` en `informes.ts`, `formatFolioReceta()` en `recetas.ts`.
  Shown en el acordeón del expediente (Patients.tsx) y en el rail de Receta/Informe al guardar.

### Vitales extra en consultas
- Nuevas columnas: `fr` (rpm), `spo2` (%), `glucosa` (mg/dL), `perimetro_abdominal_cm`, `grasa_corporal_pct`.
- `VitalesInput` y `ConsultaDetalleUI` en `consultas.ts` actualizados.
- `Consulta.tsx`: 5 campos nuevos en el grid de vitales del rail.
- `Patients.tsx` — tab Historial: muestra los 5 nuevos vitales en la línea de resumen.

### Editar datos de pacientes ya creados
- `patients.ts`: `actualizarPaciente(pacienteId, Partial<NuevoPaciente>)` — UPDATE directo.
  `PacienteDetalleUI` extendido con `nombre_raw`, `apellido_paterno_raw`, `apellido_materno_raw`,
  `fecha_nacimiento` para pre-poblar el form.
- `Patients.tsx` — `PatientRecord`: botón "Editar" en el header del expediente abre modal con
  todos los campos editables (nombre, apellidos, fecha nacimiento, sexo, grupo sanguíneo,
  teléfono, email, CURP). Guarda y refresca vía `pacVersion` local.

### Navegación mejorada entre módulos del expediente
- **Top bar** de Consulta/Receta/Informe/Laboratorio:
  - `← Regresar` — vuelve a la página exacta anterior (tracking via `prevRoute` en App.tsx).
  - `📁 [Nombre del paciente]` — va directo al expediente del paciente activo.
  - Breadcrumb `Pacientes › [Nombre]` como subtítulo (clickeable).
- **Rail — sección Paciente**: botón "Ver expediente completo" + grid de 4 módulos
  (Consulta · Receta · Informe · Lab) con el activo resaltado y deshabilitado.
- `App.tsx`: `prevRoute` state, `goBack()` función, `goBack` en `pageProps`.

---

## 4. Pendiente

### Infra (bloqueante para producción)
- [ ] **Supabase Auth → Redirect URLs**: agregar dominio Vercel + dominio final.
- [ ] **Vercel → Environment Variables**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

### Deuda técnica (no bloqueante)
- [ ] Editor RTE: migrar `execCommand` (deprecado) a TipTap o Lexical.
- [ ] Eliminar `src/firebase.js` + dep `firebase` (código muerto desde Fase B).
- [ ] Migrar `Settings.jsx`, `Clinical.jsx` y `src/components/*.jsx` a `.tsx`.

---

## 5. Notas de arquitectura

- El frontend **nunca** cifra ni descifra. Solo llama RPCs para campos `_enc`.
- `get_encryption_key()` tiene REVOKE para anon/authenticated — la llave no es accesible
  desde el cliente bajo ninguna circunstancia.
- Todos los queries llevan `.eq('clinica_id', clinicaId)` aunque RLS lo refuerce: defensa en profundidad.
- Colores de pacientes: deterministas (hash DJB2 del UUID → paleta de 12 tonos). No hay columna
  de color en el esquema; el mismo UUID siempre da el mismo color.
- Folios per-médico: la atomicidad es garantizada por `ON CONFLICT DO UPDATE RETURNING` —
  no hay race condition aunque dos tabs guarden a la vez.
- `prevRoute` en App.tsx: solo un nivel de historial (la página inmediatamente anterior).
  No es una pila completa — el botón "Regresar" solo funciona un salto atrás.
