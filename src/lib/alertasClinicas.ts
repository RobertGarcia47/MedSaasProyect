// Alertas clínicas derivadas de los antecedentes (texto libre) del expediente:
// condiciones que cambian cómo se atiende a un paciente (anticoagulantes, diabetes,
// embarazo…) y que no deben quedar enterradas en un acordeón. Las alergias NO pasan
// por aquí: tienen su propia tabla y su banner rojo.
//
// Como es texto libre, la detección es por palabras clave y por eso la UI la presenta
// como "revisar", no como diagnóstico. Se descartan menciones negadas ("niega
// diabetes") y solo se leen los antecedentes del propio paciente (patológicos y no
// patológicos), no los heredofamiliares ni los quirúrgicos.

import type { Antecedentes } from './antecedentes';

export interface AlertaClinica {
  clave: string;
  label: string;
}

const REGLAS: { clave: string; label: string; patron: RegExp }[] = [
  { clave: 'anticoagulantes', label: 'Anticoagulantes / antiagregantes', patron: /anticoagul|warfarin|acenocumarol|sintrom|rivaroxaban|apixaban|dabigatran|clopidogrel|heparina|antiagregant/ },
  { clave: 'coagulacion',     label: 'Trastorno de coagulación',         patron: /hemofilia|coagulopat|trombocitopen|von willebrand/ },
  { clave: 'cardiopatia',     label: 'Cardiopatía',                      patron: /cardiopat|infarto|insuficiencia cardiaca|arritmia|valvul|marcapaso|endocarditis/ },
  { clave: 'hipertension',    label: 'Hipertensión',                     patron: /hipertens|\bhta\b/ },
  { clave: 'diabetes',        label: 'Diabetes',                         patron: /diabet|\bdm ?[12]\b/ },
  { clave: 'embarazo',        label: 'Embarazo / lactancia',             patron: /embaraz|gestacion|lactancia/ },
  { clave: 'asma',            label: 'Asma / EPOC',                      patron: /\basma\b|\bepoc\b/ },
  { clave: 'epilepsia',       label: 'Epilepsia',                        patron: /epilep|convulsion/ },
  { clave: 'bifosfonatos',    label: 'Bifosfonatos',                     patron: /bifosfonat|alendronat|zoledron/ },
];

const NEGACION = /\b(niega|niegan|negado|negada|sin|no|descarta|ausencia de|nunca)\b/;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿Alguna aparición del patrón en `texto` NO está negada en su misma oración? */
function mencionadaSinNegar(texto: string, patron: RegExp): boolean {
  const global = new RegExp(patron.source, 'g');
  for (const m of texto.matchAll(global)) {
    const inicio = m.index ?? 0;
    // Oración = desde el último punto/;/salto de línea anterior hasta la palabra.
    const oracion = texto.slice(0, inicio).split(/[.;\n]/).pop() ?? '';
    if (!NEGACION.test(oracion)) return true;
  }
  return false;
}

export function detectarAlertasClinicas(a: Antecedentes | null | undefined): AlertaClinica[] {
  if (!a) return [];
  // Los antecedentes se guardan como HTML o texto; se quitan las etiquetas.
  const texto = normalizar(`${a.patologicos}\n${a.no_patologicos}`.replace(/<[^>]*>/g, ' '));
  if (!texto.trim()) return [];
  return REGLAS.filter((r) => mencionadaSinNegar(texto, r.patron)).map(({ clave, label }) => ({ clave, label }));
}
