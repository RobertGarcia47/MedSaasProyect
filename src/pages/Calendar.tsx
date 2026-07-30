import { useState, useEffect } from 'react';
import { useAccount } from '../context/AccountContext';
import type { ApptUI } from '../lib/consultas';
import {
  fetchCitasDia, fetchCitasSemana, fetchCitasMes,
  createCita, encodeMotivoConTipo,
  cancelarCita, reagendarCita,
  checkConflicto, type ConflictoInfo,
} from '../lib/citas';
import { fetchPacientesSelect, type PacienteSelect } from '../lib/patients';
import { fetchCandidatos, crearOportunidad, actualizarAdelanto } from '../lib/oportunidades';
import { Button, Segmented, useIsMobile } from '../components';
import {
  IH, MONTHS, YEARS_CITA, pad,
  type DateVal, type TimeVal, type ColDef,
  dateValLabel, timeValLabel, dateTimeToISO,
  WheelPickerSheet,
  ModalCard, CloseBtn, ModalBadge,
  Field, FocusInput, FocusSelect, PickerTrigger,
  ModalFooter, CancelBtn, PrimaryBtn,
  useMedicos, OportunidadModal, type OportunidadModalSingle,
} from './Clinical';

// ── Constantes de layout ───────────────────────────────────────────────────────
const HOUR_H  = 64;
const H_START = 7;
const H_END   = 23;
const HOURS   = Array.from({ length: H_END - H_START }, (_, i) => i + H_START);

// ── Tipos de cita ──────────────────────────────────────────────────────────────
type TipoCita = 'consulta' | 'seguimiento' | 'urgencia' | 'revision';
// text  = color fuerte (acento, borde, punto de leyenda)
// bg    = pastel claro (bloques de cita, leyenda)
// header= pastel para rellenar el encabezado del modal de detalle
// ink   = texto oscuro con buen contraste sobre el pastel del header
const TIPO_META: Record<TipoCita, { text: string; bg: string; header: string; ink: string; label: string }> = {
  consulta:    { text: '#0d8a6f', bg: '#d6efe8', header: '#cdeae0', ink: '#0c4a3c', label: 'Consulta'    },
  seguimiento: { text: '#0284c7', bg: '#dbeefc', header: '#d2e9fb', ink: '#075985', label: 'Seguimiento' },
  urgencia:    { text: '#e11d48', bg: '#fde0e4', header: '#fbd3d9', ink: '#9f1239', label: 'Urgencia'    },
  revision:    { text: '#c2700a', bg: '#fdf0cd', header: '#fbe9b6', ink: '#8a4d0a', label: 'Revisión'    },
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
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

// ── Leyenda de tipos ───────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 0 4px' }}>
      {(Object.entries(TIPO_META) as [TipoCita, typeof TIPO_META[TipoCita]][]).map(([key, m]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 500 }}>
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
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>
      {children}
    </label>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Modal de detalle de cita
// ══════════════════════════════════════════════════════════════════════════════
function CitaDetailModal({ appt, open, onClose, onChanged, onCancelled, go, toast, clinicaId, medicoId }: {
  appt: ApptUI | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onCancelled?: (appt: ApptUI) => void;
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
  const [adelanto,  setAdelanto]  = useState(false);
  const [adelantoBusy, setAdelantoBusy] = useState(false);

  useEffect(() => {
    if (open && appt) {
      setMode('view');
      setNewDate(appt.date);
      setNewStart(appt.start);
      setNewEnd(appt.end);
      setError(''); setSaving(false); setConflicto(null);
      setAdelanto(!!appt.aceptaAdelanto); setAdelantoBusy(false);
    }
  }, [open, appt?.id]);

  if (!open || !appt) return null;

  const meta = TIPO_META[tipoFromType(appt.type)];
  const isClosed = appt.status === 'cancelada' || appt.status === 'completada';

  async function handleToggleAdelanto() {
    const nuevo = !adelanto;
    setAdelanto(nuevo); setAdelantoBusy(true);
    try { await actualizarAdelanto(appt!.id, nuevo); }
    catch (e: any) { setAdelanto(!nuevo); toast(e.message ?? 'No se pudo actualizar'); }
    finally { setAdelantoBusy(false); }
  }

  async function handleCancelar() {
    setSaving(true); setError('');
    try {
      await cancelarCita(appt!.id);
      toast('Cita cancelada');
      onCancelled?.(appt!);
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
      // appt.medicoId es el médico REAL de la cita — antes se usaba el medicoId de la cuenta
      // logueada (bug: un asistente o un médico viendo la cita de un colega comprobaba el
      // horario equivocado).
      const c = await checkConflicto(clinicaId, appt!.medicoId ?? medicoId, localIso(newDate, newStart), dur, appt!.id);
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
      style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 400, background: 'var(--surface-container-high)', borderRadius: 16, boxShadow: 'var(--elev-3)', overflow: 'hidden', animation: 'scaleIn .18s cubic-bezier(.2,0,0,1)' }}
      >
        {/* Cabecera coloreada según el tipo de cita (color pastel en todo el encabezado) */}
        <div style={{ background: meta.header, padding: '18px 22px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', background: meta.ink, color: '#fff', padding: '3px 10px', borderRadius: 5 }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: appt.status === 'cancelada' ? 'var(--error)' : appt.status === 'completada' ? 'var(--success)' : meta.ink, opacity: (appt.status === 'cancelada' || appt.status === 'completada') ? 1 : 0.65 }}>
                  {statusLabel(appt.status)}
                </span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: meta.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {appt.pacienteName}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: meta.ink, opacity: 0.78, marginTop: 4 }}>
                {dateLabelEs(appt.date)}&nbsp;·&nbsp;{appt.start} – {appt.end}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: meta.ink, opacity: 0.55, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</button>
          </div>
          {appt.reason && appt.reason !== 'Cita' && appt.reason !== meta.label && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: meta.ink, background: 'rgba(255,255,255,0.55)', borderRadius: 7, padding: '8px 11px', lineHeight: 1.5 }}>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid var(--outline-variant)', borderRadius: 10, background: 'var(--surface)', color: 'var(--on-surface)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
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
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid var(--error)', borderRadius: 10, background: 'var(--error-container)', color: 'var(--on-error-container)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  Cancelar cita
                </button>
              )}

              {!isClosed && (
                <button
                  onClick={handleToggleAdelanto}
                  disabled={adelantoBusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid var(--outline-variant)', borderRadius: 10, background: 'var(--surface)', color: 'var(--on-surface)', fontSize: 13, fontWeight: 600, cursor: adelantoBusy ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: adelantoBusy ? 0.6 : 1 }}
                >
                  <span style={{
                    width: 34, height: 19, borderRadius: 999, flexShrink: 0, position: 'relative',
                    background: adelanto ? 'var(--primary)' : 'var(--outline-variant)', transition: 'background .15s',
                  }}>
                    <span style={{
                      position: 'absolute', top: 2, left: adelanto ? 17 : 2, width: 15, height: 15, borderRadius: '50%',
                      background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                    }} />
                  </span>
                  Avisar si se libera una cita antes
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
                  style={{ width: '100%', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: 'var(--surface-container-highest)', outline: 'none', fontFamily: 'inherit', color: 'var(--on-surface)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: error ? 12 : 18 }}>
                <div>
                  <FL>Hora inicio</FL>
                  <input type="time" value={newStart} onChange={e => { setNewStart(e.target.value); setError(''); }}
                    style={{ width: '100%', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: 'var(--surface-container-highest)', outline: 'none', fontFamily: 'inherit', color: 'var(--on-surface)', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <FL>Hora fin</FL>
                  <input type="time" value={newEnd} onChange={e => { setNewEnd(e.target.value); setError(''); }}
                    style={{ width: '100%', border: '1px solid var(--outline-variant)', borderRadius: 8, padding: '9px 13px', fontSize: 13.5, background: 'var(--surface-container-highest)', outline: 'none', fontFamily: 'inherit', color: 'var(--on-surface)', boxSizing: 'border-box' }} />
                </div>
              </div>
              {error && <div style={{ fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>{error}</div>}

              {/* Aviso conflicto reagendar */}
              {conflicto && (
                <div style={{ background: 'var(--warning-container)', border: '1px solid var(--warning)', borderRadius: 8, padding: '11px 13px', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-warning-container)', marginBottom: 3 }}>Horario ocupado</div>
                  <div style={{ fontSize: 11.5, color: 'var(--on-warning-container)', lineHeight: 1.5, marginBottom: 9 }}>
                    Ya hay una cita con <strong>{conflicto.pacienteName}</strong> de {conflicto.start} a {conflicto.end}.
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={() => setConflicto(null)} style={{ flex: 1, padding: '7px', border: '1px solid var(--warning)', borderRadius: 6, background: 'var(--surface)', color: 'var(--on-warning-container)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                      Cambiar horario
                    </button>
                    <button onClick={handleForceReagendar} disabled={saving} style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 6, background: 'var(--warning)', color: 'var(--on-warning)', fontSize: 11.5, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Guardando…' : 'Reagendar igual'}
                    </button>
                  </div>
                </div>
              )}

              {!conflicto && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setMode('view'); setError(''); setConflicto(null); }} style={{ flex: 1, padding: '9px', border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'var(--surface)', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Volver
                  </button>
                  <button onClick={handleReagendar} disabled={saving} style={{ flex: 2, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--primary)', color: 'var(--on-primary)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Verificando…' : 'Confirmar reagendamiento'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cancelar */}
          {mode === 'cancelar' && (
            <div>
              <div style={{ background: 'var(--error-container)', border: '1px solid var(--error)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--on-error-container)', marginBottom: 4 }}>¿Cancelar esta cita?</div>
                <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
                  La cita quedará marcada como cancelada. El paciente no será notificado automáticamente.
                </div>
              </div>
              {error && <div style={{ fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setMode('view'); setError(''); }} style={{ flex: 1, padding: '9px', border: '1px solid var(--outline-variant)', borderRadius: 8, background: 'var(--surface)', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  No, volver
                </button>
                <button onClick={handleCancelar} disabled={saving} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: 'var(--error)', color: 'var(--on-error)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
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
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--outline-variant)', overflow: 'hidden' }}>
      {/* Cabecera días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)' }}>
        {DAYS_S.map(d => (
          <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                borderRight: idx % 7 !== 6 ? '1px solid var(--outline-variant)' : 'none',
                borderBottom: idx < 35     ? '1px solid var(--outline-variant)' : 'none',
                padding: '8px 6px 6px',
                background: isThisMonth ? 'var(--surface)' : 'var(--surface-container-low)',
                cursor: 'pointer',
                transition: 'background .12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isThisMonth ? 'var(--surface-container-low)' : 'var(--surface-container)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isThisMonth ? 'var(--surface)' : 'var(--surface-container-low)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <span style={{
                  width: isToday ? 40 : 27, height: isToday ? 40 : 27, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isToday ? 18 : 13, fontWeight: isToday ? 700 : (isThisMonth ? 500 : 400),
                  color: isToday ? 'var(--on-primary)' : (isThisMonth ? 'var(--on-surface)' : 'var(--on-surface-variant)'),
                  background: isToday ? 'var(--primary)' : 'transparent', flexShrink: 0,
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
                  <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', padding: '1px 5px', fontWeight: 600 }}>
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
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--outline-variant)', overflow: 'hidden' }}>
      {/* Scroll único para cabecera + malla: comparten ancho y barra de scroll, de modo
          que las líneas verticales de los días siempre quedan alineadas. */}
      <div style={{ overflowY: 'auto', maxHeight: 597 }}>
      {/* Cabecera días (sticky: se mantiene visible al hacer scroll) */}
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', borderBottom: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)', position: 'sticky', top: 0, zIndex: 6 }}>
        <div />
        {weekDays.map(wd => (
          <div
            key={wd.iso}
            onClick={() => onDayClick(wd.d)}
            style={{ padding: '12px 8px', textAlign: 'center', borderLeft: '1px solid var(--outline-variant)', background: wd.iso === today ? 'var(--surface-container)' : 'transparent', cursor: 'pointer' }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{wd.label}</div>
            <div style={{ width: wd.iso === today ? 40 : 32, height: wd.iso === today ? 40 : 32, borderRadius: '50%', margin: '4px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: wd.iso === today ? 18 : 16, fontWeight: wd.iso === today ? 700 : 500, color: wd.iso === today ? 'var(--on-primary)' : 'var(--on-surface)', background: wd.iso === today ? 'var(--primary)' : 'transparent' }}>
              {wd.dayN}
            </div>
          </div>
        ))}
      </div>
      {/* Timeline — misma malla que la cabecera (mismas columnas, mismo scrollbar) */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', height: timelineH }}>
          {/* Etiquetas de hora */}
          <div style={{ position: 'relative' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_H, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -7, right: 10, fontSize: 11, color: 'var(--on-surface-variant)', fontWeight: 500, opacity: .7 }}>{h}:00</span>
              </div>
            ))}
          </div>
          {/* Columnas de días */}
          {weekDays.map(wd => {
            const dayAppts = appts.filter(a => a.date === wd.iso);
            const isToday  = wd.iso === today;
            return (
              <div key={wd.iso} style={{ position: 'relative', borderLeft: '1px solid var(--outline-variant)', background: isToday ? 'var(--surface-container-low)' : 'var(--surface)' }}>
                {HOURS.map(h => <div key={h} style={{ height: HOUR_H, borderTop: '1px solid var(--outline-variant)' }} />)}
                {/* Línea "ahora" */}
                {isToday && nowMin >= H_START * 60 && nowMin < H_END * 60 && (
                  <div style={{ position: 'absolute', top: (nowMin - H_START * 60) * (HOUR_H / 60), left: 0, right: 0, height: 1.5, background: 'var(--error)', zIndex: 4 }} />
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
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--outline-variant)', overflow: 'hidden' }}>
      {/* Cabecera del día */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px', borderBottom: '1px solid var(--outline-variant)', background: isToday ? 'var(--surface-container)' : 'var(--surface-container-low)' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: isToday ? 'var(--on-primary)' : 'var(--on-surface)', background: isToday ? 'var(--primary)' : 'var(--surface-container-highest)', flexShrink: 0 }}>
          {date.getDate()}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)' }}>{dayName}</div>
          <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', marginTop: 1 }}>
            {appts.filter(a => a.status !== 'cancelada').length} cita{appts.filter(a => a.status !== 'cancelada').length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={onAddClick}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--primary)', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--primary)', cursor: 'pointer' }}
          >
            + Agregar cita
          </button>
        </div>
      </div>
      {/* Timeline */}
      <div style={{ overflowY: 'auto', maxHeight: 560 }}>
        <div style={{ display: 'flex', height: timelineH, background: isToday ? 'var(--surface-container-low)' : 'var(--surface)' }}>
          {/* Etiquetas hora */}
          <div style={{ width: 64, flexShrink: 0, position: 'relative' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_H, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -7, right: 12, fontSize: 11, color: 'var(--on-surface-variant)', fontWeight: 500, opacity: .7 }}>{h}:00</span>
              </div>
            ))}
          </div>
          {/* Área de eventos */}
          <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--outline-variant)' }}>
            {HOURS.map(h => <div key={h} style={{ height: HOUR_H, borderTop: '1px solid var(--outline-variant)' }} />)}
            {/* Línea "ahora" */}
            {isToday && nowMin >= H_START * 60 && nowMin < H_END * 60 && (
              <div style={{ position: 'absolute', top: (nowMin - H_START * 60) * (HOUR_H / 60), left: 0, right: 0, height: 2, background: 'var(--error)', zIndex: 5 }}>
                <span style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--error)' }} />
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
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {a.start} – {a.end}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: cancelled ? 'line-through' : 'none' }}>
                      {a.pacienteName}
                    </span>
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
// Modal nueva cita — mismo diseño que AppointmentModal en expediente
// ══════════════════════════════════════════════════════════════════════════════
function QuickCitaModal({ open, date, onClose, onCreated, toast, clinicaId, medicoId: creatorId }: {
  open: boolean; date: Date | null;
  onClose: () => void; onCreated: () => void;
  toast: (m: string) => void;
  clinicaId: string; medicoId: string;
}) {
  const account = useAccount();
  const { medicos } = useMedicos(open, clinicaId);
  const [patients,   setPatients]   = useState<PacienteSelect[]>([]);
  const [pid,        setPid]        = useState('');
  const [medicoSel,  setMedicoSel]  = useState('');
  const [dateVal,    setDateVal]    = useState<DateVal>({ d: 1, m: 0, y: 2026 });
  const [timeVal,    setTimeVal]    = useState<TimeVal>({ h: 9, min: 0, ap: 'AM' });
  const [dur,        setDur]        = useState('30');
  const [tipo,       setTipo]       = useState<TipoCita>('consulta');
  const [adelanto,   setAdelanto]   = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | 'date' | 'time'>(null);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [conflicto,  setConflicto]  = useState<ConflictoInfo | null>(null);

  useEffect(() => {
    if (!open || !clinicaId) return;
    fetchPacientesSelect(clinicaId).then(setPatients).catch(console.error);
  }, [open, clinicaId]);

  useEffect(() => {
    if (open && date) {
      const now = new Date();
      setDateVal({ d: date.getDate(), m: date.getMonth(), y: date.getFullYear() });
      setTimeVal({ h: now.getHours() % 12 || 12, min: 0, ap: now.getHours() >= 12 ? 'PM' : 'AM' });
      setDur('30'); setTipo('consulta'); setAdelanto(false);
      setPickerOpen(null); setSaving(false); setError(''); setConflicto(null);
      // Si el propio usuario es médico se autoselecciona; si no (asistente), vacío.
      setMedicoSel(account.puedeEmitirClinico ? creatorId : '');
    }
  }, [open, date?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !pid && patients.length) setPid(patients[0].id);
  }, [open, patients]);

  useEffect(() => {
    if (open && !medicoSel && medicos.length === 1) setMedicoSel(medicos[0].profileId);
  }, [open, medicos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !date) return null;

  const dateLabel = cap(date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  async function doCreate() {
    const fecha = dateTimeToISO(dateVal, timeVal);
    if (!fecha) throw new Error('Fecha u hora inválida');
    await createCita(clinicaId, medicoSel, creatorId, {
      paciente_id: pid,
      fecha,
      duracion_min: Number(dur) || 30,
      motivo: encodeMotivoConTipo(tipo, TIPO_META[tipo].label),
      estado: 'programada',
      acepta_adelanto: adelanto,
    });
    toast('Cita agendada correctamente');
    onCreated(); onClose();
  }

  async function handleCreate() {
    if (!pid) { setError('Selecciona un paciente.'); return; }
    if (!medicoSel) { setError('Selecciona a qué médico pertenece la cita.'); return; }
    const fecha = dateTimeToISO(dateVal, timeVal);
    if (!fecha) { setError('Fecha u hora inválida.'); return; }
    setSaving(true); setError(''); setConflicto(null);
    try {
      const c = await checkConflicto(clinicaId, medicoSel, fecha, Number(dur) || 30);
      if (c) { setConflicto(c); setSaving(false); return; }
      await doCreate();
    } catch (e: any) { setError(e.message ?? 'Error al crear la cita'); }
    finally { setSaving(false); }
  }

  async function handleForceCreate() {
    setSaving(true); setError('');
    try { await doCreate(); }
    catch (e: any) { setError(e.message ?? 'Error al crear la cita'); }
    finally { setSaving(false); }
  }

  // Wheel picker columns
  const days    = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const years_c = YEARS_CITA.map(String);
  const hours   = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const mins    = Array.from({ length: 60 }, (_, i) => pad(i));

  const dateColumns: ColDef[] = [
    { items: days,    selectedIdx: dateVal.d - 1,             flex: 1,   onChange: (i) => setDateVal(v => ({ ...v, d: i + 1 })) },
    { items: MONTHS,  selectedIdx: dateVal.m,                 flex: 1.1, onChange: (i) => setDateVal(v => ({ ...v, m: i })) },
    { items: years_c, selectedIdx: dateVal.y - YEARS_CITA[0], flex: 1.1, onChange: (i) => setDateVal(v => ({ ...v, y: YEARS_CITA[i] })) },
  ];
  const timeColumns: ColDef[] = [
    { items: hours,       selectedIdx: timeVal.h - 1,                       flex: 1, onChange: (i) => setTimeVal(v => ({ ...v, h: i + 1 })) },
    { items: mins,        selectedIdx: timeVal.min,                          flex: 1, onChange: (i) => setTimeVal(v => ({ ...v, min: i })) },
    { items: ['AM','PM'], selectedIdx: timeVal.ap === 'AM' ? 0 : 1,         flex: 1, onChange: (i) => setTimeVal(v => ({ ...v, ap: i === 0 ? 'AM' : 'PM' })) },
  ];

  return (
    <ModalCard>
      <CloseBtn onClose={onClose} />
      <ModalBadge icon="event_available" title="Nueva cita médica" subtitle={dateLabel} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Paciente */}
        <Field label="Paciente" icon="person" required>
          <FocusSelect value={pid} onChange={e => { setPid(e.target.value); setError(''); setConflicto(null); }}>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FocusSelect>
        </Field>

        {/* Médico — solo se muestra si hay más de uno (o si quien agenda no es médico) */}
        {(medicos.length > 1 || !account.puedeEmitirClinico) && (
          <Field label="Médico" icon="stethoscope" required>
            <FocusSelect value={medicoSel} onChange={e => { setMedicoSel(e.target.value); setError(''); setConflicto(null); }}>
              <option value="" disabled>Selecciona un médico</option>
              {medicos.map(m => <option key={m.profileId} value={m.profileId}>{m.nombre}</option>)}
            </FocusSelect>
          </Field>
        )}

        {/* Fecha / Hora / Duración */}
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr .9fr', gap: 22 }}>
          <div>
            <FL>Fecha</FL>
            <PickerTrigger
              icon="calendar_today"
              value={dateValLabel(dateVal)}
              active={pickerOpen === 'date'}
              onClick={() => setPickerOpen('date')}
            />
          </div>
          <div>
            <FL>Hora</FL>
            <PickerTrigger
              icon="schedule"
              value={timeValLabel(timeVal)}
              active={pickerOpen === 'time'}
              onClick={() => setPickerOpen('time')}
            />
          </div>
          <Field label="Duración (min)" icon="timer">
            <FocusSelect value={dur} onChange={e => setDur(e.target.value)}>
              {['15','30','45','60','90'].map(d => <option key={d} value={d}>{d}</option>)}
            </FocusSelect>
          </Field>
        </div>

        {/* Tipo de cita */}
        <Field label="Tipo de cita" icon="category">
          <FocusSelect value={tipo} onChange={e => setTipo(e.target.value as TipoCita)}>
            <option value="consulta">Consulta</option>
            <option value="seguimiento">Seguimiento</option>
            <option value="revision">Revisión</option>
            <option value="urgencia">Urgencia</option>
          </FocusSelect>
        </Field>

        {/* Adelanto de cita — solo aplica a citas de médico único (misma lógica que el
            picker de médico), el hueco liberado siempre se ofrece dentro del mismo médico. */}
        <button
          type="button"
          onClick={() => setAdelanto(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', border: '1px solid var(--outline-variant)', borderRadius: 10, background: 'var(--surface-container-highest)', color: 'var(--on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
        >
          <span style={{
            width: 34, height: 19, borderRadius: 999, flexShrink: 0, position: 'relative',
            background: adelanto ? 'var(--primary)' : 'var(--outline-variant)', transition: 'background .15s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: adelanto ? 17 : 2, width: 15, height: 15, borderRadius: '50%',
              background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            }} />
          </span>
          Avisar si se libera una cita antes
        </button>

      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', padding: '8px 12px', borderRadius: 8, marginTop: 16 }}>
          {error}
        </div>
      )}

      {/* Conflicto de horario */}
      {conflicto && (
        <div style={{ background: 'var(--warning-container)', border: '1px solid var(--warning)', borderRadius: 10, padding: '13px 16px', marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-warning-container)', marginBottom: 4 }}>Horario ocupado</div>
          <div style={{ fontSize: 12.5, color: 'var(--on-warning-container)', lineHeight: 1.5, marginBottom: 12 }}>
            Ya existe una cita con <strong>{conflicto.pacienteName}</strong> de {conflicto.start} a {conflicto.end}.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConflicto(null)} style={{ flex: 1, padding: '8px', border: '1px solid var(--warning)', borderRadius: 8, background: 'var(--surface)', color: 'var(--on-warning-container)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cambiar horario
            </button>
            <button onClick={handleForceCreate} disabled={saving} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 8, background: 'var(--warning)', color: 'var(--on-warning)', fontSize: 12.5, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
              {saving ? 'Agendando…' : 'Agendar de todas formas'}
            </button>
          </div>
        </div>
      )}

      <ModalFooter>
        <CancelBtn onClick={onClose} />
        {!conflicto && (
          <PrimaryBtn onClick={handleCreate} disabled={saving || !pid || !medicoSel}>
            {saving ? 'Verificando…' : 'Agendar Ahora'}
          </PrimaryBtn>
        )}
      </ModalFooter>

      {/* Wheel picker de fecha/hora */}
      {pickerOpen && (
        <WheelPickerSheet
          key={pickerOpen}
          title={pickerOpen === 'date' ? 'Fecha' : 'Hora'}
          columns={pickerOpen === 'date' ? dateColumns : timeColumns}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </ModalCard>
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

  // En móvil el toggle de vistas solo ofrece Día/Mes — la vista Semana (7 columnas)
  // no cabe legible en ~375px. Si el usuario estaba en Semana y la pantalla se
  // vuelve angosta, cae a Día. Ver nota técnica en MIGRACION_VERCEL_SUPABASE.md
  // ("vista Semana del calendario en móvil") para reactivarla más adelante.
  const isMobile = useIsMobile();
  useEffect(() => { if (isMobile && view === 'semana') setView('dia'); }, [isMobile, view]);

  // Modal nueva cita
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newModalDate, setNewModalDate] = useState<Date | null>(null);

  // Modal detalle
  const [detailOpen,   setDetailOpen]   = useState(false);
  const [detailAppt,   setDetailAppt]   = useState<ApptUI | null>(null);

  // Modal de oportunidad (adelanto de cita) — se abre solo si al cancelar hay ≥1 candidato
  const [oportunidadOpen,   setOportunidadOpen]   = useState(false);
  const [oportunidadSingle, setOportunidadSingle] = useState<OportunidadModalSingle | null>(null);

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

  // Tras cancelar: si hay candidatos en espera del mismo médico para un hueco más cercano,
  // crea la oportunidad y abre el modal ofreciéndola. Si no hay nadie esperando, no pasa nada.
  const handleApptCancelled = async (appt: ApptUI) => {
    if (!appt.medicoId) return;
    const fechaIso = localIso(appt.date, appt.start);
    const dur = Math.max(toMin(appt.end) - toMin(appt.start), 15);
    try {
      const candidatos = await fetchCandidatos(clinicaId, appt.medicoId, fechaIso);
      if (candidatos.length === 0) return;
      const oportunidadId = await crearOportunidad(clinicaId, appt.medicoId, fechaIso, dur, appt.id, medicoId);
      setOportunidadSingle({ oportunidadId, medicoId: appt.medicoId, fecha: fechaIso, duracionMin: dur });
      setOportunidadOpen(true);
    } catch (e) { console.error('oportunidad:', e); }
  };

  return (
    <div className="page-pad fade-up" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* ── Header compartido (misma altura que Dashboard): a la izquierda título + navegador
              de mes; a la derecha el toggle de vista + Nueva cita ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>

        {/* Izquierda: fecha + (Agenda · navegador) */}
        <div>
          <div className="body-m" style={{ color: 'var(--on-surface-variant)', textTransform: 'capitalize' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 2 }}>
            <h1 className="headline-l" style={{ letterSpacing: '-.5px' }}>Agenda</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => nav(-1)} aria-label="Anterior" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span style={{ minWidth: 150, textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--on-surface)', padding: '0 4px' }}>
                  {navTitle()}
                </span>
                <button onClick={() => nav(1)} aria-label="Siguiente" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
              <button onClick={goToday} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', cursor: 'pointer' }}>
                Hoy
              </button>
            </div>
          </div>
        </div>

        {/* Derecha: toggle de vista (segmentado) + Nueva cita */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Segmented
            value={view}
            onChange={(v: string) => setView(v as CalView)}
            options={isMobile ? [
              { value: 'mes', label: 'Mes' },
              { value: 'dia', label: 'Día' },
            ] : [
              { value: 'mes',    label: 'Mes'    },
              { value: 'semana', label: 'Semana' },
              { value: 'dia',    label: 'Día'    },
            ]}
          />
          <Button variant="filled" icon="add" onClick={() => openNew(current)}>Nueva cita</Button>
        </div>
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
        onCancelled={handleApptCancelled}
        go={go}
        toast={t}
        clinicaId={clinicaId}
        medicoId={medicoId}
      />

      {/* Modal de oportunidad — se abre solo si hubo candidatos al cancelar */}
      <OportunidadModal
        open={oportunidadOpen}
        onClose={() => setOportunidadOpen(false)}
        clinicaId={clinicaId}
        currentUserId={medicoId}
        toast={t}
        onResolved={() => setLocalV(v => v + 1)}
        single={oportunidadSingle}
      />
    </div>
  );
}
