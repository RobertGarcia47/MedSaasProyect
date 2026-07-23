// Tipos laxos para la librería de componentes (aún en JSX).
// Durante la migración incremental a TS, los componentes presentacionales se
// consumen con props sueltas. Este sidecar evita falsos positivos de tsc sin
// tocar el runtime (Vite sigue usando index.jsx). Tipar fino vendrá al
// convertir cada componente a .tsx.

// Icon va tipado (no `any`) porque su superficie de props es pequeña y ya causó
// dos bugs silenciosos: props que el componente no reenviaba y que `any` dejaba
// pasar sin chistar (el ojo de contraseña en Login, las × de "quitar").
export function Icon(props: {
  name: string;
  fill?: boolean;
  size?: number;
  weight?: number;
  className?: string;
  style?: import('react').CSSProperties;
  onClick?: (e: import('react').MouseEvent | import('react').KeyboardEvent) => void;
  title?: string;
  ariaLabel?: string;
}): JSX.Element;
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
export function useIsMobile(breakpoint?: number): boolean;
export function useThemeColors(): Record<string, string>;
