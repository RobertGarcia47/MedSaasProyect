import { useCallback, useEffect, useId, useState } from 'react';
import { Icon, Button } from './index';
import { obtenerEstadoIA, configurarIAClinica, sinCupo, type EstadoIA } from '../lib/ia';

// Consentimiento de la clínica para usar IA. La aceptación vive en la base (clinicas.ia_habilitada y
// metadatos), la da el PROPIETARIO, y las Edge Functions la exigen: no basta con ocultar un botón.
//
// ⚠ TEXTO PENDIENTE DE REVISIÓN LEGAL antes de ofrecerlo a otras clínicas (aviso de privacidad,
// LFPDPPP, NOM-024). Al cambiarlo, sube IA_CONSENT_VERSION en lib/ia.ts.

export const TEXTO_CONSENTIMIENTO: Array<{ icono: string; titulo: string; texto: string }> = [
  { icono: 'auto_awesome', titulo: 'Qué hace',
    texto: 'Prepara borradores de apoyo: un resumen del expediente antes de la consulta y sugerencias de códigos CIE-10. Siempre los pide un profesional y nada se guarda ni se aplica solo.' },
  { icono: 'upload', titulo: 'Qué se envía',
    texto: 'El texto clínico necesario (edad, sexo, alergias, antecedentes, motivos, notas, recetas y signos). Antes de enviarlo se eliminan el nombre del paciente, el teléfono, el correo y la CURP.' },
  { icono: 'cloud', titulo: 'A quién',
    texto: 'A Anthropic, proveedor del modelo Claude, a través del servidor de MedSaaS. Según los términos comerciales de su API, los datos enviados no se usan para entrenar sus modelos.' },
  { icono: 'verified_user', titulo: 'Tu responsabilidad',
    texto: 'Son borradores: el profesional los verifica y decide. No sustituyen el criterio clínico. Revisa que el aviso de privacidad de tu clínica contemple el uso de proveedores tecnológicos.' },
  { icono: 'history', titulo: 'Control',
    texto: 'Cada uso queda registrado. Como propietario puedes apagar la IA cuando quieras desde Configuración → Inteligencia artificial.' },
];

/** Estado de la IA en la clínica, con recarga. `error` indica que no se pudo consultar (p. ej. falta el SQL). */
export function useEstadoIA(clinicaId: string | null) {
  const [estado, setEstado] = useState<EstadoIA | null>(null);
  const [cargando, setCargando] = useState(!!clinicaId);
  const [error, setError] = useState(false);

  const recargar = useCallback(async () => {
    if (!clinicaId) { setCargando(false); return; }
    try { setEstado(await obtenerEstadoIA(clinicaId)); setError(false); }
    catch (e) { console.error(e); setError(true); }
    finally { setCargando(false); }
  }, [clinicaId]);

  useEffect(() => { setCargando(!!clinicaId); recargar(); }, [clinicaId, recargar]);
  return { estado, cargando, error, recargar };
}

export const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Pide al propietario que active la IA (con el consentimiento a la vista). A los demás les explica qué falta. */
export function IaActivar({ clinicaId, esOwner, onCambio, compacto }: {
  clinicaId: string; esOwner: boolean; onCambio: () => void; compacto?: boolean;
}) {
  const [acepto, setAcepto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const idCheck = useId();

  if (!esOwner) {
    return (
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--on-surface-variant)', padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-container)' }}>
        La IA no está activada en tu clínica. El propietario puede activarla en <strong>Configuración → Inteligencia artificial</strong>.
      </p>
    );
  }

  const activar = async () => {
    setGuardando(true); setError('');
    try { await configurarIAClinica(clinicaId, true); onCambio(); }
    catch (e) { setError((e as Error).message || 'No se pudo activar.'); }
    finally { setGuardando(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compacto ? 8 : 12, padding: compacto ? '10px 12px' : '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-container)' }}>
        {TEXTO_CONSENTIMIENTO.map((b) => (
          <div key={b.titulo} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={b.icono} size={18} style={{ color: 'var(--primary)', marginTop: 1, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: compacto ? 12.5 : 13.5, lineHeight: 1.5, color: 'var(--on-surface)' }}>
              <strong>{b.titulo}.</strong> {b.texto}
            </p>
          </div>
        ))}
      </div>
      <label htmlFor={idCheck} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, cursor: 'pointer', color: 'var(--on-surface)' }}>
        <input id={idCheck} type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)}
          style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--primary)', flexShrink: 0 }} />
        <span>He leído esto y activo la IA en nombre de la clínica.</span>
      </label>
      {error && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>{error}</div>}
      <div>
        <Button variant="filled" icon="auto_awesome" onClick={activar} disabled={!acepto || guardando}>
          {guardando ? 'Activando…' : 'Activar IA en mi clínica'}
        </Button>
      </div>
    </div>
  );
}

/** Pestaña "Inteligencia artificial" de Configuración: estado, consentimiento, uso y apagado. */
/** Aviso breve cuando la clínica ya gastó los créditos de IA de su plan este mes. Nada si aún hay créditos. */
export function AvisoCupo({ estado }: { estado: EstadoIA | null }) {
  if (!sinCupo(estado)) return null;
  return (
    <div role="status" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: 'var(--warning-container)', color: 'var(--on-warning-container)' }}>
      <strong>Se acabaron los créditos de IA de este mes.</strong>{estado?.renueva_el ? ` Se renuevan el ${fechaCorta(estado.renueva_el + 'T12:00:00')}.` : ''} Puedes cambiar de plan en Configuración → Suscripción.
    </div>
  );
}

/** Contador de créditos del mes: "120 de 3,000", con barra y aviso al 80%. */
function ContadorCreditos({ e, onVerPlanes }: { e: EstadoIA; onVerPlanes?: () => void }) {
  if (e.cupo_mes == null) {
    return (
      <div style={{ flex: '1 1 180px', padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-container)' }}>
        <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{e.usos_mes}</div>
        <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>usos de IA este mes en la clínica</div>
      </div>
    );
  }
  const usados = e.creditos_mes ?? 0;
  const pct = e.cupo_mes > 0 ? Math.min(100, Math.round((usados / e.cupo_mes) * 100)) : 100;
  const agotado = usados >= e.cupo_mes;
  const alto = !agotado && pct >= 80;
  const color = agotado ? 'var(--error)' : alto ? 'var(--warning)' : 'var(--primary)';
  const nf = (n: number) => n.toLocaleString('es-MX');
  return (
    <div style={{ flex: '1 1 320px', padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-container)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{nf(usados)}</span>
        <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>de {nf(e.cupo_mes)} créditos de IA este mes</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={e.cupo_mes} aria-valuenow={Math.min(usados, e.cupo_mes)} aria-label="Créditos de IA usados este mes"
        style={{ height: 8, borderRadius: 999, background: 'var(--surface-container-highest)', margin: '10px 0 8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
        Cada uso de IA gasta 1 crédito{e.renueva_el ? ` · se renuevan el ${fechaCorta(e.renueva_el + 'T12:00:00')}` : ''}.
        {agotado && <strong style={{ color: 'var(--error)' }}> Se acabaron los créditos de este mes.</strong>}
        {alto && <strong style={{ color: 'var(--on-warning-container)' }}> Ya usaste el {pct}%.</strong>}
        {(agotado || alto) && onVerPlanes && <> <button type="button" onClick={onVerPlanes} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit', textDecoration: 'underline' }}>Ver planes</button></>}
      </div>
    </div>
  );
}

export function PanelIaConfiguracion({ clinicaId, esOwner, onVerPlanes }: { clinicaId: string; esOwner: boolean; onVerPlanes?: () => void }) {
  const ia = useEstadoIA(clinicaId);
  const [apagando, setApagando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');

  const apagar = async () => {
    setApagando(true); setError('');
    try { await configurarIAClinica(clinicaId, false); setConfirmar(false); await ia.recargar(); }
    catch (e) { setError((e as Error).message || 'No se pudo apagar.'); }
    finally { setApagando(false); }
  };

  if (ia.cargando) return <div className="skel-block" style={{ height: 14, width: '50%', borderRadius: 6 }} />;
  if (ia.error || !ia.estado) {
    return (
      <p role="alert" style={{ margin: 0, fontSize: 13.5, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
        No se pudo consultar la configuración de IA. Si es la primera vez, falta correr el SQL de consentimiento (sql/2026-11-17_ia_consentimiento_uso.sql) en Supabase.
      </p>
    );
  }
  const e = ia.estado;

  if (!e.habilitada) {
    return (
      <>
        <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '-6px 0 16px', fontSize: 13.5 }}>
          La IA está <strong>apagada</strong> en tu clínica. Mientras lo esté, ninguna función de IA puede usarse.
        </p>
        <IaActivar clinicaId={clinicaId} esOwner={esOwner} onCambio={ia.recargar} />
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: 'var(--primary-container)', color: 'var(--on-primary-container)' }}>
          <Icon name="check_circle" size={18} /> IA activada
        </span>
        <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
          {e.consentimiento_por ? `Aceptada por ${e.consentimiento_por}` : 'Aceptada'}{e.consentimiento_at ? ` el ${fechaCorta(e.consentimiento_at)}` : ''}
          {e.consentimiento_version ? ` · texto versión ${e.consentimiento_version}` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <ContadorCreditos e={e} onVerPlanes={onVerPlanes} />
      </div>

      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Lo que aceptaste</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-container)', marginBottom: 18 }}>
        {TEXTO_CONSENTIMIENTO.map((b) => (
          <div key={b.titulo} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={b.icono} size={18} style={{ color: 'var(--primary)', marginTop: 1, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}><strong>{b.titulo}.</strong> {b.texto}</p>
          </div>
        ))}
      </div>

      {error && <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 12 }}>{error}</div>}
      {esOwner ? (
        confirmar ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5 }}>¿Apagar la IA para toda la clínica?</span>
            <Button variant="filled" danger size="sm" onClick={apagar} disabled={apagando}>{apagando ? 'Apagando…' : 'Sí, apagar'}</Button>
            <Button variant="outlined" size="sm" onClick={() => setConfirmar(false)} disabled={apagando}>Cancelar</Button>
          </div>
        ) : (
          <Button variant="outlined" icon="power_settings_new" onClick={() => setConfirmar(true)}>Apagar la IA</Button>
        )
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--on-surface-variant)' }}>Solo el propietario de la clínica puede apagar la IA.</p>
      )}
    </>
  );
}
