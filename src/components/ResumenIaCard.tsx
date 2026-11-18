import { useState } from 'react';
import { Icon, Button, Card } from './index';
import { generarResumenPaciente, sinCupo, type ResumenPacienteResultado } from '../lib/ia';
import { ResumenIaModal } from './ResumenIaModal';
import { useEstadoIA, IaActivar, AvisoCupo } from './IaConsentimiento';

// Tarjeta "Resumen IA" del expediente: borrador previo a la consulta generado por Claude (Haiku).
// No se genera solo: el médico lo pide. La clínica tiene que haber activado la IA (consentimiento del
// propietario, guardado en la base); si no, la tarjeta lo explica y, al propietario, le deja activarla.

export function ResumenIaCard({ expedienteId, clinicaId, esOwner, puedeUsar, puedeGuardarInforme, onInformeGuardado, onVerPdf, onVerInformes }: {
  expedienteId: string; clinicaId: string | null; esOwner: boolean; puedeUsar: boolean;
  /** Guardar el resumen como informe (pide rol clínico y suscripción vigente). */
  puedeGuardarInforme: boolean;
  onInformeGuardado: (informeId: string) => void;
  onVerPdf: (informeId: string) => Promise<void> | void;
  onVerInformes: () => void;
}) {
  const ia = useEstadoIA(clinicaId);
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  const [datos, setDatos] = useState<ResumenPacienteResultado | null>(null);
  const [error, setError] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  const generar = async () => {
    setEstado('cargando'); setError('');
    try {
      setDatos(await generarResumenPaciente(expedienteId));
      setEstado('listo');
      setModalAbierto(true);
    } catch (e) {
      setError((e as Error).message);
      setEstado('error');
    }
  };

  const r = datos?.resumen;
  return (
    <Card variant="filled" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Icon name="auto_awesome" size={22} style={{ color: 'var(--primary)' }} />
        <h3 className="title-m" style={{ flex: 1 }}>Resumen IA</h3>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' }}>Borrador</span>
      </div>

      {ia.cargando && <div className="skel-block" style={{ height: 12, width: '70%', borderRadius: 6 }} />}

      {!ia.cargando && ia.error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
          No se pudo verificar la configuración de IA de la clínica. Si es la primera vez, falta correr el SQL de consentimiento en Supabase.
        </p>
      )}

      {!ia.cargando && !ia.error && !ia.estado?.habilitada && clinicaId && (
        <>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Prepara un resumen previo a la consulta con alertas, evolución y pendientes a partir del expediente.
          </p>
          <IaActivar clinicaId={clinicaId} esOwner={esOwner} onCambio={ia.recargar} compacto />
        </>
      )}

      {!ia.cargando && ia.estado?.habilitada && (estado === 'inicial' || estado === 'error') && (
        <>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Prepara un resumen previo a la consulta con alertas, evolución y pendientes a partir del expediente.
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--on-surface-variant)', margin: '0 0 12px' }}>
            Se envían a un proveedor externo de IA los datos clínicos del expediente, <strong>sin nombre, teléfono ni CURP</strong>. Es un borrador de apoyo: verifícalo antes de usarlo.
          </p>
          {estado === 'error' && (
            <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '10px 12px', margin: '0 0 12px' }}>{error}</div>
          )}
          <Button variant="filled" icon="auto_awesome" onClick={generar} disabled={!puedeUsar || sinCupo(ia.estado)}>
            {estado === 'error' ? 'Reintentar' : 'Generar resumen'}
          </Button>
          {!puedeUsar && <p style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', margin: '10px 0 0' }}>Disponible con una suscripción activa.</p>}
          <AvisoCupo estado={ia.estado} />
        </>
      )}

      {ia.estado?.habilitada && estado === 'cargando' && (
        <div role="status" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--on-surface-variant)', marginBottom: 12 }}>
            <Icon name="progress_activity" size={20} style={{ animation: 'spin 1s linear infinite' }} /> Leyendo el expediente…
          </div>
          {[92, 100, 76, 88].map((w, i) => <div key={i} className="skel-block" style={{ height: 12, width: `${w}%`, borderRadius: 6, marginBottom: 10 }} />)}
        </div>
      )}

      {ia.estado?.habilitada && estado === 'listo' && r && datos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--on-surface)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.resumen}</p>
          {r.alertas.length > 0 && (
            <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-full)', background: 'var(--warning-container)', color: 'var(--on-warning-container)' }}>
              <Icon name="warning" size={16} />{r.alertas.length} {r.alertas.length === 1 ? 'alerta' : 'alertas'}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 180, fontSize: 11.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              Borrador generado por IA a las {new Date(datos.generado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}. Verifícalo antes de usarlo.
            </span>
            <Button variant="filled" size="sm" icon="open_in_full" onClick={() => setModalAbierto(true)}>Ver resumen</Button>
          </div>
        </div>
      )}

      <ResumenIaModal
        open={modalAbierto && estado === 'listo'}
        datos={datos}
        expedienteId={expedienteId}
        puedeActualizar={puedeUsar && !sinCupo(ia.estado)}
        puedeGuardarInforme={puedeGuardarInforme}
        onActualizar={() => { setModalAbierto(false); void generar(); }}
        onCerrar={() => setModalAbierto(false)}
        onInformeGuardado={onInformeGuardado}
        onVerPdf={onVerPdf}
        onVerInformes={() => { setModalAbierto(false); onVerInformes(); }}
      />
    </Card>
  );
}
