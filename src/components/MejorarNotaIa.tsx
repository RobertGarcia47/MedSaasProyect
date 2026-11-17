import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button } from './index';
import { mejorarNota, propuestaNotaAHtml, sinCupo, type FormatoNota, type PropuestaNotaResultado } from '../lib/ia';
import { useEstadoIA, IaActivar, AvisoCupo } from './IaConsentimiento';

// "Mejorar con IA" de la nota de consulta. Reorganiza lo que el profesional ya escribió en las secciones
// de la nota clínica. Es la única función de IA que toca SU texto, así que:
//   - nunca reemplaza nada sola: abre una comparación "tu nota / propuesta" y el profesional elige
//     reemplazar, agregar al final o descartar;
//   - tras reemplazar o agregar queda el botón "Restaurar mi texto anterior";
//   - el servidor ya descartó las frases con cifras que no estaban en la nota (y aquí se avisa cuántas).

const htmlATexto = (html: string) => {
  const t = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<li[^>]*>/gi, '- ');
  const d = new DOMParser().parseFromString(t, 'text/html');
  return (d.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
};

export function MejorarNotaIa({ clinicaId, esOwner, puedeUsar, formato, resolverExpedienteId, obtenerNota, leerEditorHtml, escribirEditorHtml, toast }: {
  clinicaId: string | null;
  esOwner: boolean;
  puedeUsar: boolean;
  formato: FormatoNota;
  resolverExpedienteId: () => Promise<string>;
  obtenerNota: () => { motivo: string; signos: string };
  leerEditorHtml: () => string;
  escribirEditorHtml: (html: string) => void;
  toast?: (m: string) => void;
}) {
  const ia = useEstadoIA(clinicaId);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [propuesta, setPropuesta] = useState<PropuestaNotaResultado | null>(null);
  const [original, setOriginal] = useState('');         // texto plano de la nota al pedir la propuesta
  const [previoHtml, setPrevioHtml] = useState<string | null>(null);   // para "Restaurar"
  const idTitulo = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const abrirDesdeRef = useRef<HTMLElement | null>(null);

  const mejorar = async () => {
    const html = leerEditorHtml();
    const texto = htmlATexto(html);
    if (texto.length < 25) { setError('Escribe un poco más en la nota para que la IA pueda reorganizarla.'); return; }
    abrirDesdeRef.current = document.activeElement as HTMLElement | null;
    setCargando(true); setError('');
    try {
      const expedienteId = await resolverExpedienteId();
      const n = obtenerNota();
      const res = await mejorarNota({ expedienteId, motivo: n.motivo, signos: n.signos, notas: html, formato });
      if (!res.secciones.length) { setError('La IA no encontró contenido que pudiera reorganizar con seguridad. Tu nota quedó igual.'); return; }
      setOriginal(texto); setPropuesta(res);
    } catch (e) {
      setError((e as Error).message);
    } finally { setCargando(false); }
  };

  const cerrar = () => { setPropuesta(null); abrirDesdeRef.current?.focus?.(); };

  const aceptar = (modo: 'reemplazar' | 'agregar') => {
    if (!propuesta) return;
    const actual = leerEditorHtml();
    const nuevo = propuestaNotaAHtml(propuesta.secciones);
    setPrevioHtml(actual);
    escribirEditorHtml(modo === 'reemplazar' || !htmlATexto(actual) ? nuevo : actual + '<p><br></p>' + nuevo);
    toast?.(modo === 'reemplazar' ? 'Nota reemplazada. Puedes restaurar tu texto anterior.' : 'Propuesta agregada al final de la nota.');
    setPropuesta(null);
  };

  const restaurar = () => {
    if (previoHtml === null) return;
    escribirEditorHtml(previoHtml); setPrevioHtml(null);
    toast?.('Se restauró tu texto anterior');
  };

  // Escape cierra; el foco entra al diálogo al abrir.
  useEffect(() => {
    if (!propuesta) return;
    dialogRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [propuesta]);

  if (!clinicaId) return null;
  return (
    <>
      <div style={{ padding: '10px 16px', background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Icon name="auto_awesome" size={20} style={{ color: 'var(--primary)' }} />
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.45, color: 'var(--on-surface-variant)' }}>
            <strong style={{ color: 'var(--on-surface)' }}>Mejorar con IA.</strong> Ordena lo que escribiste en las secciones de la nota. No cambia nada hasta que tú lo aceptes.
          </span>
          {previoHtml !== null && !cargando && (
            <Button variant="text" size="sm" icon="undo" onClick={restaurar}>Restaurar mi texto anterior</Button>
          )}
          {ia.estado?.habilitada && (
            <Button variant="outlined" size="sm" icon="auto_awesome" onClick={mejorar} disabled={!puedeUsar || cargando || sinCupo(ia.estado)}>
              {cargando ? 'Reorganizando…' : 'Mejorar nota'}
            </Button>
          )}
        </div>
        {cargando && <div role="status" aria-live="polite" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Leyendo tu nota…</div>}
        {error && <div role="alert" style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '9px 12px' }}>{error}</div>}
        {!ia.cargando && ia.error && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
            No se pudo verificar la configuración de IA de la clínica.
          </p>
        )}
        {!ia.cargando && !ia.error && !ia.estado?.habilitada && (
          <div style={{ marginTop: 10 }}><IaActivar clinicaId={clinicaId} esOwner={esOwner} onCambio={ia.recargar} compacto /></div>
        )}
        {ia.estado?.habilitada && <AvisoCupo estado={ia.estado} />}
        {ia.estado?.habilitada && !puedeUsar && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Disponible con una suscripción activa.</p>}
      </div>

      {propuesta && createPortal(
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}
            style={{ margin: 'auto', width: '100%', maxWidth: 1040, background: 'var(--surface)', color: 'var(--on-surface)', borderRadius: 'var(--r-modal)', boxShadow: 'var(--elev-3)', outline: 'none', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
              <Icon name="auto_awesome" size={22} style={{ color: 'var(--primary)' }} />
              <h2 id={idTitulo} className="title-m" style={{ flex: 1, margin: 0 }}>Mejorar nota con IA</h2>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' }}>Borrador</span>
              <button type="button" onClick={cerrar} aria-label="Cerrar" style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: 4, color: 'var(--on-surface-variant)' }}>
                <Icon name="close" size={22} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16, padding: 20 }}>
              <section aria-label="Tu nota actual">
                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>Tu nota</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-container)', maxHeight: 420, overflowY: 'auto' }}>{original}</div>
              </section>
              <section aria-label="Propuesta de la IA">
                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 8 }}>Propuesta</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, padding: '12px 14px', borderRadius: 'var(--r-md)', border: '1.5px solid var(--primary)', maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {propuesta.secciones.map((s) => (
                    <p key={s.titulo} style={{ margin: 0 }}><strong>{s.titulo}:</strong> {s.texto}</p>
                  ))}
                </div>
              </section>
            </div>

            {(propuesta.descartadas > 0 || propuesta.faltantes.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 16px' }}>
                {propuesta.descartadas > 0 && (
                  <div role="note" style={{ fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--warning-container)', color: 'var(--on-warning-container)' }}>
                    <strong>Se omitieron {propuesta.descartadas} {propuesta.descartadas === 1 ? 'oración' : 'oraciones'}</strong> porque incluían cifras que no estaban en tu nota. Revisa que no falte nada importante.
                  </div>
                )}
                {propuesta.faltantes.length > 0 && (
                  <div style={{ fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-container)' }}>
                    <strong>Podrías agregar:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{propuesta.faltantes.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--outline-variant)' }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 11.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
                Generado por IA ({propuesta.modelo.replace(/^claude-/, '')}). Solo reorganiza lo que escribiste: revísalo antes de aceptar.
              </span>
              <Button variant="text" onClick={cerrar}>Descartar</Button>
              <Button variant="outlined" icon="playlist_add" onClick={() => aceptar('agregar')}>Agregar al final</Button>
              <Button variant="filled" icon="check" onClick={() => aceptar('reemplazar')}>Reemplazar mi nota</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
