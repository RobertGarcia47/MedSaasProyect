import { useState } from 'react';
import { Icon, Button } from './index';
import { sugerirCie10, sinCupo, type SugerenciasCie10Resultado, type SugerenciaCie10 } from '../lib/ia';
import { useEstadoIA, IaActivar, AvisoCupo } from './IaConsentimiento';

// "Sugerir con IA" del bloque de diagnósticos de la consulta. Lee el motivo, los signos y la nota que
// el médico lleva escrita y propone códigos CIE-10. Cada código ya viene validado contra el catálogo
// oficial en el servidor; aquí el médico elige cuáles agregar (nada se agrega solo).

const CONFIANZA: Record<SugerenciaCie10['confianza'], { texto: string; bg: string; ink: string }> = {
  alta:  { texto: 'Confianza alta',  bg: 'var(--primary-container)',          ink: 'var(--on-primary-container)' },
  media: { texto: 'Confianza media', bg: 'var(--surface-container-highest)',  ink: 'var(--on-surface-variant)' },
  baja:  { texto: 'Confianza baja',  bg: 'var(--warning-container)',          ink: 'var(--on-warning-container)' },
};

const chip: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, flexShrink: 0 };

export function Cie10Sugerencias({ clinicaId, esOwner, puedeUsar, resolverExpedienteId, obtenerTexto, yaElegidos, onAgregar, toast }: {
  clinicaId: string | null;
  esOwner: boolean;
  puedeUsar: boolean;
  /** Devuelve el expediente del paciente (lo crea si aún no existe; el registro de la consulta lo haría igual). */
  resolverExpedienteId: () => Promise<string>;
  /** Lo que el médico lleva escrito hasta ahora. Se lee al pulsar, no en cada tecla. */
  obtenerTexto: () => { motivo: string; notas: string; signos: string };
  yaElegidos: string[];
  onAgregar: (c: { codigo: string; descripcion: string }) => void;
  toast?: (m: string) => void;
}) {
  const ia = useEstadoIA(clinicaId);
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  const [res, setRes] = useState<SugerenciasCie10Resultado | null>(null);
  const [error, setError] = useState('');

  const sugerir = async () => {
    setEstado('cargando'); setError('');
    try {
      const expedienteId = await resolverExpedienteId();
      const t = obtenerTexto();
      setRes(await sugerirCie10({ expedienteId, ...t, yaElegidos }));
      setEstado('listo');
    } catch (e) {
      setError((e as Error).message);
      setEstado('error');
    }
  };

  const agregar = (s: SugerenciaCie10) => {
    onAgregar({ codigo: s.codigo, descripcion: s.descripcion });
    toast?.(`${s.codigo} agregado`);
  };

  if (!clinicaId) return null;
  // Las ya agregadas desaparecen de la lista.
  const visibles = (res?.sugerencias ?? []).filter((s) => !yaElegidos.includes(s.codigo));

  return (
    <div style={{ marginBottom: 12, borderRadius: 'var(--r-md)', background: 'var(--surface-container)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Icon name="auto_awesome" size={20} style={{ color: 'var(--primary)' }} />
        <span style={{ flex: 1, minWidth: 180, fontSize: 13, lineHeight: 1.45, color: 'var(--on-surface-variant)' }}>
          <strong style={{ color: 'var(--on-surface)' }}>Sugerir con IA.</strong> Lee el motivo y la nota y propone códigos. Tú decides cuáles agregar.
        </span>
        {ia.estado?.habilitada && estado !== 'cargando' && (
          <Button variant="outlined" size="sm" icon={estado === 'listo' ? 'refresh' : 'auto_awesome'} onClick={sugerir} disabled={!puedeUsar || sinCupo(ia.estado)}>
            {estado === 'listo' ? 'Volver a sugerir' : estado === 'error' ? 'Reintentar' : 'Sugerir diagnósticos'}
          </Button>
        )}
      </div>

      {ia.cargando && <div className="skel-block" style={{ height: 10, width: '55%', borderRadius: 6, marginTop: 10 }} />}

      {!ia.cargando && ia.error && (
        <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '8px 10px' }}>
          No se pudo verificar la configuración de IA de la clínica. Si es la primera vez, falta correr el SQL de consentimiento en Supabase.
        </p>
      )}

      {!ia.cargando && !ia.error && !ia.estado?.habilitada && (
        <div style={{ marginTop: 10 }}><IaActivar clinicaId={clinicaId} esOwner={esOwner} onCambio={ia.recargar} compacto /></div>
      )}

      {ia.estado?.habilitada && <AvisoCupo estado={ia.estado} />}

      {ia.estado?.habilitada && !puedeUsar && (
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Disponible con una suscripción activa.</p>
      )}

      {estado === 'cargando' && (
        <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: 'var(--on-surface-variant)' }}>
          <Icon name="progress_activity" size={18} style={{ animation: 'spin 1s linear infinite' }} /> Leyendo la nota…
        </div>
      )}

      {estado === 'error' && (
        <div role="alert" style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '9px 12px' }}>{error}</div>
      )}

      {estado === 'listo' && res && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibles.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
              {res.sugerencias.length ? 'Ya agregaste todas las sugerencias.' : res.aviso}
            </p>
          )}
          {visibles.map((s) => {
            const c = CONFIANZA[s.confianza];
            return (
              <div key={s.codigo} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{s.codigo}</span>
                    <span style={{ ...chip, background: c.bg, color: c.ink }}>{c.texto}</span>
                    {s.daga && <span title="Código de etiología: no debe usarse solo" style={{ ...chip, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>Daga †</span>}
                    {s.asterisco && <span title="Código de manifestación: solo como código adicional" style={{ ...chip, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>Asterisco *</span>}
                    {s.ajustado && <span title="La IA propuso otro código que no está en el catálogo; se buscó por el nombre del diagnóstico." style={{ ...chip, background: 'var(--warning-container)', color: 'var(--on-warning-container)' }}>Ajustado al catálogo</span>}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.35, color: 'var(--on-surface)' }}>{s.descripcion}</div>
                  {s.justificacion && <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.4, color: 'var(--on-surface-variant)' }}>Según la nota: {s.justificacion}</div>}
                </div>
                <Button variant="tonal" size="sm" icon="add" onClick={() => agregar(s)}>Agregar</Button>
              </div>
            );
          })}
          {visibles.length > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
              Sugerencias generadas por IA ({res.modelo.replace(/^claude-/, '')}). Verifícalas antes de agregarlas: el diagnóstico es tuyo.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
