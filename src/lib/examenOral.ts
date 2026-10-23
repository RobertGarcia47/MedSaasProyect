// Examen oral de la consulta odontológica (solo dentistas — ver esPracticaDental).
// Se guarda cifrado dentro de la consulta (consultas.examen_oral_enc, vía
// crear_consulta / obtener_consultas); las consultas son inmutables, así que no
// hay edición posterior.

export interface ExamenOralInput {
  tejido_blando?: string;
  oclusion?: string;
  atm?: string;
}

export const EXAMEN_ORAL_VACIO: ExamenOralInput = { tejido_blando: '', oclusion: '', atm: '' };

/** Cada campo es texto libre; las opciones rápidas se anexan al texto con "; ". */
export const EXAMEN_ORAL_CAMPOS: { key: keyof ExamenOralInput; label: string; placeholder: string; opciones: string[] }[] = [
  {
    key: 'tejido_blando', label: 'Tejido blando', placeholder: 'Mucosa, encía, lengua, paladar…',
    opciones: ['Sin alteraciones', 'Encía inflamada', 'Sangrado al sondeo', 'Lesión en mucosa', 'Placa y cálculo'],
  },
  {
    key: 'oclusion', label: 'Oclusión', placeholder: 'Clasificación de mordida, mordida cruzada, sobremordida…',
    opciones: ['Clase I de Angle', 'Clase II', 'Clase III', 'Mordida cruzada', 'Sobremordida', 'Mordida abierta'],
  },
  {
    key: 'atm', label: 'ATM', placeholder: 'Clic, crepitación, desviación, dolor…',
    opciones: ['Sin alteraciones', 'Clic', 'Crepitación', 'Desviación a la apertura', 'Dolor a la palpación'],
  },
];

/** ¿Hay al menos un campo con texto? (para no guardar un objeto de strings vacíos). */
export function hayExamenOral(e: ExamenOralInput | null | undefined): boolean {
  return !!e && Object.values(e).some((v) => v && v.trim());
}
