import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, Icon, Button } from './index';
import {
  fechaLegible, hoyLocal, resumenATexto, resumenAHtmlInforme, tituloInformeResumen,
  type ResumenPacienteResultado,
} from '../lib/ia';
import { crearInforme } from '../lib/informes';

// Ventana del Resumen IA. Es "persistente": no se cierra con Escape ni tocando el fondo, solo con
// "Cerrar", para que el médico no pierda un resumen (que costó un crédito) por un clic accidental.
// Desde aquí se puede copiar o guardarlo como informe del expediente, con la fecha de hoy; de ahí sale
// el PDF desde la lista de Informes (o directo con "Ver PDF").

function Seccion({ icono, titulo, tono, children }: { icono: string; titulo: string; tono?: 'warning'; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 'var(--r-md)', padding: '12px 14px',
      background: tono === 'warning' ? 'var(--warning-container)' : 'var(--surface-container-low)',
      border: tono === 'warning' ? 'none' : '1px solid var(--outline-variant)',
      color: tono === 'warning' ? 'var(--on-warning-container)' : 'var(--on-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', opacity: .9 }}>
        <Icon name={icono} size={18} />{titulo}
      </div>
      {children}
    </div>
  );
}

const Lista = ({ items }: { items: string[] }) => (
  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, lineHeight: 1.55 }}>
    {items.map((t, i) => <li key={i}>{t}</li>)}
  </ul>
);

export function ResumenIaModal({ open, datos, expedienteId, puedeActualizar, puedeGuardarInforme, onActualizar, onCerrar, onInformeGuardado, onVerPdf, onVerInformes }: {
  open: boolean;
  datos: ResumenPacienteResultado | null;
  expedienteId: string;
  /** false si no hay créditos, suscripción vencida, etc. */
  puedeActualizar: boolean;
  /** Emitir informes exige cédula/rol clínico y suscripción vigente (igual que la pantalla de Informe). */
  puedeGuardarInforme: boolean;
  onActualizar: () => void;
  onCerrar: () => void;
  /** Para que el expediente recargue su lista de informes. */
  onInformeGuardado: (informeId: string) => void;
  onVerPdf: (informeId: string) => Promise<void> | void;
  onVerInformes: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<{ id: string; fecha: string } | null>(null);
  const [error, setError] = useState('');
  const [abriendoPdf, setAbriendoPdf] = useState(false);
  const [copiado, setCopiado] = useState<'no' | 'si' | 'error'>('no');

  // Un resumen nuevo (Actualizar) es otro documento: vuelve a poder guardarse.
  useEffect(() => { setGuardado(null); setError(''); setCopiado('no'); }, [datos]);

  if (!datos) return null;
  const r = datos.resumen;

  const copiar = async () => {
    // Confirmación en el propio botón (un aviso flotante taparía los botones de esta ventana).
    try { await navigator.clipboard.writeText(resumenATexto(r)); setCopiado('si'); } catch { setCopiado('error'); }
    setTimeout(() => setCopiado('no'), 2500);
  };

  const guardarComoInforme = async () => {
    if (guardando || guardado) return;
    setGuardando(true); setError('');
    const fecha = hoyLocal();
    try {
      const id = await crearInforme(expedienteId, {
        tipo: 'otro',
        titulo: tituloInformeResumen(fecha),
        cuerpo: resumenAHtmlInforme(r, fecha, datos.modelo),
        visibilidad: 'expediente',
        fecha_informe: fecha,
      });
      setGuardado({ id, fecha });
      onInformeGuardado(id);
    } catch (e) {
      setError((e as Error)?.message ?? 'No se pudo guardar el informe.');
    } finally { setGuardando(false); }
  };

  const verPdf = async () => {
    if (!guardado) return;
    setAbriendoPdf(true);
    try { await onVerPdf(guardado.id); } finally { setAbriendoPdf(false); }
  };

  // En un portal: la tarjeta vive dentro de contenedores animados (transform) y un fixed dentro de ellos
  // se centra respecto al contenedor, no a la pantalla (en móvil la ventana quedaba medio fuera).
  return createPortal(
    <Dialog open={open} onClose={onCerrar} persistent width={760} style={{ height: 'min(88vh, 860px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Resumen IA del paciente" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary)', color: 'var(--on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="auto_awesome" size={22} fill />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="title-l" style={{ fontWeight: 700, fontSize: 17 }}>Resumen IA</div>
            <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
              Generado el {new Date(datos.generado_en).toLocaleDateString('es-MX', { dateStyle: 'medium' })} a las {new Date(datos.generado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {datos.modelo.replace(/^claude-/, '')}
            </div>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' }}>Borrador</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: 'var(--on-surface)' }}>{r.resumen}</p>
          {r.alertas.length > 0 && <Seccion icono="warning" titulo="Alertas" tono="warning"><Lista items={r.alertas} /></Seccion>}
          {r.evolucion.length > 0 && (
            <Seccion icono="timeline" titulo="Evolución">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, lineHeight: 1.55 }}>
                {r.evolucion.map((e, i) => <div key={i}><strong>{fechaLegible(e.fecha)}</strong> · {e.texto}</div>)}
              </div>
            </Seccion>
          )}
          {r.medicacion.length > 0 && <Seccion icono="medication" titulo="Medicación reciente"><Lista items={r.medicacion} /></Seccion>}
          {r.por_revisar.length > 0 && <Seccion icono="checklist" titulo="Por revisar"><Lista items={r.por_revisar} /></Seccion>}
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
            Borrador generado por IA a partir del expediente, sin nombre, teléfono ni CURP. Verifícalo antes de usarlo.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--outline-variant)', padding: '12px 20px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && (
            <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '9px 12px' }}>{error}</div>
          )}
          {guardado && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--on-surface)', background: 'var(--surface-container)', borderRadius: 'var(--r-sm)', padding: '9px 12px' }}>
              <Icon name="check_circle" size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ flex: 1, minWidth: 160 }}>Guardado como informe con fecha {fechaLegible(guardado.fecha)}. Lo encuentras en la pestaña Informes.</span>
              <Button variant="text" size="sm" icon={abriendoPdf ? 'progress_activity' : 'picture_as_pdf'} onClick={verPdf} disabled={abriendoPdf}>Ver PDF</Button>
              <Button variant="text" size="sm" icon="description" onClick={onVerInformes}>Ir a Informes</Button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="outlined" size="sm" icon={copiado === 'si' ? 'check' : 'content_copy'} onClick={copiar}>{copiado === 'si' ? 'Copiado' : copiado === 'error' ? 'No se pudo copiar' : 'Copiar'}</Button>
            <Button variant="outlined" size="sm" icon="refresh" onClick={onActualizar} disabled={!puedeActualizar}>Actualizar</Button>
            <div style={{ flex: 1 }} />
            <Button
              variant="filled" icon={guardado ? 'check' : 'note_add'} onClick={guardarComoInforme}
              disabled={!puedeGuardarInforme || guardando || !!guardado}
            >
              {guardado ? 'Informe guardado' : guardando ? 'Guardando…' : 'Guardar como informe'}
            </Button>
            <Button variant="text" onClick={onCerrar}>Cerrar</Button>
          </div>
          {!puedeGuardarInforme && (
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              Para guardar informes necesitas ser médico con cédula registrada y una suscripción activa.
            </div>
          )}
        </div>
      </div>
    </Dialog>,
    document.body,
  );
}
