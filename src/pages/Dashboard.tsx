import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import { countConsultas, type ApptUI } from '../lib/consultas';
import { fetchCitasDia, fetchCitasMes, fetchPrimeraCitaIdPorPaciente, fetchConteoCitasPorDia } from '../lib/citas';
import { countPacientes } from '../lib/patients';
import { countOportunidadesAbiertas } from '../lib/oportunidades';
import { Icon, Button, Card, Avatar, StatusPill, IconButton } from '../components';
import { PracticeStats } from '../components/PracticeStats';
import { OportunidadModal, useMedicos } from './Clinical';

// ── Tipo de cita — mismos 4 tonos que TIPO_META de Calendar.tsx (unificado a
//    propósito, antes usaban --tertiary/--warning y no coincidían entre sí).
//    Urgencia se queda en --error/--warning a propósito: fijo, no reacciona
//    al acento — un color de "urgente" no debe cambiar según preferencia.
const TYPE_META: Record<ApptUI['type'], { dot: string; label: string; letra: string }> = {
  Consulta:    { dot: 'var(--primary)',      label: 'Consulta',    letra: 'C' },
  Urgencia:    { dot: 'var(--error)',        label: 'Urgencia',    letra: 'U' },
  Seguimiento: { dot: 'var(--accent-claro)', label: 'Seguimiento', letra: 'S' },
  Revision:    { dot: 'var(--accent-warm)',  label: 'Revisión',    letra: 'R' },
};
function typeMeta(t: ApptUI['type']) { return TYPE_META[t] ?? TYPE_META.Consulta; }

// Amarillo fijo (no reacciona al acento, igual que Urgencia con --error) para
// marcar la PRIMERA cita de un paciente en toda su relación con la clínica —
// no solo la primera del día. Ya NO sustituye el color del tipo (se perdía esa
// información): se combina como una insignia sobre el color de tipo, que sigue
// siendo el fondo del bloque siempre.
const PRIMERA_CITA_COLOR = '#FBBF24';
const PRIMERA_CITA_TEXT  = '#3D2C00';

/** Fondo en degradado (color normal → tenue) en vez de un relleno 100% plano —
 *  mantiene el mismo color por tipo pero menos intenso visualmente. El extremo
 *  intenso queda a la izquierda (donde va el nombre del paciente) para que no
 *  pierda contraste; se va aclarando hacia la derecha (la hora). */
function tipoGradient(color: string): string {
  return `linear-gradient(90deg, ${color} 0%, color-mix(in srgb, ${color} 35%, var(--surface)) 100%)`;
}

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

/** Huecos ≥30min entre citas consecutivas (ya ordenadas por hora de inicio) —
 *  compartido entre el timeline (dibuja los bloques) y la franja de estado del
 *  día (solo necesita el conteo). */
function encontrarHuecos(ordenadas: ApptUI[]): { start: string; end: string }[] {
  const huecos: { start: string; end: string }[] = [];
  for (let i = 0; i < ordenadas.length - 1; i++) {
    if (toMin(ordenadas[i + 1].start) - toMin(ordenadas[i].end) >= 30) {
      huecos.push({ start: ordenadas[i].end, end: ordenadas[i + 1].start });
    }
  }
  return huecos;
}

/** Citas del mismo médico que se traslapan en horario — solo posible si se forzó
 *  el agendado pese al choque ("Agendar de todas formas" en QuickCitaModal). */
function contarConflictos(visibles: ApptUI[]): number {
  const porMedico = new Map<string, ApptUI[]>();
  for (const a of visibles) {
    if (!a.medicoId) continue;
    if (!porMedico.has(a.medicoId)) porMedico.set(a.medicoId, []);
    porMedico.get(a.medicoId)!.push(a);
  }
  let n = 0;
  for (const lista of porMedico.values()) {
    const ord = [...lista].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let i = 0; i < ord.length - 1; i++) {
      if (toMin(ord[i + 1].start) < toMin(ord[i].end)) n++;
    }
  }
  return n;
}

// ── Timeline (agenda de hoy) — escala de tiempo ───────────────────────────────
// El rango visible se auto-ajusta al día real en vez de quedar fijo: por defecto
// 8:00–18:00 (lo típico), pero se extiende si hay una cita antes/después, hasta
// el rango que el modal de Nueva cita permite agendar (07:00–22:30) — antes una
// cita a las 19:00 se aplastaba contra el borde inferior y mostraba mal la hora.
const TL_HOUR_PX = 55;
const TL_DEFAULT_START = 8;
const TL_DEFAULT_END = 18;
const TL_BOOKING_MIN = 7;
const TL_BOOKING_MAX = 23;

function tlTopFor(hhmm: string, start: number, heightPx: number): number {
  const mins = toMin(hhmm) - start * 60;
  return Math.max(0, Math.min(heightPx, mins * (TL_HOUR_PX / 60)));
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
// Bloque lateral (Propuesta 2): panel de color sólido a la izquierda con el
// ícono en blanco; el resto de la tarjeta queda blanca con texto oscuro.
// Propuesta 1 (tarjeta 100% sólida) quedó guardada para más adelante —
// ver [[propuesta-color-tarjetas-solidas]] en memoria.
function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14, marginTop: 5 }}>
      {values.map((v, i) => (
        <span key={i} style={{
          width: 4, borderRadius: 1, height: Math.max(2, (v / max) * 14),
          background: i === values.length - 1 ? tone : 'var(--outline-variant)',
        }} />
      ))}
    </div>
  );
}

function StatChip({ icon, label, value, tone = 'primary', onClick, pulse, delta, spark }: {
  icon: string; label: string; value: string | number; tone?: 'primary' | 'tertiary' | 'secondary' | 'warning'; onClick?: () => void; pulse?: boolean;
  /** ej. "+2" — comparación breve contra el periodo anterior (ayer/mes pasado). */
  delta?: { text: string; positive: boolean };
  /** últimos N días para el mini-gráfico; se omite si hay menos de 2 puntos. */
  spark?: number[];
}) {
  const tones: Record<string, string> = {
    primary:   'var(--primary)',
    tertiary:  'var(--tertiary)',
    secondary: 'var(--secondary)',
    warning:   'var(--warning)',
  };
  const fg = tones[tone] ?? tones.primary;
  return (
    <div onClick={onClick} className={onClick ? 'state-layer' : ''} style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch', position: 'relative',
      background: 'var(--surface)', border: '1px solid var(--outline-variant)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ width: 54, flexShrink: 0, background: fg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} fill />
      </div>
      <div style={{ minWidth: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, letterSpacing: '-1px', color: 'var(--on-surface)' }}>{value}</div>
          {delta && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: delta.positive ? 'var(--success)' : 'var(--on-surface-variant)' }}>{delta.text}</span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 3 }}>{label}</div>
        {spark && spark.length > 1 && <Sparkline values={spark} tone={fg} />}
      </div>
      {pulse && (
        <span style={{ position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: '50%', background: 'var(--error)', animation: 'blink 1.5s ease-in-out infinite' }} />
      )}
    </div>
  );
}

// ── Franja de estado del día ──────────────────────────────────────────────────
// Responde primero "¿está todo bien?" antes de que alguien tenga que armar esa
// respuesta leyendo todo el timeline — huecos libres y choques de horario reales
// (posibles solo si se forzó un agendado pese al conflicto).
function AmbientStrip({ appts, consultasHoy }: { appts: ApptUI[]; consultasHoy: number }) {
  const visibles = appts.filter((a) => a.status !== 'cancelada');
  const ordenadas = [...visibles].sort((a, b) => toMin(a.start) - toMin(b.start));
  const huecos = encontrarHuecos(ordenadas).length;
  const conflictos = contarConflictos(visibles);
  const ok = conflictos === 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--r-lg)',
      padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--on-surface)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--success)' : 'var(--error)', flexShrink: 0 }} />
      <span>Hoy: <strong>{consultasHoy} cita{consultasHoy === 1 ? '' : 's'}</strong></span>
      <span style={{ color: 'var(--outline-variant)' }}>·</span>
      <span>{huecos} hueco{huecos === 1 ? '' : 's'} libre{huecos === 1 ? '' : 's'}</span>
      <span style={{ color: 'var(--outline-variant)' }}>·</span>
      <span style={{ color: ok ? 'var(--on-surface-variant)' : 'var(--error)', fontWeight: ok ? 400 : 600 }}>
        {ok ? 'sin conflictos de horario' : `${conflictos} conflicto${conflictos === 1 ? '' : 's'} de horario`}
      </span>
    </div>
  );
}

// ── Timeline de agenda de hoy ──────────────────────────────────────────────────
function TimelineAgenda({ appts, onView, primerasCitasIds }: { appts: ApptUI[]; onView: (id: string) => void; primerasCitasIds: Set<string> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const visibles = appts.filter((a) => a.status !== 'cancelada');
  const restantes = visibles.filter((a) => a.status !== 'completada').length;

  // Rango visible: por defecto 8–18h, se extiende si hace falta (ver comentario
  // arriba de TL_HOUR_PX), sin pasar del rango que se puede agendar.
  let tlStart = TL_DEFAULT_START;
  let tlEnd = TL_DEFAULT_END;
  for (const a of visibles) {
    const sH = Math.floor(toMin(a.start) / 60);
    const eH = Math.ceil(toMin(a.end) / 60);
    if (sH < tlStart) tlStart = Math.max(TL_BOOKING_MIN, sH);
    if (eH > tlEnd) tlEnd = Math.min(TL_BOOKING_MAX, eH);
  }
  const tlHeight = (tlEnd - tlStart) * TL_HOUR_PX;
  const tlHours = Array.from({ length: tlEnd - tlStart + 1 }, (_, i) => i + tlStart);
  const tlTop = (hhmm: string) => tlTopFor(hhmm, tlStart, tlHeight);

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop = nowMins >= tlStart * 60 && nowMins <= tlEnd * 60 ? (nowMins - tlStart * 60) * (TL_HOUR_PX / 60) : null;

  const ordenadas = [...visibles].sort((a, b) => toMin(a.start) - toMin(b.start));
  const huecos = encontrarHuecos(ordenadas);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--on-surface-variant)' }}>
            <span style={{
              width: 11, height: 11, borderRadius: '50%', background: PRIMERA_CITA_COLOR, color: PRIMERA_CITA_TEXT,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, flexShrink: 0,
            }}>★</span>
            Primera cita
          </div>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px 40px', color: 'var(--on-surface-variant)' }}>
          <Icon name="event_available" size={40} style={{ opacity: .4 }} />
          <div className="body-m" style={{ marginTop: 10 }}>Sin citas para hoy</div>
        </div>
      ) : (
        <div style={{ display: 'flex', padding: '12px 16px 20px 0' }}>
          <div style={{ width: 52, flexShrink: 0, position: 'relative', height: tlHeight }}>
            {tlHours.map((h) => (
              <div key={h} style={{ position: 'absolute', top: (h - tlStart) * TL_HOUR_PX - 5, right: 10, fontSize: 10, color: 'var(--on-surface-variant)' }}>
                {h}:00
              </div>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative', height: tlHeight, borderLeft: '1px solid var(--outline-variant)' }}>
            {tlHours.map((h) => (
              <div key={`l${h}`} style={{ position: 'absolute', left: 0, right: 0, top: (h - tlStart) * TL_HOUR_PX, height: 1, background: 'var(--outline-variant)', opacity: .4 }} />
            ))}
            {tlHours.slice(0, -1).map((h) => (
              <div key={`m${h}`} style={{ position: 'absolute', left: 0, right: 0, top: (h - tlStart) * TL_HOUR_PX + TL_HOUR_PX / 2, height: 1, background: 'var(--outline-variant)', opacity: .18 }} />
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
              const esPrimera = primerasCitasIds.has(a.id);
              const top = tlTop(a.start);
              const height = Math.max(tlTop(a.end) - top, 18);
              const enCurso = a.status === 'en-curso';
              const completada = a.status === 'completada';
              return (
                <div key={a.id} onClick={() => onView(a.pacienteId)} className="state-layer" style={{
                  position: 'absolute', left: 4, right: 4, top, height, cursor: 'pointer',
                  borderRadius: 'var(--r-sm)', background: tipoGradient(meta.dot),
                  padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden',
                  opacity: completada ? .55 : 1, boxShadow: enCurso ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${meta.dot}` : 'none',
                }}>
                  {enCurso && <Icon name="radio_button_checked" size={11} style={{ color: '#fff', flexShrink: 0 }} />}
                  {/* Segundo código visual además del color: inicial del tipo, o estrella si
                      es la primera cita del paciente — el color de tipo nunca se sustituye. */}
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0, fontSize: esPrimera ? 8 : 9, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: esPrimera ? PRIMERA_CITA_COLOR : 'rgba(255,255,255,.28)',
                    color: esPrimera ? PRIMERA_CITA_TEXT : '#fff',
                  }}>
                    {esPrimera ? '★' : meta.letra}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
  onPrev: () => void; onNext: () => void; onPickDay: (day: number) => void;
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
            <div key={i} onClick={() => onPickDay(d)} className="state-layer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 2px', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
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
    </Card>
  );
}

// ── Accesos rápidos ────────────────────────────────────────────────────────
function QuickAccessGrid({ openModal, go, puedePrescribir }: { openModal: (type: string) => void; go: (name: string, params?: any) => void; puedePrescribir: boolean }) {
  const items: [string, string, () => void][] = [
    ['person_add',      'Nuevo paciente', () => openModal('patient')],
    ['event_available', 'Agendar cita',   () => openModal('appointment')],
    ...(puedePrescribir ? [['description', 'Crear receta', () => go('receta')] as [string, string, () => void]] : []),
    ['manage_search',   'Ver expediente', () => go('patients')],
  ];
  return (
    <Card variant="outlined" style={{ padding: '16px 20px' }}>
      <h3 className="title-m" style={{ marginBottom: 14 }}>Accesos rápidos</h3>
      {/* auto-fit en vez de una rejilla fija de 4 — con solo 3 accesos (perfil que
          no prescribe) ya no queda un hueco vacío al final. */}
      <div className="quick-access-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
        {items.map(([ic, label, fn]) => (
          <button key={label} onClick={fn} className="state-layer" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px',
            border: '1px solid var(--outline-variant)', borderRadius: 'var(--r-md)', background: 'transparent',
            cursor: 'pointer', position: 'relative',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  const resto = enEspera.length - visibles.length;
  return (
    <Card variant="outlined" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ background: 'var(--warning-container)', padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="chair" size={20} style={{ color: 'var(--warning)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--on-warning-container)' }}>Sala de espera</span>
        </div>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--warning)', color: 'var(--on-warning)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        {resto > 0 && (
          <div style={{
            gridColumn: '1 / -1', padding: '9px 18px', textAlign: 'center', fontSize: 12, fontWeight: 600,
            color: 'var(--on-surface-variant)', borderTop: '1px solid var(--outline-variant)',
          }}>
            +{resto} más esperando
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Selector de médico (filtro de Agenda de hoy / calendario) ────────────────
// Solo aparece si hay más de un médico — misma convención que ya usan los
// modales de cita para el picker "¿para qué médico?".
function MedicoFilterSelect({ medicos, value, onChange }: {
  medicos: { profileId: string; nombre: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--on-surface)',
          background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 999,
          padding: '9px 32px 9px 14px', cursor: 'pointer',
        }}
      >
        <option value="">Todos los médicos</option>
        {medicos.map((m) => <option key={m.profileId} value={m.profileId}>{m.nombre}</option>)}
      </select>
      <span className="ms" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--on-surface-variant)', pointerEvents: 'none' }}>
        keyboard_arrow_down
      </span>
    </div>
  );
}

// ── Esqueleto de carga ────────────────────────────────────────────────────────
// Reemplaza el spinner de página completa: la silueta del layout final se
// percibe más rápido aunque tarde lo mismo en cargar.
function DashboardSkeleton() {
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel-block" style={{ flex: 1, minWidth: 160, height: 64, borderRadius: 'var(--r-lg)' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }} className="dash-grid">
        <div className="skel-block" style={{ height: 420, borderRadius: 'var(--r-lg)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div className="skel-block" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
          <div className="skel-block" style={{ height: 96, borderRadius: 'var(--r-lg)' }} />
          <div className="skel-block" style={{ height: 110, borderRadius: 'var(--r-lg)' }} />
        </div>
      </div>
    </>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard({ go, openModal, toast, dataVersion = 0 }: { go: (name: string, params?: any) => void; openModal: (type: string) => void; toast?: (m: string) => void; dataVersion?: number }) {
  const account = useAccount();
  const clinicaId = account.clinicaId ?? '';
  // useMedicos ya respeta el scoping de un asistente (solo sus médicos asignados,
  // vía medico_asistentes) en vez de listar a todos los de la clínica — mismo hook
  // que ya usan los modales de "Nueva cita".
  const { medicos } = useMedicos(true, clinicaId);
  const [medicoFiltro, setMedicoFiltro] = useState('');

  const [loading,        setLoading]        = useState(true);
  const [appts,          setAppts]          = useState<ApptUI[]>([]);
  const [primerasCitasIds, setPrimerasCitasIds] = useState<Set<string>>(new Set());
  const [totalPacientes, setTotalPacientes] = useState<number>(0);
  const [consultasHoy,   setConsultasHoy]   = useState<number>(0);
  const [consultasMes,   setConsultasMes]   = useState<number>(0);
  const [consultasMesAnt, setConsultasMesAnt] = useState<number | null>(null);
  const [serieCitas,     setSerieCitas]     = useState<{ date: string; count: number }[]>([]);
  const [oportunidades,  setOportunidades]  = useState<number>(0);
  const [oportModalOpen, setOportModalOpen] = useState(false);
  const [localV,         setLocalV]         = useState(0);

  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [apptsMes, setApptsMes] = useState<ApptUI[]>([]);

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return; }

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const inicioMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const finMesAnt    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59);
    const hace7dias = new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000);

    Promise.all([
      fetchCitasDia(clinicaId, hoy, medicoFiltro || undefined),
      countPacientes(clinicaId),
      countConsultas(clinicaId, inicioMes, finMes),
      countConsultas(clinicaId, inicioMesAnt, finMesAnt),
      countOportunidadesAbiertas(clinicaId),
      fetchConteoCitasPorDia(clinicaId, hace7dias, hoy),
    ])
      .then(([apptsDia, totalP, totalMes, totalMesAnt, totalOport, serie]) => {
        setAppts(apptsDia);
        setConsultasHoy(apptsDia.length);
        setTotalPacientes(totalP);
        setConsultasMes(totalMes);
        setConsultasMesAnt(totalMesAnt);
        setOportunidades(totalOport);
        setSerieCitas(serie);

        const pacienteIds = [...new Set(apptsDia.map((a) => a.pacienteId))];
        fetchPrimeraCitaIdPorPaciente(clinicaId, pacienteIds)
          .then((mapa) => setPrimerasCitasIds(new Set(mapa.values())))
          .catch((e) => console.error('Dashboard primera cita error:', e));
      })
      .catch((e) => console.error('Dashboard load error:', e))
      .finally(() => setLoading(false));
  }, [clinicaId, dataVersion, localV, medicoFiltro]);

  useEffect(() => {
    if (!clinicaId) return;
    fetchCitasMes(clinicaId, calYear, calMonth, medicoFiltro || undefined)
      .then(setApptsMes)
      .catch((e) => console.error('Dashboard mes error:', e));
  }, [clinicaId, calYear, calMonth, dataVersion, medicoFiltro]);

  function prevMonth() { setCalMonth((m) => { if (m === 0) { setCalYear((y) => y - 1); return 11; } return m - 1; }); }
  function nextMonth() { setCalMonth((m) => { if (m === 11) { setCalYear((y) => y + 1); return 0; } return m + 1; }); }

  // Widget de chat GoHighLevel — solo mientras el Dashboard está montado.
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://widgets.leadconnectorhq.com/loader.js';
    script.setAttribute('data-resources-url', 'https://widgets.leadconnectorhq.com/chat-widget/loader.js');
    script.setAttribute('data-widget-id', '6a58fdbac40835bdcd770ad3');
    document.body.appendChild(script);

    return () => {
      script.remove();
      document.querySelectorAll('[src*="leadconnectorhq.com"], iframe[src*="leadconnectorhq"]')
        .forEach((el) => el.remove());
    };
  }, []);

  const nombre = account.nombreCompleto;

  // Tendencia de "Citas hoy" (vs. ayer) y mini-gráfico de los últimos 7 días —
  // se derivan de la misma serie, sin pedirle otra cosa al backend.
  const sparkCitas = serieCitas.map((d) => d.count);
  const deltaCitasHoy = serieCitas.length >= 2
    ? sparkCitas[sparkCitas.length - 1] - sparkCitas[sparkCitas.length - 2]
    : null;
  const deltaCitas = deltaCitasHoy === null ? undefined : { text: `${deltaCitasHoy >= 0 ? '+' : ''}${deltaCitasHoy}`, positive: deltaCitasHoy >= 0 };

  const deltaMesVal = consultasMesAnt === null ? null : consultasMes - consultasMesAnt;
  const deltaMes = deltaMesVal === null ? undefined : { text: `${deltaMesVal >= 0 ? '+' : ''}${deltaMesVal}`, positive: deltaMesVal >= 0 };

  return (
    <div className="page-pad fade-up">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)', textTransform: 'capitalize' }}>{fechaActual()}</div>
          <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginTop: 2 }}>
            {saludo()}, {primerNombre(nombre)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {medicos.length > 1 && <MedicoFilterSelect medicos={medicos} value={medicoFiltro} onChange={setMedicoFiltro} />}
          <Button variant="outlined" icon="search" onClick={() => go('patients')}>Buscar paciente</Button>
          <Button variant="filled" icon="add" onClick={() => openModal('appointment')}>Nueva cita</Button>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <AmbientStrip appts={appts} consultasHoy={consultasHoy} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatChip icon="event_available" label="Citas hoy"     value={consultasHoy}   tone="primary"   onClick={() => go('calendar')} delta={deltaCitas} spark={sparkCitas} />
            <StatChip icon="groups"          label="Pacientes"     value={totalPacientes} tone="tertiary"  onClick={() => go('patients')} />
            <StatChip icon="calendar_month"  label="Consultas mes" value={consultasMes}   tone="secondary" onClick={() => go('calendar')} delta={deltaMes} />
            <StatChip icon="bolt" label="Oportunidades" value={oportunidades} tone="warning" pulse={oportunidades > 0} onClick={() => setOportModalOpen(true)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }} className="dash-grid">
            <TimelineAgenda appts={appts} onView={(pid) => go('patient', { id: pid })} primerasCitasIds={primerasCitasIds} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              <CalendarBig year={calYear} month={calMonth} appts={apptsMes} onPrev={prevMonth} onNext={nextMonth} onPickDay={(day) => {
                const fecha = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                go('calendar', { initialDate: fecha });
              }} />
              <QuickAccessGrid openModal={openModal} go={go} puedePrescribir={account.puedePrescribir} />
              <WaitingRoom appts={appts} />
            </div>
          </div>

          <PracticeStats clinicaId={clinicaId} />
        </>
      )}

      {/* Modal "explorar todas" — abierto desde el StatChip Oportunidades */}
      <OportunidadModal
        open={oportModalOpen}
        onClose={() => setOportModalOpen(false)}
        clinicaId={clinicaId}
        currentUserId={account.userId ?? ''}
        toast={(m) => toast?.(m)}
        onResolved={() => setLocalV((v) => v + 1)}
        single={null}
      />
    </div>
  );
}
