import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import { countConsultas, type ApptUI } from '../lib/consultas';
import { fetchCitasDia } from '../lib/citas';
import { countPacientes } from '../lib/patients';
import { Icon, Button, Card, Avatar, StatusPill, IconButton, SectionHeader } from '../components';

// ── Tipo de cita (compatible con ApptUI de consultas.ts) ─────────────────────
const TYPE_META = {
  Consulta: { color: 'var(--primary)', icon: 'stethoscope', bg: 'var(--primary-container)', on: 'var(--on-primary-container)' },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fechaActual(): string {
  return new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function saludo(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
function primerNombre(s: string): string { return s.split(' ')[0] ?? s; }

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, delta, deltaUp, tone = 'primary', onClick }: {
  icon: string; label: string; value: string | number; delta?: string; deltaUp?: boolean;
  tone?: 'primary' | 'tertiary' | 'secondary' | 'warning'; onClick?: () => void;
}) {
  const tones = {
    primary:   ['var(--primary-container)',   'var(--on-primary-container)'],
    tertiary:  ['var(--tertiary-container)',  'var(--on-tertiary-container)'],
    secondary: ['var(--secondary-container)', 'var(--on-secondary-container)'],
    warning:   ['var(--warning-container)',   'var(--on-warning-container)'],
  };
  const [bg, fg] = tones[tone];
  return (
    <Card variant="elevated" onClick={onClick} hover style={{ padding: 20, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={24} fill />
        </div>
        {delta && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: deltaUp ? 'var(--success)' : 'var(--error)' }}>
            <Icon name={deltaUp ? 'trending_up' : 'trending_down'} size={16} />{delta}
          </span>
        )}
      </div>
      <div className="display-s" style={{ fontSize: 32, marginTop: 16, letterSpacing: '-1px' }}>{value}</div>
      <div className="body-m" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>{label}</div>
    </Card>
  );
}

// ── Mini calendario ───────────────────────────────────────────────────────────
function MiniCalendar({ apptDates, onPick }: { apptDates: Set<number>; onPick?: () => void }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayN = now.getDate();
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  const monthLabel = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return (
    <Card variant="outlined" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="title-m" style={{ textTransform: 'capitalize' }}>{monthLabel}</span>
        <div style={{ display: 'flex' }}>
          <IconButton name="chevron_left" size={32} iconSize={20} />
          <IconButton name="chevron_right" size={32} iconSize={20} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
        {days.map((d, i) => <div key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)', padding: '4px 0' }}>{d}</div>)}
        {cells.map((d, i) => (
          <div key={i} onClick={() => d && onPick && onPick()} style={{
            aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', cursor: d ? 'pointer' : 'default', position: 'relative', fontSize: 13, fontWeight: d === todayN ? 700 : 500,
            background: d === todayN ? 'var(--primary)' : 'transparent', color: d === todayN ? 'var(--on-primary)' : 'var(--on-surface)',
          }}>
            {d}
            {d && d !== todayN && apptDates.has(d) && (
              <span style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: '50%', background: 'var(--tertiary)' }} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Fila de cita ──────────────────────────────────────────────────────────────
function AppointmentRow({ appt, onView }: { appt: ApptUI; onView: (id: string) => void }) {
  const meta = TYPE_META.Consulta;
  return (
    <div className="state-layer" onClick={() => onView(appt.pacienteId)} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', position: 'relative',
    }}>
      <div style={{ textAlign: 'center', width: 52, flexShrink: 0 }}>
        <div className="title-m" style={{ fontWeight: 700 }}>{appt.start}</div>
        <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{appt.end}</div>
      </div>
      <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: meta.color }} />
      <Avatar initials={appt.pacienteInitials} color={appt.pacienteColor} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{appt.pacienteName}</div>
        <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name={meta.icon} size={13} style={{ verticalAlign: '-2px' }} />
          <span>{appt.type} · {appt.reason}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusPill status={appt.status} />
        <IconButton name="more_vert" size={36} iconSize={20} />
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ padding: 32, display: 'flex', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard({ go, openModal, dataVersion = 0 }: { go: (name: string, params?: any) => void; openModal: (type: string) => void; dataVersion?: number }) {
  const account = useAccount();
  const clinicaId = account.clinicaId ?? '';

  const [loading,        setLoading]        = useState(true);
  const [appts,          setAppts]          = useState<ApptUI[]>([]);
  const [totalPacientes, setTotalPacientes] = useState<number>(0);
  const [consultasHoy,   setConsultasHoy]   = useState<number>(0);
  const [consultasMes,   setConsultasMes]   = useState<number>(0);

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return; }

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

    Promise.all([
      fetchCitasDia(clinicaId, hoy),
      countPacientes(clinicaId),
      countConsultas(clinicaId, inicioMes, finMes),
    ])
      .then(([apptsDia, totalP, totalMes]) => {
        setAppts(apptsDia);
        setConsultasHoy(apptsDia.length);
        setTotalPacientes(totalP);
        setConsultasMes(totalMes);
      })
      .catch((e) => console.error('Dashboard load error:', e))
      .finally(() => setLoading(false));
  }, [clinicaId, dataVersion]);

  const nombre = account.nombreCompleto;
  const apptDates = new Set(appts.map((a) => Number(a.date.slice(8))));

  // Citas en sala de espera (en-curso o próximas 60 min)
  const enEspera = appts.filter((a) => a.status === 'en-curso' || a.status === 'pendiente').slice(0, 3);

  return (
    <div className="page-pad fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)', textTransform: 'capitalize' }}>{fechaActual()}</div>
          <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginTop: 2 }}>
            {saludo()}, {primerNombre(nombre)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="filled" icon="add" onClick={() => openModal('appointment')}>Nueva cita</Button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatCard icon="event_available" label="Citas hoy"           value={consultasHoy}   tone="primary"   onClick={() => go('calendar')} />
            <StatCard icon="groups"          label="Total pacientes"     value={totalPacientes} tone="tertiary"  onClick={() => go('patients')} />
            <StatCard icon="calendar_month"  label="Consultas este mes"  value={consultasMes}   tone="secondary" onClick={() => go('calendar')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }} className="dash-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
              <Card variant="elevated" style={{ padding: 20 }}>
                <SectionHeader title="Agenda de hoy" icon="today" action={{ label: 'Ver agenda', icon: 'arrow_forward' }} onAction={() => go('calendar')} />
                {appts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--on-surface-variant)' }}>
                    <Icon name="event_available" size={40} style={{ opacity: .4 }} />
                    <div className="body-m" style={{ marginTop: 10 }}>Sin consultas para hoy</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {appts.map((a) => (
                      <AppointmentRow key={a.id} appt={a} onView={(pid) => go('patient', { id: pid })} />
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
              <MiniCalendar apptDates={apptDates} onPick={() => go('calendar')} />

              <Card variant="elevated" style={{ padding: 20 }}>
                <h3 className="title-l" style={{ marginBottom: 14 }}>Accesos rápidos</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['person_add',   'Nuevo paciente', () => openModal('patient')],
                    ['event',        'Agendar cita',   () => openModal('appointment')],
                    ['prescriptions','Crear receta',   () => go('receta')],
                  ].map(([ic, l, fn]) => (
                    <button key={l as string} onClick={fn as () => void} className="state-layer" style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, padding: '14px 14px', borderRadius: 'var(--r-md)',
                      border: '1px solid var(--outline-variant)', background: 'transparent', cursor: 'pointer', position: 'relative', textAlign: 'left',
                    }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={ic as string} size={20} fill />
                      </div>
                      <span className="title-s" style={{ color: 'var(--on-surface)' }}>{l as string}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {enEspera.length > 0 && (
                <Card variant="elevated" style={{ padding: 20 }}>
                  <h3 className="title-l" style={{ marginBottom: 14 }}>Sala de espera</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {enEspera.map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                        <Avatar initials={a.pacienteInitials} color={a.pacienteColor} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="title-s">{a.pacienteName}</div>
                          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{a.start} · {a.room}</div>
                        </div>
                        <StatusPill status={a.status} />
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
