import { useState, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import type { ApptUI } from '../lib/consultas';
import {
  fetchCitasDia, fetchCitasSemana, fetchCitasMes,
  createCita, encodeMotivoConTipo,
  cancelarCita, reagendarCita,
  checkConflicto, type ConflictoInfo,
} from '../lib/citas';
import { fetchPacientesSelect, type PacienteSelect } from '../lib/patients';

// ── Constantes de layout ───────────────────────────────────────────────────────
const HOUR_H  = 64;
const H_START = 7;
const H_END   = 23;
const HOURS   = Array.from({ length: H_END - H_START }, (_, i) => i + H_START);

// ── Tipos de cita ──────────────────────────────────────────────────────────────
type TipoCita = 'consulta' | 'seguimiento' | 'urgencia' | 'revision';
const TIPO_META: Record<TipoCita, { text: string; bg: string; label: string }> = {
  consulta:    { text: '#0d5c4e', bg: '#d1ece7', label: 'Consulta'    },
  seguimiento: { text: '#1d4ed8', bg: '#dbeafe', label: 'Seguimiento' },
  urgencia:    { text: '#dc2626', bg: '#fee2e2', label: 'Urgencia'    },
  revision:    { text: '#b45309', bg: '#fef3c7', label: 'Revisión'    },
};
function tipoFromType(type: string): TipoCita {
  const t = type.toLowerCase() as TipoCita;
  return t in TIPO_META ? t : 'consulta';
}

// ── Colores por paciente (hash) ────────────────────────────────────────────────
const APPT_PALETTE = [
  { bg: '#d1ece7', text: '#0d5c4e' },  // teal
  { bg: '#dbeafe', text: '#1d4ed8' },  // blue
  { bg: '#ede9fe', text: '#5b21b6' },  // purple
  { bg: '#e0f2fe', text: '#0369a1' },  // sky
  { bg: '#cffafe', text: '#0e7490' },  // cyan
  { bg: '#ddd6fe', text: '#7c3aed' },  // violet
  { bg: '#e0e7ff', text: '#3730a3' },  // indigo
  { bg: '#d1fae5', text: '#065f46' },  // emerald
  { bg: '#e5e7eb', text: '#374151' },  // cool gray
  { bg: '#f3e8ff', text: '#6d28d9' },  // lilac
  { bg: '#bfdbfe', text: '#1e40af' },  // blue mid
  { bg: '#a5f3fc', text: '#164e63' },  // cyan deep
];
const CANCELLED_COLOR = { bg: '#fee2e2', text: '#b91c1c' };

function apptColor(pacienteId: string): { bg: string; text: string } {
  let h = 5381;
  for (let i = 0; i < pacienteId.length; i++) h = ((h << 5) + h + pacienteId.charCodeAt(i)) & 0xffffffff;
  return APPT_PALETTE[Math.abs(h) % APPT_PALETTE.length];
}
function statusLabel(s: ApptUI['status']): string {
  const map: Record<string, string> = {
    'programada':  'Programada',
    'confirmada':  'Confirmada',
    'sala-espera': 'En sala',
    'en-curso':    'En curso',
    'completada':  'Completada',
    'cancelada':   'Cancelada',
    'pendiente':   'Pendiente',
  };
  return map[s] ?? s;
}

// ── Slots de hora y duraciones ────────────────────────────────────────────────
const TIME_SLOTS: string[] = (() => {
  const s: string[] = [];
  for (let h = 7; h <= 23; h++) {
    s.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 23) s.push(`${String(h).padStart(2, '0')}:30`);
  }
  return s; // 07:00 … 23:00
})();
const DURATIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 h',    value: 60 },
  { label: '1 h 30', value: 90 },
];

// ── Localización ───────────────────────────────────────────────────────────────
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_S    = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getMonday(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
function toMin(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); }
function topPx(hhmm: string): number { return (toMin(hhmm) - H_START * 60) * (HOUR_H / 60); }
function heightPx(start: string, end: string, minH: number): number {
  return Math.max((toMin(end) - toMin(start)) * (HOUR_H / 60) - 2, minH);
}
function localIso(dateStr: string, timeHhmm: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m]     = timeHhmm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m, 0).toISOString();
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function dateLabelEs(iso: string): string {
  return cap(new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #c8e6e0', borderTopColor: '#0d5c4e', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ── Leyenda de tipos ───────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 0 4px' }}>
      {(Object.entries(TIPO_META) as [TipoCita, typeof TIPO_META[TipoCita]][]).map(([key, m]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: m.bg, border: `1.5px solid ${m.text}`, flexShrink: 0 }} />
          {m.label}
        </div>
      ))}
    </div>
  );
}

// ── Campo label reutilizable ───────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  return (
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>
      {children}
    </label>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal de detalle de cita
// ══════════════════════════════════════════════════════════════════════════════
function CitaDetailModal({ appt, open, onClose, onChanged, go, toast, clinicaId, medicoId }: {
  appt: ApptUI | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  go: (name: string, params?: any) => void;
  toast: (m: string) => void;
  clinicaId: string;
  medicoId: string;
}) {
  const [mode,      setMode]      = useState<'view' | 'reagendar' | 'cancelar'>('view');
  const [newDate,   setNewDate]   = useState('');
  const [newStart,  setNewStart]  = useState('');
  const [newEnd,    setNewEnd]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [conflicto, setConflicto] = useState<ConflictoInfo | null>(null);

  useEffect(() => {
    if (open && appt) {
      setMode('view');
      setNewDate(appt.date);
      setNewStart(appt.start);
      setNewEnd(appt.end);
      setError(''); setSaving(false); setConflicto(null);
    }
  }, [open, appt?.id]);

  if (!open || !appt) return null;

  const meta = TIPO_META[tipoFromType(appt.type)];
  const isClosed = appt.status === 'cancelada' || appt.status === 'completada';

  async function handleCancelar() {
    setSaving(true); setError('');
    try {
      await cancelarCita(appt!.id);
      toast('Cita cancelada');
      onChanged(); onClose();
    } catch (e: any) { setError(e.message ?? 'Error al cancelar'); }
    finally { setSaving(false); }
  }

  async function doReagendar() {
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = newEnd.split(':').map(Number);
    const dur = (eh * 60 + em) - (sh * 60 + sm);
    await reagendarCita(appt!.id, localIso(newDate, newStart), dur);
    toast('Cita reagendada');
    onChanged(); onClose();
  }

  async function handleReagendar() {
    if (!newDate || !newStart || !newEnd) { setError('Completa todos los campos.'); return; }
    if (newStart >= newEnd) { setError('La hora fin debe ser después del inicio.'); return; }
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = newEnd.split(':').map(Number);
    const dur = (eh * 60 + em) - (sh * 60 + sm);
    if (dur <= 0) { setError('Duración inválida.'); return; }
    setSaving(true); setError(''); setConflicto(null);
    try {
      const c = await checkConflicto(clinicaId, medicoId, localIso(newDate, newStart), dur, appt!.id);
      if (c) { setConflicto(c); setSaving(false); return; }
      await doReagendar();
    } catch (e: any) { setError(e.message ?? 'Error al reagendar'); }
    finally { setSaving(false); }
  }

  async function handleForceReagendar() {
    setSaving(true); setError('');
    try { await doReagendar(); }
    catch (e: any) { setError(e.message ?? 'Error al reagendar'); }
    finally { setSaving(false); }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden', animation: 'scaleIn .18s cubic-bezier(.2,0,0,1)' }}
      >
        {/* Barra de color del tipo */}
        <div style={{ height: 5, background: meta.text }} />

        {/* Cabecera */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', background: meta.bg, color: meta.text, padding: '2px 9px', borderRadius: 4 }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 11, color: appt.status === 'cancelada' ? '#dc2626' : appt.status === 'completada' ? '#059669' : '#9ca3af', fontWeight: 600 }}>
                  {statusLabel(appt.status)}
                </span>
              </div>
              <div style={{ fontSize: 16.5, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {appt.pacienteName}
              </div>
              <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4 }}>
                {dateLabelEs(appt.date)}&nbsp;·&nbsp;{appt.start} – {appt.end}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</button>
          </div>
          {appt.reason && appt.reason !== 'Cita' && appt.reason !== meta.label && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: '#374151', background: '#f8faf9', borderRadius: 6, padding: '7px 10px', lineHeight: 1.5 }}>
              {appt.reason}
            </div>
          )}
        </div>

        {/* Cuerpo del modal */}
        <div style={{ padding: '16px 22px 20px' }}>

          {/* Vista principal */}
          {mode === 'view' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button
                onClick={() => { go('patient', { id: appt.pacienteId }); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: `1.5px solid ${meta.text}`, borderRadius: 10, background: meta.bg, color: meta.text, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Ver expediente del paciente
              </button>

              {!isClosed && (
                <button
                  onClick={() => setMode('reagendar')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid #e5e9e7', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Reagendar cita
                </button>
              )}

              {!isClosed && (
                <button
                  onClick={() => setMode('cancelar')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid #fecaca', borderRadius: 10, background: '#fff5f5', color: '#dc2626', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  Cancelar cita
                </button>
              )}
            </div>
          )}

          {/* Reagendar */}
          {mode === 'reagendar' && (
            <div>
              <div style={{ marginBottom: 13 }}>
                <FL>Nueva fecha</FL>
                <input type="date" value={newDate} onChange={e => { setNewDate(e.target.value); setError(''); }}
                  style={{ width: '100%', border: '1px solid #e5e9e7', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: '#fafbfa', outline: 'none', fontFamily: 'inherit', color: '#374151', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: error ? 12 : 18 }}>
                <div>
                  <FL>Hora inicio</FL>
                  <input type="time" value={newStart} onChange={e => { setNewStart(e.target.value); setError(''); }}
                    style={{ width: '100%', border: '1px solid #e5e9e7', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: '#fafbfa', outline: 'none', fontFamily: 'inherit', color: '#374151', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <FL>Hora fin</FL>
                  <input type="time" value={newEnd} onChange={e => { setNewEnd(e.target.value); setError(''); }}
                    style={{ width: '100%', border: '1px solid #e5e9e7', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: '#fafbfa', outline: 'none', fontFamily: 'inherit', color: '#374151', boxSizing: 'border-box' }} />
                </div>
              </div>
              {error && <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>{error}</div>}

              {/* Aviso conflicto reagendar */}
              {conflicto && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '11px 13px', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 3 }}>Horario ocupado</div>
                  <div style={{ fontSize: 11.5, color: '#78350f', lineHeight: 1.5, marginBottom: 9 }}>
                    Ya hay una cita con <strong>{conflicto.pacienteName}</strong> de {conflicto.start} a {conflicto.end}.
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => setConflicto(null)} style={{ flex: 1, padding: '7px', border: '1px solid #fcd34d', borderRadius: 6, background: '#fff', color: '#92400e', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                      Cambiar horario
                    </button>
                    <button onClick={handleForceReagendar} disabled={saving} style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 6, background: '#b45309', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Guardando…' : 'Reagendar igual'}
                    </button>
                  </div>
                </div>
              )}

              {!conflicto && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setMode('view'); setError(''); setConflicto(null); }} style={{ flex: 1, padding: '9px', border: '1px solid #e5e9e7', borderRadius: 8, background: '#fff', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Volver
                  </button>
                  <button onClick={handleReagendar} disabled={saving} style={{ flex: 2, padding: '9px', border: 'none', borderRadius: 8, background: '#0d5c4e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Verificando…' : 'Confirmar reagendamiento'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cancelar */}
          {mode === 'cancelar' && (
            <div>
              <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>¿Cancelar esta cita?</div>
                <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
                  La cita quedará marcada como cancelada. El paciente no será notificado automáticamente.
                </div>
              </div>
              {error && <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setMode('view'); setError(''); }} style={{ flex: 1, padding: '9px', border: '1px solid #e5e9e7', borderRadius: 8, background: '#fff', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  No, volver
                </button>
                <button onClick={handleCancelar} disabled={saving} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Cancelando…' : 'Sí, cancelar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Vista Mes
// ══════════════════════════════════════════════════════════════════════════════
function MonthView({ appts, year, month, onDayClick, onApptClick }: {
  appts: ApptUI[]; year: number; month: number;
  onDayClick: (d: Date) => void;
  onApptClick: (a: ApptUI) => void;
}) {
  const today = isoDate(new Date());
  const cells = buildMonthGrid(year, month);

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', overflow: 'hidden' }}>
      {/* Cabecera días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f8faf9', borderBottom: '1px solid #e5e9e7' }}>
        {DAYS_S.map(d => (
          <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {d}
          </div>
        ))}
      </div>
      {/* Celdas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, idx) => {
          const iso         = isoDate(cell);
          const isThisMonth = cell.getMonth() === month;
          const isToday     = iso === today;
          const dayAppts    = appts.filter(a => a.date === iso);
          const visible     = dayAppts.slice(0, 3);
          const extra       = dayAppts.length - 3;
          return (
            <div
              key={idx}
              onClick={() => onDayClick(cell)}
              style={{
                minHeight: 112,
                borderRight: idx % 7 !== 6 ? '1px solid #f3f4f6' : 'none',
                borderBottom: idx < 35     ? '1px solid #f3f4f6' : 'none',
                padding: '8px 6px 6px',
                background: isThisMonth ? '#fff' : '#f9fafb',
                cursor: 'pointer',
                transition: 'background .12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isThisMonth ? '#f8faf9' : '#f3f4f6'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isThisMonth ? '#fff' : '#f9fafb'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <span style={{
                  width: 27, height: 27, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: isToday ? 700 : (isThisMonth ? 500 : 400),
                  color: isToday ? '#fff' : (isThisMonth ? '#374151' : '#c9cdd4'),
                  background: isToday ? '#0d5c4e' : 'transparent',
                }}>
                  {cell.getDate()}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visible.map(a => {
                  const col = a.status === 'cancelada' ? CANCELLED_COLOR : apptColor(a.pacienteId);
                  return (
                    <div
                      key={a.id}
                      onClick={e => { e.stopPropagation(); onApptClick(a); }}
                      title={`${a.start} — ${a.pacienteName}`}
                      style={{
                        fontSize: 10, padding: '2px 5px', borderRadius: 3,
                        background: col.bg, color: col.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        cursor: 'pointer', textDecoration: a.status === 'cancelada' ? 'line-through' : 'none',
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{a.start}</span> {a.pacienteName.split(' ')[0]}
                    </div>
                  );
                })}
                {extra > 0 && (
                  <div style={{ fontSize: 10, color: '#9ca3af', padding: '1px 5px', fontWeight: 600 }}>
                    +{extra} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Vista Semana
// ══════════════════════════════════════════════════════════════════════════════
function WeekView({ appts, monday, onApptClick, onDayClick }: {
  appts: ApptUI[]; monday: Date;
  onApptClick: (a: ApptUI) => void;
  onDayClick: (d: Date) => void;
}) {
  const today    = isoDate(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { d, iso: isoDate(d), label: DAYS_S[i], dayN: d.getDate() };
  });
  const nowMin    = new Date().getHours() * 60 + new Date().getMinutes();
  const timelineH = HOURS.length * HOUR_H;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Cabecera días */}
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', borderBottom: '1px solid #e5e9e7', background: '#f8faf9', flexShrink: 0 }}>
        <div />
        {weekDays.map(wd => (
          <div
            key={wd.iso}
            onClick={() => onDayClick(wd.d)}
            style={{ padding: '12px 8px', textAlign: 'center', borderLeft: '1px solid #e5e9e7', background: wd.iso === today ? '#f0fdf9' : 'transparent', cursor: 'pointer' }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{wd.label}</div>
            <div style={{ width: 32, height: 32, borderRadius: '50%', margin: '4px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: wd.iso === today ? 700 : 500, color: wd.iso === today ? '#fff' : '#374151', background: wd.iso === today ? '#0d5c4e' : 'transparent' }}>
              {wd.dayN}
            </div>
          </div>
        ))}
      </div>
      {/* Timeline */}
      <div style={{ overflowY: 'auto', maxHeight: 540 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', height: timelineH }}>
          {/* Etiquetas de hora */}
          <div style={{ position: 'relative' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_H, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -7, right: 10, fontSize: 11, color: '#c9cdd4', fontWeight: 500 }}>{h}:00</span>
              </div>
            ))}
          </div>
          {/* Columnas de días */}
          {weekDays.map(wd => {
            const dayAppts = appts.filter(a => a.date === wd.iso);
            const isToday  = wd.iso === today;
            return (
              <div key={wd.iso} style={{ position: 'relative', borderLeft: '1px solid #e5e9e7', background: isToday ? '#f8fdf9' : '#fff' }}>
                {HOURS.map(h => <div key={h} style={{ height: HOUR_H, borderTop: '1px solid #f3f4f6' }} />)}
                {/* Línea "ahora" */}
                {isToday && nowMin >= H_START * 60 && nowMin < H_END * 60 && (
                  <div style={{ position: 'absolute', top: (nowMin - H_START * 60) * (HOUR_H / 60), left: 0, right: 0, height: 1.5, background: '#dc2626', zIndex: 4 }} />
                )}
                {/* Bloques de cita */}
                {dayAppts.map(a => {
                  const cancelled = a.status === 'cancelada';
                  const col       = cancelled ? CANCELLED_COLOR : apptColor(a.pacienteId);
                  const top       = topPx(a.start);
                  const h         = heightPx(a.start, a.end, 22);
                  return (
                    <div
                      key={a.id}
                      onClick={() => onApptClick(a)}
                      title={`${a.start}–${a.end} · ${a.pacienteName}`}
                      style={{
                        position: 'absolute', top: top + 1, height: h, left: 3, right: 3,
                        background: col.bg, color: col.text,
                        borderLeft: `3px solid ${col.text}`,
                        borderRadius: 4, padding: '2px 5px', overflow: 'hidden',
                        cursor: 'pointer', lineHeight: 1.3, zIndex: 2,
                        opacity: cancelled ? 0.7 : 1,
                      }}
                    >
                      <div style={{ fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.start}</div>
                      {h >= 28 && (
                        <div style={{ fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: cancelled ? 'line-through' : 'none' }}>
                          {a.pacienteName.split(' ')[0]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Vista Día
// ══════════════════════════════════════════════════════════════════════════════
function DayView({ appts, date, onApptClick, onAddClick }: {
  appts: ApptUI[]; date: Date;
  onApptClick: (a: ApptUI) => void;
  onAddClick: () => void;
}) {
  const iso      = isoDate(date);
  const isToday  = iso === isoDate(new Date());
  const dayName  = cap(date.toLocaleDateString('es-MX', { weekday: 'long' }));
  const nowMin   = new Date().getHours() * 60 + new Date().getMinutes();
  const timelineH = HOURS.length * HOUR_H;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', overflow: 'hidden' }}>
      {/* Cabecera del día */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px', borderBottom: '1px solid #e5e9e7', background: isToday ? '#f0fdf9' : '#f8faf9' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: isToday ? '#fff' : '#374151', background: isToday ? '#0d5c4e' : '#e5e9e7', flexShrink: 0 }}>
          {date.getDate()}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{dayName}</div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 1 }}>
            {appts.filter(a => a.status !== 'cancelada').length} cita{appts.filter(a => a.status !== 'cancelada').length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={onAddClick}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#0d5c4e', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #0d5c4e', cursor: 'pointer' }}
          >
            + Agregar cita
          </button>
        </div>
      </div>
      {/* Timeline */}
      <div style={{ overflowY: 'auto', maxHeight: 560 }}>
        <div style={{ display: 'flex', height: timelineH, background: isToday ? '#f8fdf9' : '#fff' }}>
          {/* Etiquetas hora */}
          <div style={{ width: 64, flexShrink: 0, position: 'relative' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_H, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -7, right: 12, fontSize: 11, color: '#c9cdd4', fontWeight: 500 }}>{h}:00</span>
              </div>
            ))}
          </div>
          {/* Área de eventos */}
          <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid #e5e9e7' }}>
            {HOURS.map(h => <div key={h} style={{ height: HOUR_H, borderTop: '1px solid #f3f4f6' }} />)}
            {/* Línea "ahora" */}
            {isToday && nowMin >= H_START * 60 && nowMin < H_END * 60 && (
              <div style={{ position: 'absolute', top: (nowMin - H_START * 60) * (HOUR_H / 60), left: 0, right: 0, height: 2, background: '#dc2626', zIndex: 5 }}>
                <span style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
              </div>
            )}
            {/* Bloques de cita */}
            {appts.map(a => {
              const cancelled = a.status === 'cancelada';
              const col       = cancelled ? CANCELLED_COLOR : apptColor(a.pacienteId);
              const top       = topPx(a.start);
              const h         = heightPx(a.start, a.end, 46);
              const tipMeta   = TIPO_META[tipoFromType(a.type)];
              return (
                <div
                  key={a.id}
                  onClick={() => onApptClick(a)}
                  style={{
                    position: 'absolute', top: top + 2, height: h - 4, left: 8, right: 8,
                    background: col.bg, color: col.text,
                    borderLeft: `4px solid ${col.text}`,
                    borderRadius: 6, padding: '7px 12px', overflow: 'hidden',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    zIndex: 2, opacity: cancelled ? 0.65 : 1,
                  }}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3 }}>
                    {a.start} – {a.end}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: cancelled ? 'line-through' : 'none' }}>
                    {a.pacienteName}
                  </div>
                  {h >= 80 && (
                    <span style={{ display: 'inline-block', marginTop: 4, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', background: `${col.text}22`, padding: '1px 6px', borderRadius: 3, alignSelf: 'flex-start' }}>
                      {tipMeta.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal rápido de nueva cita
// ══════════════════════════════════════════════════════════════════════════════
function QuickCitaModal({ open, date, onClose, onCreated, toast, clinicaId, medicoId }: {
  open: boolean; date: Date | null;
  onClose: () => void; onCreated: () => void;
  toast: (m: string) => void;
  clinicaId: string; medicoId: string;
}) {
  const [patients,    setPatients]    = useState<PacienteSelect[]>([]);
  const [query,       setQuery]       = useState('');
  const [selected,    setSelected]    = useState<PacienteSelect | null>(null);
  const [dropdown,    setDropdown]    = useState(false);
  const [startTime,   setStartTime]   = useState('');
  const [duracionMin, setDuracionMin] = useState(30);
  const [tipo,        setTipo]        = useState<TipoCita>('consulta');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [conflicto,   setConflicto]   = useState<ConflictoInfo | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !clinicaId) return;
    fetchPacientesSelect(clinicaId).then(setPatients).catch(console.error);
  }, [open, clinicaId]);

  useEffect(() => {
    if (open) {
      setQuery(''); setSelected(null); setDropdown(false);
      setStartTime(''); setDuracionMin(30); setTipo('consulta');
      setError(''); setSaving(false); setConflicto(null);
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open]);

  if (!open || !date) return null;

  const filtered = query.length >= 1
    ? patients.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const dateLabel = cap(date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const iso = isoDate(date);

  async function doCreate() {
    await createCita(clinicaId, medicoId, {
      paciente_id: selected!.id,
      fecha: localIso(iso, startTime),
      duracion_min: duracionMin,
      motivo: encodeMotivoConTipo(tipo, TIPO_META[tipo].label),
      estado: 'programada',
    });
    toast('Cita creada correctamente');
    onCreated(); onClose();
  }

  async function handleCreate() {
    if (!selected)   { setError('Selecciona un paciente.'); return; }
    if (!startTime)  { setError('Selecciona una hora de inicio.'); return; }
    setSaving(true); setError(''); setConflicto(null);
    try {
      const c = await checkConflicto(clinicaId, medicoId, localIso(iso, startTime), duracionMin);
      if (c) { setConflicto(c); setSaving(false); return; }
      await doCreate();
    } catch (e: any) {
      setError(e.message ?? 'Error al crear la cita');
    } finally { setSaving(false); }
  }

  async function handleForceCreate() {
    setSaving(true); setError('');
    try { await doCreate(); }
    catch (e: any) { setError(e.message ?? 'Error al crear la cita'); }
    finally { setSaving(false); }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', animation: 'scaleIn .18s cubic-bezier(.2,0,0,1)' }}
      >
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>Nueva cita</div>
            <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 3 }}>{dateLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0, marginTop: -2 }}>×</button>
        </div>

        {/* Paciente */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <FL>Paciente *</FL>
          {selected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px solid #0d5c4e', borderRadius: 8, padding: '9px 13px', background: '#f6fdf9' }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#0d5c4e' }}>{selected.name}</span>
              <button onClick={() => { setSelected(null); setQuery(''); setDropdown(false); }} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e9e7', borderRadius: 8, background: '#fafbfa' }}>
              <input
                ref={searchRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setDropdown(true); }}
                onFocus={() => setDropdown(true)}
                onBlur={() => setTimeout(() => setDropdown(false), 150)}
                placeholder="Buscar paciente…"
                style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '9px 13px', fontSize: 13.5, fontFamily: 'inherit', color: '#374151', boxSizing: 'border-box' }}
              />
            </div>
          )}
          {dropdown && !selected && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e9e7', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 10, overflow: 'hidden', marginTop: 4 }}>
              {filtered.map(p => (
                <button
                  key={p.id}
                  onMouseDown={e => { e.preventDefault(); setSelected(p); setQuery(p.name); setDropdown(false); setError(''); }}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, color: '#374151', fontFamily: 'inherit' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8faf9'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hora de inicio — chips */}
        <div style={{ marginBottom: 16 }}>
          <FL>Hora de inicio</FL>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TIME_SLOTS.map(slot => {
              const active = slot === startTime;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => { setStartTime(slot); setError(''); setConflicto(null); }}
                  style={{
                    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${active ? '#0d5c4e' : '#e5e9e7'}`,
                    background: active ? '#0d5c4e' : '#fff',
                    color: active ? '#fff' : '#374151',
                    transition: 'all .1s',
                  }}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>

        {/* Duración — chips */}
        <div style={{ marginBottom: 16 }}>
          <FL>Duración</FL>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DURATIONS.map(d => {
              const active = d.value === duracionMin;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuracionMin(d.value)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${active ? '#0d5c4e' : '#e5e9e7'}`,
                    background: active ? '#0d5c4e' : '#fff',
                    color: active ? '#fff' : '#374151',
                    transition: 'all .1s',
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tipo */}
        <div style={{ marginBottom: error ? 12 : 24 }}>
          <FL>Tipo de cita</FL>
          <div style={{ position: 'relative' }}>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as TipoCita)}
              style={{ width: '100%', border: '1px solid #e5e9e7', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: '#fafbfa', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', paddingRight: 36 }}
            >
              <option value="consulta">Consulta</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="revision">Revisión</option>
              <option value="urgencia">Urgencia</option>
            </select>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Aviso de conflicto de horario */}
        {conflicto && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
              Horario ocupado
            </div>
            <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5, marginBottom: 10 }}>
              Ya existe una cita con <strong>{conflicto.pacienteName}</strong> de {conflicto.start} a {conflicto.end} en este horario.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConflicto(null)}
                style={{ flex: 1, padding: '7px', border: '1px solid #fcd34d', borderRadius: 7, background: '#fff', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cambiar horario
              </button>
              <button
                onClick={handleForceCreate}
                disabled={saving}
                style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 7, background: '#b45309', color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Creando…' : 'Agendar de todas formas'}
              </button>
            </div>
          </div>
        )}

        {!conflicto && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #e5e9e7', color: '#6b7280', fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={saving} style={{ background: '#0d5c4e', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Verificando…' : 'Crear cita'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Calendar — componente principal
// ══════════════════════════════════════════════════════════════════════════════
type CalView = 'mes' | 'semana' | 'dia';

export function Calendar({ go, toast, dataVersion = 0 }: {
  go: (name: string, params?: any) => void;
  toast?: (m: string) => void;
  dataVersion?: number;
}) {
  const account   = useAccount();
  const clinicaId = account.clinicaId ?? '';
  const medicoId  = account.userId    ?? '';

  const [view,    setView]    = useState<CalView>('mes');
  const [current, setCurrent] = useState(new Date());
  const [appts,   setAppts]   = useState<ApptUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [localV,  setLocalV]  = useState(0);

  // Modal nueva cita
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalDate, setNewModalDate] = useState<Date | null>(null);

  // Modal detalle
  const [detailOpen,   setDetailOpen]   = useState(false);
  const [detailAppt,   setDetailAppt]   = useState<ApptUI | null>(null);

  const monday = getMonday(current);
  const year   = current.getFullYear();
  const month  = current.getMonth();

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return; }
    setLoading(true);
    const load = view === 'mes'    ? fetchCitasMes(clinicaId, year, month)
               : view === 'semana' ? fetchCitasSemana(clinicaId, current)
               :                     fetchCitasDia(clinicaId, current);
    load
      .then(setAppts)
      .catch(e => console.error('Calendar:', e))
      .finally(() => setLoading(false));
  }, [clinicaId, view, year, month, isoDate(current), dataVersion, localV]);

  // Navegación
  const nav = (n: number) => {
    if (view === 'mes') {
      const d = new Date(current); d.setDate(1); d.setMonth(d.getMonth() + n); setCurrent(d);
    } else if (view === 'semana') {
      setCurrent(addDays(current, n * 7));
    } else {
      setCurrent(addDays(current, n));
    }
  };
  const goToday = () => setCurrent(new Date());

  const navTitle = (): string => {
    if (view === 'mes') return `${MONTHS_ES[month]} ${year}`;
    if (view === 'semana') {
      const end = addDays(monday, 6);
      if (monday.getMonth() === end.getMonth())
        return `${monday.getDate()} – ${end.getDate()} ${MONTHS_ES[monday.getMonth()]} ${year}`;
      return `${monday.getDate()} ${MONTHS_ES[monday.getMonth()].slice(0,3)} – ${end.getDate()} ${MONTHS_ES[end.getMonth()].slice(0,3)} ${end.getFullYear()}`;
    }
    return cap(current.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  };

  const openNew    = (d: Date)     => { setNewModalDate(d); setNewModalOpen(true); };
  const openDetail = (a: ApptUI)   => { setDetailAppt(a);   setDetailOpen(true);  };
  const t          = (msg: string) => toast?.(msg);

  return (
    <div className="page-pad fade-up" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>

        {/* Navegación */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => nav(-1)} aria-label="Anterior" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e9e7', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{ minWidth: 210, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#111827', padding: '0 8px' }}>
            {navTitle()}
          </span>
          <button onClick={() => nav(1)} aria-label="Siguiente" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e9e7', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <button onClick={goToday} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e9e7', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
          Hoy
        </button>

        <div style={{ flex: 1 }} />

        {/* Selector de vista */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3, gap: 2 }}>
          {(['mes', 'semana', 'dia'] as CalView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: view === v ? '#fff' : 'transparent', color: view === v ? '#0d5c4e' : '#6b7280', boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all .15s' }}
            >
              {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Día'}
            </button>
          ))}
        </div>

        <button
          onClick={() => openNew(current)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0d5c4e', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva cita
        </button>
      </div>

      <Legend />

      {/* Contenido de vista */}
      <div style={{ marginTop: 16, flex: 1, minHeight: 0 }}>
        {loading ? <Spinner /> : (
          <>
            {view === 'mes' && (
              <MonthView
                appts={appts} year={year} month={month}
                onDayClick={openNew}
                onApptClick={openDetail}
              />
            )}
            {view === 'semana' && (
              <WeekView
                appts={appts} monday={monday}
                onApptClick={openDetail}
                onDayClick={(d) => { setCurrent(d); setView('dia'); }}
              />
            )}
            {view === 'dia' && (
              <DayView
                appts={appts} date={current}
                onApptClick={openDetail}
                onAddClick={() => openNew(current)}
              />
            )}
          </>
        )}
      </div>

      {/* Modal nueva cita */}
      <QuickCitaModal
        open={newModalOpen}
        date={newModalDate}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => setLocalV(v => v + 1)}
        toast={t}
        clinicaId={clinicaId}
        medicoId={medicoId}
      />

      {/* Modal detalle de cita */}
      <CitaDetailModal
        open={detailOpen}
        appt={detailAppt}
        onClose={() => setDetailOpen(false)}
        onChanged={() => setLocalV(v => v + 1)}
        go={go}
        toast={t}
        clinicaId={clinicaId}
        medicoId={medicoId}
      />
    </div>
  );
}
