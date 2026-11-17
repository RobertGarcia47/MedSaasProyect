import { useState } from 'react';
import { Icon, Button } from './index';
import { generarIndicacionesPaciente, indicacionesAHtml, sinCupo } from '../lib/ia';
import { useEstadoIA, IaActivar, AvisoCupo } from './IaConsentimiento';

// Barra "Redactar con IA" del campo "Observaciones generales" de la receta. Toma el diagnóstico y los
// medicamentos que el médico lleva en la receta y escribe en el editor un borrador de indicaciones en
// lenguaje sencillo para el paciente. El médico lo edita antes de emitir: nada se envía ni se guarda solo.

export function IndicacionesIa({ clinicaId, esOwner, puedeUsar, resolverExpedienteId, obtenerReceta, onInsertar, toast }: {
  clinicaId: string | null;
  esOwner: boolean;
  puedeUsar: boolean;
  resolverExpedienteId: () => Promise<string>;
  obtenerReceta: () => {
    diagnosticoCodigo: string; observaciones: string;
    medicamentos: Array<{ medicamento: string; dosis?: string | null; frecuencia?: string | null; duracion?: string | null; via?: string | null; instrucciones?: string | null; controlado?: boolean }>;
  };
  /** Recibe el HTML del borrador para ponerlo en el editor. */
  onInsertar: (html: string) => void;
  toast?: (m: string) => void;
}) {
  const ia = useEstadoIA(clinicaId);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(false);

  const redactar = async () => {
    const r = obtenerReceta();
    const medicamentos = r.medicamentos.filter((m) => m.medicamento.trim());
    if (!medicamentos.length) { setError('Agrega al menos un medicamento a la receta para redactar las indicaciones.'); return; }
    setCargando(true); setError('');
    try {
      const expedienteId = await resolverExpedienteId();
      const res = await generarIndicacionesPaciente({ expedienteId, diagnosticoCodigo: r.diagnosticoCodigo, observaciones: r.observaciones, medicamentos });
      onInsertar(indicacionesAHtml(res.indicaciones));
      setHecho(true);
      toast?.('Borrador de indicaciones agregado: revísalo antes de emitir');
    } catch (e) {
      setError((e as Error).message);
    } finally { setCargando(false); }
  };

  if (!clinicaId) return null;
  return (
    <div style={{ padding: '10px 16px', background: 'var(--surface-container)', borderBottom: '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Icon name="auto_awesome" size={20} style={{ color: 'var(--primary)' }} />
        <span style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.45, color: 'var(--on-surface-variant)' }}>
          <strong style={{ color: 'var(--on-surface)' }}>Redactar con IA.</strong> Escribe un borrador en lenguaje sencillo a partir de los medicamentos de la receta. Tú lo revisas y editas.
        </span>
        {ia.estado?.habilitada && (
          <Button variant="outlined" size="sm" icon={hecho ? 'refresh' : 'auto_awesome'} onClick={redactar} disabled={!puedeUsar || cargando || sinCupo(ia.estado)}>
            {cargando ? 'Redactando…' : hecho ? 'Redactar de nuevo' : 'Redactar indicaciones'}
          </Button>
        )}
      </div>
      {cargando && <div role="status" aria-live="polite" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Leyendo la receta…</div>}
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '9px 12px' }}>{error}</div>}
      {hecho && !error && !cargando && <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--on-surface-variant)' }}>Borrador generado por IA. Si vuelves a redactar, se agrega debajo de lo que ya hay: borra lo que no quieras conservar.</div>}
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
  );
}
