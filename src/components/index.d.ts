// Tipos laxos para la librería de componentes (aún en JSX).
// Durante la migración incremental a TS, los componentes presentacionales se
// consumen con props sueltas. Este sidecar evita falsos positivos de tsc sin
// tocar el runtime (Vite sigue usando index.jsx). Tipar fino vendrá al
// convertir cada componente a .tsx.

export const Icon: any;
export function useRipple(): (e: any) => void;
export const Button: any;
export const IconButton: any;
export const FAB: any;
export const Card: any;
export const Chip: any;
export const StatusPill: any;
export const Avatar: any;
export const TextField: any;
export const Select: any;
export const Switch: any;
export const Segmented: any;
export const Dialog: any;
export const Snackbar: any;
export const Divider: any;
export const SectionHeader: any;
