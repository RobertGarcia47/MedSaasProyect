import { EXAMEN_ORAL_CAMPOS, hayExamenOral, type ExamenOralInput } from '../lib/examenOral';

/** Examen oral de una consulta ya guardada (solo lectura); no pinta nada si no hay. */
export function ExamenOralResumen({ examen, compacto = false }: { examen: ExamenOralInput | null | undefined; compacto?: boolean }) {
  if (!hayExamenOral(examen)) return null;
  return (
    <div style={{ marginTop: 8, padding: compacto ? '10px 12px' : '10px 14px', background: 'var(--surface-container-high)', borderRadius: compacto ? 10 : 'var(--r-sm)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 6 }}>Examen oral</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: compacto ? 12.5 : 13.5, color: 'var(--on-surface)', lineHeight: 1.5 }}>
        {EXAMEN_ORAL_CAMPOS.filter((c) => examen?.[c.key]?.trim()).map((c) => (
          <div key={c.key}><strong>{c.label}:</strong> {examen?.[c.key]}</div>
        ))}
      </div>
    </div>
  );
}
