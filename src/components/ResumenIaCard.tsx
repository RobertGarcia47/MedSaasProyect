import { useState } from 'react';
import { Icon, Button, Card } from './index';
import { generarResumenPaciente, type ResumenPacienteResultado } from '../lib/ia';

// Tarjeta "Resumen IA" del expediente: borrador previo a la consulta generado por Claude (Haiku).
// No se genera solo: el médico lo pide, y la primera vez se le explica qué se envía y a quién.
// (El aviso de aquí es provisional para el demo; el consentimiento real va por clínica, en la base.)

const CLAVE_AVISO = 'ia_aviso_resumen_aceptado';
const leerAviso = () => { try { return localStorage.getItem(CLAVE_AVISO) === '1'; } catch { return false; } };

function Seccion({ icono, titulo, tono, children }: { icono: string; titulo: string; tono?: 'warning'; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 'var(--r-md)', padding: '12px 14px',
      background: tono === 'warning' ? 'var(--warning-container)' : 'var(--card-bg)',
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
  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, lineHeight: 1.5 }}>
    {items.map((t, i) => <li key={i}>{t}</li>)}
  </ul>
);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "2026-10-23" → "23 oct 2026". Cualquier otro texto se deja tal cual. */
const fechaLegible = (f: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f);
  return m && MESES[Number(m[2]) - 1] ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : f;
};

function textoPlano(r: ResumenPacienteResultado): string {
  const s = r.resumen;
  const bloque = (t: string, l: string[]) => (l.length ? `\n${t}\n${l.map((x) => `- ${x}`).join('\n')}` : '');
  return [
    'RESUMEN PREVIO A LA CONSULTA (borrador generado por IA — verificar)',
    '', s.resumen,
    bloque('ALERTAS', s.alertas),
    s.evolucion.length ? `\nEVOLUCIÓN\n${s.evolucion.map((e) => `- ${fechaLegible(e.fecha)}: ${e.texto}`).join('\n')}` : '',
    bloque('MEDICACIÓN RECIENTE', s.medicacion),
    bloque('POR REVISAR', s.por_revisar),
  ].join('\n');
}

export function ResumenIaCard({ expedienteId, puedeUsar, toast }: { expedienteId: string; puedeUsar: boolean; toast?: (m: string) => void }) {
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  const [datos, setDatos] = useState<ResumenPacienteResultado | null>(null);
  const [error, setError] = useState('');
  const [avisoVisto, setAvisoVisto] = useState(leerAviso);

  const generar = async () => {
    if (!avisoVisto) { try { localStorage.setItem(CLAVE_AVISO, '1'); } catch { /* sin almacenamiento */ } setAvisoVisto(true); }
    setEstado('cargando'); setError('');
    try {
      setDatos(await generarResumenPaciente(expedienteId));
      setEstado('listo');
    } catch (e) {
      setError((e as Error).message);
      setEstado('error');
    }
  };

  const copiar = async () => {
    if (!datos) return;
    try { await navigator.clipboard.writeText(textoPlano(datos)); toast?.('Resumen copiado'); } catch { toast?.('No se pudo copiar'); }
  };

  const r = datos?.resumen;
  return (
    <Card variant="filled" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Icon name="auto_awesome" size={22} style={{ color: 'var(--primary)' }} />
        <h3 className="title-m" style={{ flex: 1 }}>Resumen IA</h3>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' }}>Borrador</span>
      </div>

      {(estado === 'inicial' || estado === 'error') && (
        <>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Prepara un resumen previo a la consulta con alertas, evolución y pendientes a partir del expediente.
          </p>
          {!avisoVisto && (
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--on-surface-variant)', margin: '0 0 12px', padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-container)' }}>
              Se envían a un proveedor externo de IA los datos clínicos del expediente (edad, sexo, alergias, antecedentes, consultas y recetas recientes),
              <strong> sin nombre, teléfono ni CURP</strong>. Es un borrador de apoyo: verifícalo antes de usarlo.
            </p>
          )}
          {estado === 'error' && (
            <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-error-container)', background: 'var(--error-container)', borderRadius: 'var(--r-sm)', padding: '10px 12px', margin: '0 0 12px' }}>{error}</div>
          )}
          <Button variant="filled" icon="auto_awesome" onClick={generar} disabled={!puedeUsar}>
            {estado === 'error' ? 'Reintentar' : avisoVisto ? 'Generar resumen' : 'Entiendo, generar resumen'}
          </Button>
          {!puedeUsar && <p style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', margin: '10px 0 0' }}>Disponible con una suscripción activa.</p>}
        </>
      )}

      {estado === 'cargando' && (
        <div role="status" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--on-surface-variant)', marginBottom: 12 }}>
            <Icon name="progress_activity" size={20} style={{ animation: 'spin 1s linear infinite' }} /> Leyendo el expediente…
          </div>
          {[92, 100, 76, 88].map((w, i) => <div key={i} className="skel-block" style={{ height: 12, width: `${w}%`, borderRadius: 6, marginBottom: 10 }} />)}
        </div>
      )}

      {estado === 'listo' && r && datos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--on-surface)' }}>{r.resumen}</p>
          {r.alertas.length > 0 && <Seccion icono="warning" titulo="Alertas" tono="warning"><Lista items={r.alertas} /></Seccion>}
          {r.evolucion.length > 0 && (
            <Seccion icono="timeline" titulo="Evolución">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, lineHeight: 1.5 }}>
                {r.evolucion.map((e, i) => <div key={i}><strong>{fechaLegible(e.fecha)}</strong> · {e.texto}</div>)}
              </div>
            </Seccion>
          )}
          {r.medicacion.length > 0 && <Seccion icono="medication" titulo="Medicación reciente"><Lista items={r.medicacion} /></Seccion>}
          {r.por_revisar.length > 0 && <Seccion icono="checklist" titulo="Por revisar"><Lista items={r.por_revisar} /></Seccion>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ flex: 1, minWidth: 180, fontSize: 11.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              Borrador generado por IA ({datos.modelo.replace(/^claude-/, '')}) a las {new Date(datos.generado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} ·
              {' '}{datos.uso.input_tokens + datos.uso.output_tokens} tokens. Verifícalo antes de usarlo.
            </span>
            <Button variant="outlined" size="sm" icon="content_copy" onClick={copiar}>Copiar</Button>
            <Button variant="outlined" size="sm" icon="refresh" onClick={generar} disabled={!puedeUsar}>Actualizar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
