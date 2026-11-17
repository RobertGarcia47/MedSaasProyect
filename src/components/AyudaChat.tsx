import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button } from './index';
import { useAccount } from '../context/AccountContext';
import {
  preguntarAyuda, enviarReporteAyuda, ACCESOS_AYUDA,
  type MensajeAyuda, type TipoReporteAyuda,
} from '../lib/ia';

// Chat de ayuda: responde cómo usar MedSaaS a partir de la guía del producto (Edge Function `ayuda-chat`).
// No lee datos de pacientes ni consume créditos de IA. Si no sabe algo, remite a "Enviar al equipo", que
// guarda un reporte (tabla ayuda_reportes) para el equipo de MedSaaS.
// Vive montado en App.tsx: la conversación se conserva mientras navegas, hasta recargar la página.

const PANTALLAS: Record<string, string> = {
  dashboard: 'Inicio', calendar: 'Agenda', patients: 'Pacientes', patient: 'Expediente del paciente',
  consulta: 'Nueva consulta', receta: 'Nueva receta', informe: 'Nuevo informe', laboratorio: 'Laboratorio',
  profile: 'Mi perfil', procedimientos: 'Procedimientos y precios', settings: 'Configuración',
};

interface Burbuja extends MensajeAyuda { acciones?: string[] }

// ── Texto con formato mínimo (negritas, listas) sin inyectar HTML ─────────────
const Inline = ({ t }: { t: string }) => (
  <>{t.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}</>
);

function Texto({ texto }: { texto: string }) {
  const lineas = texto.split('\n');
  const num = /^\s*\d+[.)]\s+/;
  const vin = /^\s*[-•]\s+/;
  const bloques: ReactNode[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (num.test(l) || vin.test(l)) {
      const ordenada = num.test(l);
      const re = ordenada ? num : vin;
      const items: string[] = [];
      while (i < lineas.length && re.test(lineas[i])) { items.push(lineas[i].replace(re, '')); i++; }
      const Lista = ordenada ? 'ol' : 'ul';
      bloques.push(
        <Lista key={bloques.length} style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((it, k) => <li key={k}><Inline t={it} /></li>)}
        </Lista>,
      );
    } else if (!l.trim()) { i++; }
    else { bloques.push(<p key={bloques.length} style={{ margin: '4px 0' }}><Inline t={l} /></p>); i++; }
  }
  return <>{bloques}</>;
}

export function AyudaChat({ open, onClose, go, pantalla, toast }: {
  open: boolean; onClose: () => void; go: (n: string, p?: any) => void; pantalla: string; toast?: (m: string) => void;
}) {
  const account = useAccount();
  const [mensajes, setMensajes] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [vista, setVista] = useState<'chat' | 'reporte'>('chat');
  const [tipo, setTipo] = useState<TipoReporteAyuda>('problema');
  const [detalle, setDetalle] = useState('');
  const [adjuntar, setAdjuntar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errorReporte, setErrorReporte] = useState('');
  const idTitulo = useId();
  const finRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abrioDesde = useRef<HTMLElement | null>(null);

  const etiquetaPantalla = PANTALLAS[pantalla] ?? 'la aplicación';
  const esOwner = account?.rol === 'owner';

  // Escape cierra; el foco entra al abrir y vuelve a donde estaba al cerrar.
  useEffect(() => {
    if (!open) return;
    abrioDesde.current = document.activeElement as HTMLElement | null;
    // El widget de GoHighLevel del Inicio ocupa la misma esquina y tapa botones del panel: se oculta mientras está abierto (ver index.css).
    document.documentElement.classList.add('ayuda-abierta');
    const t = setTimeout(() => entradaRef.current?.focus(), 50);
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => { clearTimeout(t); document.removeEventListener('keydown', h); document.documentElement.classList.remove('ayuda-abierta'); abrioDesde.current?.focus?.(); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [mensajes, cargando, vista, open]);

  const sugerencias = useMemo(() => [
    '¿Cómo agendo una cita?',
    '¿Cómo registro un paciente nuevo?',
    '¿Cómo registro una consulta?',
    ...(account?.puedePrescribir ? ['¿Cómo emito una receta?'] : []),
    ...(esOwner ? ['¿Cómo invito a mi asistente?', '¿Cómo activo la inteligencia artificial?'] : []),
  ].slice(0, 5), [account?.puedePrescribir, esOwner]);

  if (!open) return null;

  const clinicaId = account?.clinicaId ?? null;

  const preguntar = async (historial: Burbuja[]) => {
    if (!clinicaId) return;
    setCargando(true); setError('');
    try {
      const r = await preguntarAyuda({
        clinicaId, mensajes: historial.map(({ role, content }) => ({ role, content })),
        pantalla: etiquetaPantalla, rol: account?.rol ?? null, tipoProfesional: account?.tipoProfesional ?? null,
        accesoLimitado: account?.accesoNivel === 'limitado',
      });
      setMensajes([...historial, { role: 'assistant', content: r.respuesta, acciones: r.acciones }]);
    } catch (e) {
      setError((e as Error).message);
    } finally { setCargando(false); }
  };

  const enviar = (t: string) => {
    const limpio = t.trim();
    if (!limpio || cargando) return;
    const historial: Burbuja[] = [...mensajes, { role: 'user', content: limpio }];
    setMensajes(historial); setTexto('');
    preguntar(historial);
  };

  const reintentar = () => { if (mensajes.length && mensajes[mensajes.length - 1].role === 'user') preguntar(mensajes); };

  const nueva = () => { setMensajes([]); setError(''); setTexto(''); setVista('chat'); };

  const abrirReporte = () => { setEnviado(false); setErrorReporte(''); setVista('reporte'); };
  const mandarReporte = async () => {
    if (!clinicaId || !detalle.trim()) return;
    setEnviando(true); setErrorReporte('');
    try {
      await enviarReporteAyuda({
        clinicaId, tipo, mensaje: detalle, pantalla: etiquetaPantalla,
        conversacion: adjuntar && mensajes.length ? mensajes.map(({ role, content }) => ({ role, content })) : null,
      });
      setEnviado(true); setDetalle('');
      toast?.('Reporte enviado al equipo');
    } catch (e) { setErrorReporte((e as Error).message); }
    finally { setEnviando(false); }
  };

  const ir = (clave: string) => {
    const a = ACCESOS_AYUDA[clave]; if (!a) return;
    onClose(); go(a.ruta);
  };

  const burbuja = (m: Burbuja, i: number) => (
    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
      <div style={{
        maxWidth: '90%', padding: '10px 14px', fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word',
        borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: m.role === 'user' ? 'var(--primary-container)' : 'var(--surface-container)',
        color: m.role === 'user' ? 'var(--on-primary-container)' : 'var(--on-surface)',
      }}>
        {m.role === 'user' ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span> : <Texto texto={m.content} />}
      </div>
      {m.acciones && m.acciones.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {m.acciones.map((a) => ACCESOS_AYUDA[a] && (
            <Button key={a} variant="outlined" size="sm" icon="arrow_forward" onClick={() => ir(a)}>{ACCESOS_AYUDA[a].etiqueta}</Button>
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'var(--scrim, rgba(0,0,0,.4))', display: 'flex', justifyContent: 'flex-end' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        style={{ width: 'min(440px, 100vw)', height: '100%', background: 'var(--surface)', color: 'var(--on-surface)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--elev-3)', animation: 'fadeIn .18s ease' }}>

        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--outline-variant)', flexShrink: 0 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--primary)', color: 'var(--on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="support_agent" size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={idTitulo} className="title-m" style={{ margin: 0 }}>Ayuda de MedSaaS</h2>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>Te explico cómo usar el sistema</div>
          </div>
          {vista === 'chat' && mensajes.length > 0 && (
            <button type="button" onClick={nueva} title="Nueva conversación" aria-label="Nueva conversación"
              style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: 6, color: 'var(--on-surface-variant)' }}>
              <Icon name="add_comment" size={22} />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', padding: 6, color: 'var(--on-surface-variant)' }}>
            <Icon name="close" size={22} />
          </button>
        </div>

        {!clinicaId ? (
          <p style={{ padding: 20, fontSize: 14, color: 'var(--on-surface-variant)' }}>Esta cuenta no pertenece a una clínica, así que el asistente no está disponible.</p>
        ) : vista === 'reporte' ? (
          /* ── Enviar al equipo ── */
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button type="button" onClick={() => setVista('chat')} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: 13.5, fontFamily: 'inherit', padding: 0 }}>
              <Icon name="arrow_back" size={18} />Volver al chat
            </button>
            {enviado ? (
              <div role="status" style={{ padding: '18px 16px', borderRadius: 'var(--r-md)', background: 'var(--primary-container)', color: 'var(--on-primary-container)', fontSize: 14, lineHeight: 1.6 }}>
                <strong>¡Gracias! Recibimos tu reporte.</strong> El equipo de MedSaaS lo revisará. Si es urgente, vuelve a escribirnos por el canal de soporte que ya conoces.
              </div>
            ) : (
              <>
                <h3 className="title-s" style={{ margin: 0 }}>Enviar al equipo de MedSaaS</h3>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  ¿Qué quieres hacer?
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoReporteAyuda)}
                    style={{ height: 42, borderRadius: 'var(--r-sm)', border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--on-surface)', padding: '0 10px', fontSize: 14, fontFamily: 'inherit' }}>
                    <option value="problema">Reportar un problema</option>
                    <option value="sugerencia">Sugerir una mejora</option>
                    <option value="pregunta">Hacer una pregunta</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
                  Cuéntanos con detalle
                  <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={6} maxLength={4000}
                    placeholder="¿Qué intentabas hacer y qué pasó? No incluyas datos de pacientes."
                    style={{ borderRadius: 'var(--r-sm)', border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--on-surface)', padding: 12, fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }} />
                </label>
                {mensajes.length > 0 && (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={adjuntar} onChange={(e) => setAdjuntar(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--primary)', flexShrink: 0 }} />
                    <span>Incluir esta conversación para que el equipo tenga contexto</span>
                  </label>
                )}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--on-surface-variant)' }}>Se guarda junto con la pantalla donde estabas (<strong>{etiquetaPantalla}</strong>) y tu clínica.</p>
                {errorReporte && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>{errorReporte}</div>}
                <div><Button variant="filled" icon="send" onClick={mandarReporte} disabled={enviando || !detalle.trim()}>{enviando ? 'Enviando…' : 'Enviar al equipo'}</Button></div>
              </>
            )}
          </div>
        ) : (
          /* ── Conversación ── */
          <>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
              <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'var(--surface-container)', fontSize: 14, lineHeight: 1.55, maxWidth: '92%' }}>
                {account?.profile?.nombre ? `Hola, ${account.profile.nombre}. ` : 'Hola. '}Soy el asistente de ayuda de MedSaaS: te explico dónde está cada cosa y cómo hacerla. <strong>No escribas datos de pacientes</strong> en este chat.
              </div>
              {mensajes.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }}>Prueba preguntando</span>
                  {sugerencias.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)} className="state-layer"
                      style={{ position: 'relative', textAlign: 'left', border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--primary)', borderRadius: 999, padding: '8px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {mensajes.map(burbuja)}
              {cargando && (
                <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--on-surface-variant)' }}>
                  <Icon name="progress_activity" size={18} style={{ animation: 'spin 1s linear infinite' }} /> Escribiendo…
                </div>
              )}
              {error && (
                <div role="alert" style={{ fontSize: 13, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600 }}>{error}</span>
                  <Button variant="outlined" size="sm" icon="refresh" onClick={reintentar}>Reintentar</Button>
                </div>
              )}
              <div ref={finRef} />
            </div>

            {/* Entrada */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--outline-variant)', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea ref={entradaRef} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000}
                  rows={Math.min(4, Math.max(1, texto.split('\n').length))} aria-label="Escribe tu pregunta"
                  placeholder="Escribe tu pregunta…"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(texto); } }}
                  style={{ flex: 1, resize: 'none', borderRadius: 'var(--r-md)', border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--on-surface)', padding: '10px 12px', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none' }} />
                <button type="button" onClick={() => enviar(texto)} disabled={cargando || !texto.trim()} aria-label="Enviar pregunta"
                  style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: cargando || !texto.trim() ? 'default' : 'pointer', background: 'var(--primary)', color: 'var(--on-primary)', opacity: cargando || !texto.trim() ? .45 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={20} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', lineHeight: 1.4, flex: 1, minWidth: 180 }}>
                  Respuestas generadas por IA con la guía de MedSaaS; pueden tener errores.
                </span>
                <button type="button" onClick={abrirReporte} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
                  <Icon name="flag" size={16} />Enviar al equipo
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
