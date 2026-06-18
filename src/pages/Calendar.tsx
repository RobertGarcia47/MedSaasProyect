import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import type { ApptUI } from '../lib/consultas';
import { fetchCitasDia, fetchCitasSemana } from '../lib/citas';
import { Icon, Button, Card, Chip, Segmented, IconButton, Divider, Avatar } from '../components';

const TYPE_META = {
  Consulta: { color: 'var(--primary)', icon: 'stethoscope', bg: 'var(--primary-container)', on: 'var(--on-primary-container)' },
} as const;

// ── Helpers de fecha ──────────────────────────────────────────────────────────
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function getMonday(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}
function labelFecha(d: Date): string {
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ padding: 32, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ── Vista día ─────────────────────────────────────────────────────────────────
function DayView({ appts, go }: { appts: ApptUI[]; go: (name: string, params?: any) => void }) {
  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8–18
  const startMin = 8 * 60;
  const pxPerMin = 1.15;

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <Card variant="elevated" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="scroll-y" style={{ overflowY: 'auto', padding: '8px 0' }}>
        <div style={{ position: 'relative', display: 'flex' }}>
          <div style={{ width: 64, flexShrink: 0 }}>
            {hours.map((h) => (
              <div key={h} style={{ height: 60 * pxPerMin, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, right: 12, fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{h}:00</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--outline-variant)' }}>
            {hours.map((h) => <div key={h} style={{ height: 60 * pxPerMin, borderTop: '1px solid var(--outline-variant)' }} />)}
            {nowMin >= startMin && (
              <div style={{ position: 'absolute', top: (nowMin - startMin) * pxPerMin, left: 0, right: 0, height: 2, background: 'var(--error)', zIndex: 5 }}>
                <span style={{ position: 'absolute', left: -6, top: -5, width: 12, height: 12, borderRadius: '50%', background: 'var(--error)' }} />
              </div>
            )}
            {appts.map((a) => {
              const top    = (toMin(a.start) - startMin) * pxPerMin;
              const height = (toMin(a.end) - toMin(a.start)) * pxPerMin;
              const meta   = TYPE_META.Consulta;
              return (
                <div key={a.id} onClick={() => go('patient', { id: a.pacienteId })} style={{
                  position: 'absolute', top: top + 2, height: height - 4, left: 12, right: 16,
                  background: meta.bg, color: meta.on, borderRadius: 'var(--r-sm)', padding: '8px 12px',
                  borderLeft: `4px solid ${meta.color}`, cursor: 'pointer', overflow: 'hidden',
                  boxShadow: 'var(--elev-1)', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar initials={a.pacienteInitials} color={a.pacienteColor} size={22} />
                    <span className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.start} · {a.pacienteName}</span>
                  </div>
                  {height > 44 && <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>{a.type}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Vista semana ──────────────────────────────────────────────────────────────
function WeekView({ appts, monday, go }: { appts: ApptUI[]; monday: Date; go: (n: string, p?: any) => void }) {
  const hours = Array.from({ length: 11 }, (_, i) => i + 8);
  const startMin = 8 * 60;
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { d, label: SEMANA[i], iso: isoDate(d), dayN: d.getDate() };
  });

  const isToday = (iso: string) => iso === isoDate(new Date());

  return (
    <Card variant="elevated" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7,1fr)', borderBottom: '1px solid var(--outline-variant)' }}>
        <div />
        {weekDays.map((wd) => (
          <div key={wd.iso} style={{ padding: '12px 8px', textAlign: 'center', borderLeft: '1px solid var(--outline-variant)', background: isToday(wd.iso) ? 'var(--primary-container)' : 'transparent' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)' }}>{wd.label}</div>
            <div className="title-l" style={{ marginTop: 2, color: isToday(wd.iso) ? 'var(--primary)' : 'inherit' }}>{wd.dayN}</div>
          </div>
        ))}
      </div>
      <div className="scroll-y" style={{ overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7,1fr)' }}>
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: 56, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -8, right: 10, fontSize: 11, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{h}:00</span>
              </div>
            ))}
          </div>
          {weekDays.map((wd) => {
            const dayAppts = appts.filter((a) => a.date === wd.iso);
            return (
              <div key={wd.iso} style={{ position: 'relative', borderLeft: '1px solid var(--outline-variant)' }}>
                {hours.map((h) => <div key={h} style={{ height: 56, borderTop: '1px solid var(--outline-variant)' }} />)}
                {dayAppts.map((a) => {
                  const top    = (toMin(a.start) - startMin) * (56 / 60);
                  const height = (toMin(a.end)   - toMin(a.start)) * (56 / 60);
                  const meta   = TYPE_META.Consulta;
                  return (
                    <div key={a.id} onClick={() => go('patient', { id: a.pacienteId })} style={{
                      position: 'absolute', top: top + 1, height: height - 2, left: 3, right: 3,
                      background: meta.bg, color: meta.on, borderRadius: 6, padding: '4px 6px', fontSize: 11,
                      borderLeft: `3px solid ${meta.color}`, cursor: 'pointer', overflow: 'hidden', lineHeight: 1.2,
                    }}>
                      <div style={{ fontWeight: 700 }}>{a.start}</div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.pacienteName.split(' ').slice(0, 2).join(' ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
export function Calendar({ go, openModal, dataVersion = 0 }: { go: (name: string, params?: any) => void; openModal: (type: string) => void; dataVersion?: number }) {
  const account   = useAccount();
  const clinicaId = account.clinicaId ?? '';

  const [view,     setView]     = useState<'day' | 'week'>('day');
  const [selected, setSelected] = useState(new Date());
  const [loading,  setLoading]  = useState(true);
  const [appts,    setAppts]    = useState<ApptUI[]>([]);

  const monday = getMonday(selected);

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return; }
    setLoading(true);
    const load = view === 'day'
      ? fetchCitasDia(clinicaId, selected)
      : fetchCitasSemana(clinicaId, selected);
    load
      .then(setAppts)
      .catch((e) => console.error('Calendar load error:', e))
      .finally(() => setLoading(false));
  }, [clinicaId, view, isoDate(selected), dataVersion]);

  const moveDay  = (n: number) => setSelected(addDays(selected, n));
  const moveWeek = (n: number) => setSelected(addDays(selected, n * 7));
  const goToday  = () => setSelected(new Date());

  const countHoy = view === 'day' ? appts.length : appts.filter((a) => a.date === isoDate(new Date())).length;

  return (
    <div className="page-pad fade-up" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 className="headline-l" style={{ letterSpacing: '-.5px' }}>Agenda</h1>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)', textTransform: 'capitalize' }}>
            {view === 'day' ? labelFecha(selected) : `Semana del ${selected.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`}
            {' · '}{loading ? '…' : `${countHoy} cita${countHoy !== 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Segmented value={view} onChange={(v) => setView(v as 'day' | 'week')} options={[{ value: 'day', label: 'Día' }, { value: 'week', label: 'Semana' }]} />
          <Button variant="filled" icon="add" onClick={() => openModal('appointment')}>Nueva cita</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
          <IconButton name="chevron_left" size={36} iconSize={22} onClick={() => view === 'day' ? moveDay(-1) : moveWeek(-1)} />
          <Chip label="Hoy" selected onClick={goToday} />
          <IconButton name="chevron_right" size={36} iconSize={22} onClick={() => view === 'day' ? moveDay(1) : moveWeek(1)} />
        </div>
        <Divider style={{ width: 1, height: 24, alignSelf: 'center' }} />
        <Chip label="Consulta" icon="stethoscope" selected />
      </div>

      {loading ? <Spinner /> : view === 'day'
        ? <DayView appts={appts} go={go} />
        : <WeekView appts={appts} monday={monday} go={go} />
      }
    </div>
  );
}
