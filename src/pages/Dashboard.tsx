import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import { countConsultas, type ApptUI } from '../lib/consultas';
import { fetchCitasDia, fetchCitasMes } from '../lib/citas';
import { countPacientes } from '../lib/patients';
import { Icon, Button, Card, Avatar, StatusPill, IconButton } from '../components';

// ── Tipo de cita — colores (mismo criterio que TIPO_META de Calendar.tsx, mapeado a variables CSS) ──
const TYPE_META: Record<ApptUI['type'], { dot: string; bg: string; on: string; label: string }> = {
  Consulta:    { dot: 'var(--primary)',   bg: 'var(--primary-container)',   on: 'var(--on-primary-container)',   label: 'Consulta' },
  Urgencia:    { dot: 'var(--error)',     bg: 'var(--error-container)',     on: 'var(--on-error-container)',     label: 'Urgencia' },
  Seguimiento: { dot: 'var(--tertiary)',  bg: 'var(--tertiary-container)',  on: 'var(--on-tertiary-container)',  label: 'Seguimiento' },
  Revision:    { dot: 'var(--warning)',   bg: 'var(--warning-container)',   on: 'var(--on-warning-container)',   label: 'Revisión' },
};
function typeMeta(t: ApptUI['type']) { return TYPE_META[t] ?? TYPE_META.Consulta; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const DIAS_S = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

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
function toMin(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); }

// ── Timeline (agenda de hoy) — escala de tiempo ───────────────────────────────
const TL_START = 8;
const TL_END = 18;
const TL_HOUR_PX = 55;
const TL_HEIGHT = (TL_END - TL_START) * TL_HOUR_PX;
const TL_HOURS = Array.from({ length: TL_END - TL_START + 1 }, (_, i) => i + TL_START);

function tlTop(hhmm: string): number {
  const mins = toMin(hhmm) - TL_START * 60;
  return Math.max(0, Math.min(TL_HEIGHT, mins * (TL_HOUR_PX / 60)));
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({ icon, label, value, tone = 'primary', onClick }: {
  icon: string; label: string; value: string | number; tone?: 'primary' | 'tertiary' | 'secondary'; onClick?: () => void;
}) {
  const tones: Record<string, [string, string]> = {
    primary:   ['var(--primary-container)',   'var(--primary)'],
    tertiary:  ['var(--tertiary-container)',  'var(--tertiary)'],
    secondary: ['var(--secondary-container)', 'var(--secondary)'],
  };
  const [bg, fg] = tones[tone] ?? tones.primary;
  return (
    <div onClick={onClick} className={onClick ? 'state-layer' : ''} style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
      background: 'var(--surface)', border: '1px solid var(--outline-variant)',
      borderRadius: 'var(--r-lg)', padding: '12px 16px', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={20} fill />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, letterSpacing: '-1px', color: 'var(--on-surface)' }}>{value}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Timeline de agenda de hoy ──────────────────────────────────────────────────
function TimelineAgenda({ appts, onView }: { appts: ApptUI[]; onView: (id: string) => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const visibles = appts.filter((a) => a.status !== 'cancelada');
  const restantes = visibles.filter((a) => a.status !== 'completada').length;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop = nowMins >= TL_START * 60 && nowMins <= TL_END * 60 ? (nowMins - TL_START * 60) * (TL_HOUR_PX / 60) : null;

  const ordenadas = [...visibles].sort((a, b) => toMin(a.start) - toMin(b.start));
  const huecos: { start: string; end: string }[] = [];
  for (let i = 0; i < ordenadas.length - 1; i++) {
    if (toMin(ordenadas[i + 1].start) - toMin(ordenadas[i].end) >= 30) {
      huecos.push({ start: ordenadas[i].end, end: ordenadas[i + 1].start });
    }
  }

  return (
    <Card variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 className="title-m">Agenda de hoy</h3>
          <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap' }}>{visibles.length} citas · {restantes} restantes</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {(Object.keys(TYPE_META) as ApptUI['type'][]).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--on-surface-variant)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: typeMeta(k).dot, flexShrink: 0 }} />{typeMeta(k).label}
            </div>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px 40px', color: 'var(--on-surface-variant)' }}>
          <Icon name="event_available" size={40} style={{ opacity: .4 }} />
          <div className="body-m" style={{ marginTop: 10 }}>Sin citas para hoy</div>
        </div>
      ) : (
        <div style={{ display: 'flex', padding: '12px 16px 20px 0' }}>
          <div style={{ width: 52, flexShrink: 0, position: 'relative', height: TL_HEIGHT }}>
            {TL_HOURS.map((h) => (
              <div key={h} style={{ position: 'absolute', top: (h - TL_START) * TL_HOUR_PX - 5, right: 10, fontSize: 10, color: 'var(--on-surface-variant)' }}>
                {h}:00
              </div>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative', height: TL_HEIGHT, borderLeft: '1px solid var(--outline-variant)' }}>
            {TL_HOURS.map((h) => (
              <div key={`l${h}`} style={{ position: 'absolute', left: 0, right: 0, top: (h - TL_START) * TL_HOUR_PX, height: 1, background: 'var(--outline-variant)', opacity: .4 }} />
            ))}
            {TL_HOURS.slice(0, -1).map((h) => (
              <div key={`m${h}`} style={{ position: 'absolute', left: 0, right: 0, top: (h - TL_START) * TL_HOUR_PX + TL_HOUR_PX / 2, height: 1, background: 'var(--outline-variant)', opacity: .18 }} />
            ))}

            {nowTop !== null && (
              <div style={{ position: 'absolute', left: -52, right: 0, top: nowTop - 3.5, display: 'flex', alignItems: 'center', zIndex: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--error)', animation: 'blink 1.5s ease-in-out infinite', flexShrink: 0 }} />
                <span style={{ flex: 1, height: 1.5, background: 'var(--error)' }} />
              </div>
            )}

            {huecos.map((h, i) => {
              const top = tlTop(h.start);
              const height = Math.max(tlTop(h.end) - top, 20);
              return (
                <div key={i} style={{
                  position: 'absolute', left: 4, right: 4, top, height,
                  background: 'rgba(0,0,0,.025)', border: '1px dashed var(--outline-variant)', borderRadius: 'var(--r-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 6px',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', opacity: .6 }}>Bloque libre · {h.start}–{h.end}</span>
                </div>
              );
            })}

            {visibles.map((a) => {
              const meta = typeMeta(a.type);
              const top = tlTop(a.start);
              const height = Math.max(tlTop(a.end) - top, 18);
              const enCurso = a.status === 'en-curso';
              const completada = a.status === 'completada';
              return (
                <div key={a.id} onClick={() => onView(a.pacienteId)} className="state-layer" style={{
                  position: 'absolute', left: 4, right: 4, top, height, cursor: 'pointer',
                  borderRadius: 'var(--r-sm)', borderLeft: `3px solid ${meta.dot}`, background: meta.bg,
                  padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden',
                  opacity: completada ? .5 : 1, boxShadow: enCurso ? `0 0 0 1.5px ${meta.dot}` : 'none',
                }}>
                  {enCurso && <Icon name="radio_button_checked" size={11} style={{ color: 'var(--error)', flexShrink: 0 }} />}
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, color: meta.on, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.pacienteName}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', flexShrink: 0, marginLeft: 'auto' }}>{a.start}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Calendario grande ───────────────────────────────────────────────────────
function CalendarBig({ year, month, appts, onPrev, onNext, onPickDay }: {
  year: number; month: number; appts: ApptUI[];
  onPrev: () => void; onNext: () => void; onPickDay: () => void;
}) {
  const hoy = new Date();
  const isCurrentMonth = hoy.getFullYear() === year && hoy.getMonth() === month;
  const todayN = isCurrentMonth ? hoy.getDate() : -1;

  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  const porDia = new Map<number, ApptUI['type'][]>();
  for (const a of appts) {
    if (a.status === 'cancelada') continue;
    const d = Number(a.date.slice(8));
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d)!.push(a.type);
  }
  function topDots(d: number): ApptUI['type'][] {
    const tipos = porDia.get(d);
    if (!tipos || tipos.length === 0) return [];
    const counts = new Map<ApptUI['type'], number>();
    for (const t of tipos) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const totalCitas = appts.filter((a) => a.status !== 'cancelada').length;
  const proximaDia = [...porDia.keys()].filter((d) => !isCurrentMonth || d >= todayN).sort((a, b) => a - b)[0];

  return (
    <Card variant="outlined" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, letterSpacing: '-.4px', color: 'var(--on-surface)', textTransform: 'capitalize' }}>
            {monthLabel}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            {totalCitas} cita{totalCitas === 1 ? '' : 's'} este mes{proximaDia ? ` · próxima el día ${proximaDia}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <IconButton name="chevron_left" onClick={onPrev} style={{ border: '1px solid var(--outline-variant)' }} />
          <IconButton name="chevron_right" onClick={onNext} style={{ border: '1px solid var(--outline-variant)' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 6 }}>
        {DIAS_S.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isToday = d === todayN;
          const hasAppts = porDia.has(d);
          const dow = (first + d - 1) % 7;
          const weekend = dow >= 5;
          const dots = topDots(d);
          return (
            <div key={i} onClick={onPickDay} className="state-layer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 2px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: isToday ? 700 : hasAppts ? 500 : 400,
                background: isToday ? 'var(--primary)' : hasAppts ? 'var(--surface-container-low)' : 'transparent',
                color: isToday ? 'var(--on-primary)' : weekend && !hasAppts ? 'var(--on-surface-variant)' : 'var(--on-surface)',
              }}>{d}</div>
              <div style={{ display: 'flex', gap: 2, marginTop: 3, height: 5 }}>
                {dots.map((t) => (
                  <span key={t} style={{ width: 5, height: 5, borderRadius: '50%', background: typeMeta(t).dot }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--outline-variant)' }}>
        {(Object.keys(TYPE_META) as ApptUI['type'][]).map((k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--on-surface-variant)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: typeMeta(k).dot }} />{typeMeta(k).label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Accesos rápidos ────────────────────────────────────────────────────────
function QuickAccessGrid({ openModal, go }: { openModal: (type: string) => void; go: (name: string, params?: any) => void }) {
  const items: [string, string, () => void][] = [
    ['person_add',      'Nuevo paciente', () => openModal('patient')],
    ['event_available', 'Agendar cita',   () => openModal('appointment')],
    ['description',     'Crear receta',   () => go('receta')],
    ['manage_search',   'Ver expediente', () => go('patients')],
  ];
  return (
    <Card variant="outlined" style={{ padding: '16px 20px' }}>
      <h3 className="title-m" style={{ marginBottom: 14 }}>Accesos rápidos</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {items.map(([ic, label, fn]) => (
          <button key={label} onClick={fn} className="state-layer" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px',
            border: '1px solid var(--outline-variant)', borderRadius: 'var(--r-md)', background: 'transparent',
            cursor: 'pointer', position: 'relative',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={ic} size={20} fill />
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ── Sala de espera ────────────────────────────────────────────────────────
function WaitingRoom({ appts }: { appts: ApptUI[] }) {
  const enEspera = appts.filter((a) => a.status === 'en-curso' || a.status === 'sala-espera' || a.status === 'pendiente');
  if (enEspera.length === 0) return null;
  const visibles = enEspera.slice(0, 4);
  return (
    <Card variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ background: 'var(--warning-container)', padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="chair" size={20} style={{ color: 'var(--warning)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--on-warning-container)' }}>Sala de espera</span>
        </div>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--warning)', color: '#fff', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {enEspera.length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {visibles.map((a, i) => (
          <div key={a.id} style={{
            padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
            borderRight: i % 2 === 0 ? '1px solid var(--outline-variant)' : 'none',
            borderTop: i >= 2 ? '1px solid var(--outline-variant)' : 'none',
          }}>
            <Avatar initials={a.pacienteInitials} color={a.pacienteColor} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title-s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.pacienteName}</div>
              <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{a.room} · {a.start}</div>
            </div>
            <StatusPill status={a.status} />
          </div>
        ))}
      </div>
    </Card>
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

  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [apptsMes, setApptsMes] = useState<ApptUI[]>([]);

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

  useEffect(() => {
    if (!clinicaId) return;
    fetchCitasMes(clinicaId, calYear, calMonth)
      .then(setApptsMes)
      .catch((e) => console.error('Dashboard mes error:', e));
  }, [clinicaId, calYear, calMonth, dataVersion]);

  function prevMonth() { setCalMonth((m) => { if (m === 0) { setCalYear((y) => y - 1); return 11; } return m - 1; }); }
  function nextMonth() { setCalMonth((m) => { if (m === 11) { setCalYear((y) => y + 1); return 0; } return m + 1; }); }

  const nombre = account.nombreCompleto;

  return (
    <div className="page-pad fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)', textTransform: 'capitalize' }}>{fechaActual()}</div>
          <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginTop: 2 }}>
            {saludo()}, {primerNombre(nombre)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outlined" icon="search" onClick={() => go('patients')}>Buscar paciente</Button>
          <Button variant="filled" icon="add" onClick={() => openModal('appointment')}>Nueva cita</Button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatChip icon="event_available" label="Citas hoy"     value={consultasHoy}   tone="primary"   onClick={() => go('calendar')} />
            <StatChip icon="groups"          label="Pacientes"     value={totalPacientes} tone="tertiary"  onClick={() => go('patients')} />
            <StatChip icon="calendar_month"  label="Consultas mes" value={consultasMes}   tone="secondary" onClick={() => go('calendar')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 18 }} className="dash-grid">
            <TimelineAgenda appts={appts} onView={(pid) => go('patient', { id: pid })} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              <CalendarBig year={calYear} month={calMonth} appts={apptsMes} onPrev={prevMonth} onNext={nextMonth} onPickDay={() => go('calendar')} />
              <QuickAccessGrid openModal={openModal} go={go} />
              <WaitingRoom appts={appts} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
