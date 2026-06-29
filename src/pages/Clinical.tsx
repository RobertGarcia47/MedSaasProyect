import { useState, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { createPaciente, fetchPacientesSelect } from '../lib/patients';
import { createCita, encodeMotivoConTipo } from '../lib/citas';
import { crearInforme, TIPO_INFORME_LABEL } from '../lib/informes';
import type { TipoInforme } from '../lib/informes';
import { Icon, Button, Card, IconButton, Dialog, TextField, Select } from '../components';
import type { PacienteSelect } from '../lib/patients';
import type { SexoEnum, GrupoSanguineo } from '../lib/types';

/* ═══════════════════════════════════════════════════════════
   WHEEL PICKER — iOS-style scroll-snap drum selector
   ═══════════════════════════════════════════════════════════ */

export const IH = 40; // item height px
export const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
export const YEARS_CITA = Array.from({ length: 12 }, (_, i) => 2024 + i); // 2024–2035
const YEAR_NOW = new Date().getFullYear();
const YEARS_NAC  = Array.from({ length: YEAR_NOW - 1939 }, (_, i) => 1940 + i); // 1940–now

export function pad(n: number) { return String(n).padStart(2, '0'); }

export type DateVal = { d: number; m: number; y: number }; // m 0-indexed (Jan=0)
export type TimeVal = { h: number; min: number; ap: 'AM' | 'PM' };

export const dateValLabel = (v: DateVal) => `${pad(v.d)}/${pad(v.m + 1)}/${v.y}`;
export const timeValLabel = (v: TimeVal) => `${v.h}:${pad(v.min)} ${v.ap}`;

export function dateTimeToISO(d: DateVal, t: TimeVal): string | null {
  let h = t.h;
  if (t.ap === 'PM' && h < 12) h += 12;
  if (t.ap === 'AM' && h === 12) h = 0;
  const dt = new Date(`${d.y}-${pad(d.m + 1)}-${pad(d.d)}T${pad(h)}:${pad(t.min)}`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}
const dateValToISO = (v: DateVal) => `${v.y}-${pad(v.m + 1)}-${pad(v.d)}`;

/* ── WheelCol ─────────────────────────────────────────────── */
interface WheelColProps {
  items: string[];
  selectedIdx: number;
  flex?: number;
  onChange: (idx: number) => void;
}

function WheelCol({ items, selectedIdx, flex = 1, onChange }: WheelColProps) {
  const ref        = useRef<HTMLDivElement>(null);
  const rafRef     = useRef<number>(0);
  const cbRef      = useRef(onChange);
  const smoothRef  = useRef(false); // true while goTo's programmatic scroll is active
  useEffect(() => { cbRef.current = onChange; });

  // Inject webkit scrollbar CSS once globally
  useEffect(() => {
    if (document.getElementById('__wh_style')) return;
    const s = document.createElement('style');
    s.id = '__wh_style';
    s.textContent = '.wh-col::-webkit-scrollbar{display:none}';
    document.head.appendChild(s);
  }, []);

  // Mount-only: init scroll position + attach scroll listener.
  // Caller must remount WheelPickerSheet (via key) when picker opens/switches type.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Disable snap during programmatic scroll to avoid browser fighting us
    node.style.scrollSnapType = 'none';
    node.scrollTop = selectedIdx * IH;
    requestAnimationFrame(() => { if (node) node.style.scrollSnapType = 'y mandatory'; });

    const readPos = () => {
      if (!node || smoothRef.current) return; // skip intermediate events from goTo
      const idx = Math.round(node.scrollTop / IH);
      cbRef.current(Math.max(0, Math.min(items.length - 1, idx)));
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(readPos);
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    // scrollend fires once after ALL scrolling (including snap) is complete
    node.addEventListener('scrollend', readPos, { passive: true });

    return () => {
      node.removeEventListener('scroll', onScroll);
      node.removeEventListener('scrollend', readPos);
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    smoothRef.current = true;
    cbRef.current(clamped);                                          // visual update immediately
    ref.current?.scrollTo({ top: clamped * IH, behavior: 'smooth' });
    setTimeout(() => { smoothRef.current = false; }, 400);          // re-enable listener after animation
  };

  return (
    <div
      ref={ref}
      className="wh-col"
      style={{
        flex, height: '100%', overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        padding: `${IH * 2}px 0`,
        textAlign: 'center',
        scrollbarWidth: 'none',
      } as React.CSSProperties}
    >
      {items.map((label, i) => (
        <div
          key={i}
          onClick={() => goTo(i)}
          style={{
            height: IH, display: 'flex', alignItems: 'center', justifyContent: 'center',
            scrollSnapAlign: 'center', cursor: 'pointer', userSelect: 'none',
            fontSize: 19,
            color: i === selectedIdx ? '#15211D' : '#838E8A',
            fontWeight: i === selectedIdx ? 700 : 500,
            transition: 'color .12s',
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

/* ── WheelPickerSheet ─────────────────────────────────────── */
export interface ColDef {
  items: string[];
  selectedIdx: number;
  flex?: number;
  onChange: (idx: number) => void;
}
interface WheelPickerSheetProps {
  title: string;
  columns: ColDef[];
  onClose: () => void;
}

export function WheelPickerSheet({ title, columns, onClose }: WheelPickerSheetProps) {
  return (
    // Backdrop inside card — click outside sheet closes picker
    <div
      onClick={onClose}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
        background: 'rgba(15,25,23,.22)', borderRadius: 24,
        display: 'flex', alignItems: 'flex-end', zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: '#fff',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -16px 40px rgba(15,30,28,.16)',
          padding: '16px 22px 22px',
        }}
      >
        {/* Sheet header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#25352F' }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', color: '#2F9E8B',
              fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', padding: '6px 8px', borderRadius: 9,
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#EAF6F3'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            Listo
          </button>
        </div>

        {/* Drum wheels */}
        <div style={{ position: 'relative', height: IH * 5, overflow: 'hidden' }}>
          {/* Center selection pill — visual background only (z-index:0, behind columns) */}
          <div style={{
            position: 'absolute', left: 8, right: 8, top: IH * 2,
            height: IH, background: '#EEF1F0', borderRadius: 10, zIndex: 0,
          }} />
          {/* Columns */}
          <div style={{ position: 'relative', display: 'flex', height: '100%', zIndex: 1 }}>
            {columns.map((col, i) => <WheelCol key={i} {...col} />)}
          </div>
          {/* Fade top */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: IH * 2,
            background: 'linear-gradient(#fff, rgba(255,255,255,0))',
            pointerEvents: 'none', zIndex: 2,
          }} />
          {/* Fade bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: IH * 2,
            background: 'linear-gradient(rgba(255,255,255,0), #fff)',
            pointerEvents: 'none', zIndex: 2,
          }} />
          {/* Click-to-confirm overlay — transparent, above columns, captures click on center row */}
          <div
            onClick={onClose}
            title="Confirmar selección"
            style={{
              position: 'absolute', left: 8, right: 8, top: IH * 2,
              height: IH, borderRadius: 10, zIndex: 3,
              cursor: 'pointer', background: 'transparent',
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,.05)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED NEW-STYLE MODAL UI PRIMITIVES
   ═══════════════════════════════════════════════════════════ */

export const FL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#6E7E79', marginBottom: 7,
};
const FI: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none',
  borderBottom: '1.6px solid #E4E9E7', outline: 'none',
  padding: '9px 0 9px 30px', fontSize: 15, color: '#26352F',
  fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color .15s',
};
const FICON: React.CSSProperties = {
  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
  color: '#AAB4B0', fontSize: 19, pointerEvents: 'none', lineHeight: 1,
};

export function Field({ label, icon, required, children }: { label: string; icon: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={FL}>
        {label}{required && <span style={{ color: '#3DAF9B', marginLeft: 2 }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <span className="ms" style={FICON}>{icon}</span>
        {children}
      </div>
    </div>
  );
}

export function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [f, setF] = useState(false);
  return (
    <input
      {...props}
      style={{ ...FI, borderBottomColor: f ? '#3DAF9B' : '#E4E9E7', ...props.style }}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
    />
  );
}

export function FocusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <select
        {...props}
        style={{
          ...FI,
          appearance: 'none',
          color: '#6B7672', paddingRight: 24, cursor: 'pointer',
          borderBottomColor: f ? '#3DAF9B' : '#E4E9E7',
        } as React.CSSProperties}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
      />
      <span className="ms" style={{
        position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
        fontSize: 16, color: '#AAB4B0', pointerEvents: 'none',
      }}>keyboard_arrow_down</span>
    </div>
  );
}

// Clickable trigger that opens the wheel picker
export function PickerTrigger({ icon, value, active, placeholder, onClick }: {
  icon: string; value: string; active?: boolean; placeholder?: string; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={{
        position: 'relative', cursor: 'pointer',
        borderBottom: `1.6px solid ${active ? '#3DAF9B' : '#E4E9E7'}`,
        transition: 'border-color .15s',
      }}
    >
      <span className="ms" style={{ ...FICON, fontSize: 18 }}>{icon}</span>
      <div style={{
        padding: '9px 0 9px 27px', fontSize: 14.5,
        color: value ? '#26352F' : '#AEB6B3',
      }}>
        {value || placeholder || '—'}
      </div>
    </div>
  );
}

// Outer fixed backdrop + inner card (position:relative for picker overlay)
export function ModalCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
      background: 'rgba(22,33,31,.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 28, overflowY: 'auto', animation: 'fadeIn .2s ease',
    }}>
      <div style={{
        position: 'relative', width: 580, maxWidth: '100%',
        background: '#fff', borderRadius: 24,
        boxShadow: '0 30px 70px rgba(15,30,28,.28)',
        padding: '30px 36px 28px',
        animation: 'scaleIn .25s cubic-bezier(.2,0,0,1)',
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
      }}>
        {children}
      </div>
    </div>
  );
}

export function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      style={{
        position: 'absolute', top: 22, right: 22,
        width: 36, height: 36, border: 'none', borderRadius: 10,
        background: 'transparent', color: '#9AA6A2',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#F1F4F3'; b.style.color = '#5A6864'; }}
      onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = '#9AA6A2'; }}
    >
      <span className="ms">close</span>
    </button>
  );
}

export function ModalBadge({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 26 }}>
      <div style={{
        width: 50, height: 50, borderRadius: 15, flexShrink: 0,
        background: 'linear-gradient(145deg,#8FE0CC,#62CDB4)',
        boxShadow: '0 8px 18px rgba(86,201,176,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="ms" style={{ fontSize: 26, color: '#0E4A40' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#25352F', letterSpacing: '-.3px', lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#8A9591', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
      gap: 8, marginTop: 30, paddingTop: 22, borderTop: '1px solid #EEF2F1',
    }}>
      {children}
    </div>
  );
}

export function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 14.5, fontWeight: 600, color: '#5A6864',
        padding: '11px 18px', borderRadius: 11, border: 'none',
        background: 'transparent', cursor: 'pointer',
        transition: 'background .15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F2F5F4'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      Cancelar
    </button>
  );
}

export function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: disabled ? '#B2D8D2' : 'linear-gradient(145deg,#3FB8A2,#2F9E8B)',
        color: '#fff', fontSize: 14.5, fontWeight: 600,
        padding: '12px 22px', borderRadius: 12, border: 'none',
        boxShadow: disabled ? 'none' : '0 10px 22px rgba(47,158,139,.32)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform .15s, box-shadow .15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.transform = 'translateY(-1px)';
          b.style.boxShadow = '0 14px 28px rgba(47,158,139,.42)';
        }
      }}
      onMouseLeave={(e) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.transform = '';
        b.style.boxShadow = disabled ? 'none' : '0 10px 22px rgba(47,158,139,.32)';
      }}
    >
      <span className="ms" style={{ fontSize: 18 }}>check</span>
      {children}
    </button>
  );
}

function PendingNotice({ icon = 'construction', text }: { icon?: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>
      <Icon name={icon} size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <span className="body-m" style={{ lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   OLD-STYLE MODAL HELPERS (used by ReportModal)
   ═══════════════════════════════════════════════════════════ */
function ModalHeader({ icon, title, subtitle, onClose }: { icon: string; title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '24px 24px 12px' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={24} fill />
      </div>
      <div style={{ flex: 1 }}>
        <h2 className="headline-s" style={{ fontSize: 22 }}>{title}</h2>
        {subtitle && <p className="body-m" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      <IconButton name="close" onClick={onClose} />
    </div>
  );
}
function ModalActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 24px 24px', marginTop: 8 }}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════
   DATA HOOK
   ═══════════════════════════════════════════════════════════ */
function usePacientes(open: boolean, clinicaId: string | null) {
  const [pacientes, setPacientes] = useState<PacienteSelect[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !clinicaId) return;
    setLoading(true);
    fetchPacientesSelect(clinicaId)
      .then(setPacientes)
      .catch((e) => console.error('fetchPacientesSelect:', e))
      .finally(() => setLoading(false));
  }, [open, clinicaId]);
  return { pacientes, loading };
}

/* ═══════════════════════════════════════════════════════════
   HUB PAGES: Recetas / Informes
   ═══════════════════════════════════════════════════════════ */
function HubModule({ icon, title, detail, go }: { icon: string; title: string; detail: string; go: (p: string) => void }) {
  return (
    <div className="page-pad fade-up">
      <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginBottom: 20 }}>{title}</h1>
      <Card variant="elevated" style={{ padding: '56px 24px', textAlign: 'center' }}>
        <Icon name={icon} size={56} style={{ opacity: .5, color: 'var(--primary)' }} />
        <h2 className="title-l" style={{ marginTop: 16 }}>Se gestionan desde el expediente</h2>
        <p className="body-m" style={{ color: 'var(--on-surface-variant)', maxWidth: 460, margin: '10px auto 18px', lineHeight: 1.6 }}>{detail}</p>
        <Button variant="filled" icon="groups" onClick={() => go('patients')}>Ir a pacientes</Button>
      </Card>
    </div>
  );
}

export function Prescriptions({ go }: { go: (p: string) => void }) {
  return <HubModule icon="prescriptions" title="Recetas" go={go}
    detail="Las recetas se emiten y consultan dentro del expediente de cada paciente, en la pestaña Recetas." />;
}
export function Reports({ go }: { go: (p: string) => void }) {
  return <HubModule icon="description" title="Informes médicos" go={go}
    detail="Los informes se redactan y consultan dentro del expediente de cada paciente, en la pestaña Informes." />;
}

/* ═══════════════════════════════════════════════════════════
   APPOINTMENT MODAL — rediseño hi-fi + wheel picker fecha/hora
   Backdrop NO cierra; solo × y Cancelar.
   ═══════════════════════════════════════════════════════════ */
interface AppointmentModalProps {
  open: boolean; onClose: () => void;
  prefill?: { patientId?: string };
  toast?: (msg: string) => void; onCreated?: () => void;
}

export function AppointmentModal({ open, onClose, prefill, toast, onCreated }: AppointmentModalProps) {
  const account = useAccount();
  const { pacientes } = usePacientes(open, account.clinicaId);

  const initDate = (): DateVal => { const n = new Date(); return { d: n.getDate(), m: n.getMonth(), y: n.getFullYear() }; };
  const initTime = (): TimeVal => ({ h: 10, min: 0, ap: 'AM' });

  const [pid,         setPid]        = useState('');
  const [dateVal,     setDateVal]    = useState<DateVal>(initDate);
  const [timeVal,     setTimeVal]    = useState<TimeVal>(initTime);
  const [dur,         setDur]        = useState('30');
  const [tipo,        setTipo]       = useState('consulta');
  const [pickerOpen,  setPickerOpen] = useState<null | 'date' | 'time'>(null);
  const [saving,      setSaving]     = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  useEffect(() => {
    if (open) {
      setPid(prefill?.patientId || '');
      setDateVal(initDate()); setTimeVal(initTime());
      setDur('30'); setTipo('consulta'); setPickerOpen(null); setSaving(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !pid && pacientes.length) setPid(pacientes[0].id);
  }, [open, pacientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!pid) { toast?.('Selecciona un paciente'); return; }
    const fecha = dateTimeToISO(dateVal, timeVal);
    if (!fecha) { toast?.('Fecha u hora inválida'); return; }
    setSaving(true);
    try {
      const TIPO_LABELS: Record<string, string> = { consulta: 'Consulta', seguimiento: 'Seguimiento', revision: 'Revisión', urgencia: 'Urgencia' };
      await createCita(account.clinicaId!, account.userId, {
        paciente_id: pid, fecha, duracion_min: Number(dur) || 30,
        motivo: encodeMotivoConTipo(tipo, TIPO_LABELS[tipo] ?? tipo),
      });
      toast?.('Cita agendada correctamente');
      onCreated?.(); onClose();
    } catch (e: any) {
      toast?.('Error al agendar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  if (!open) return null;

  // Wheel picker column definitions
  const days    = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const years_c = YEARS_CITA.map(String);
  const hours   = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const mins    = Array.from({ length: 60 }, (_, i) => pad(i));

  const dateColumns: ColDef[] = [
    { items: days,    selectedIdx: dateVal.d - 1,              flex: 1,   onChange: (i) => setDateVal(v => ({ ...v, d: i + 1 })) },
    { items: MONTHS,  selectedIdx: dateVal.m,                  flex: 1.1, onChange: (i) => setDateVal(v => ({ ...v, m: i })) },
    { items: years_c, selectedIdx: dateVal.y - YEARS_CITA[0],  flex: 1.1, onChange: (i) => setDateVal(v => ({ ...v, y: YEARS_CITA[i] })) },
  ];
  const timeColumns: ColDef[] = [
    { items: hours, selectedIdx: timeVal.h - 1,                            flex: 1, onChange: (i) => setTimeVal(v => ({ ...v, h: i + 1 })) },
    { items: mins,  selectedIdx: timeVal.min,                              flex: 1, onChange: (i) => setTimeVal(v => ({ ...v, min: i })) },
    { items: ['AM','PM'], selectedIdx: timeVal.ap === 'AM' ? 0 : 1,        flex: 1, onChange: (i) => setTimeVal(v => ({ ...v, ap: i === 0 ? 'AM' : 'PM' })) },
  ];

  return (
    <ModalCard>
      <CloseBtn onClose={onClose} />
      <ModalBadge icon="event_available" title="Agendar cita" subtitle="Programa una consulta para un paciente" />

      {!puede ? (
        <PendingNotice text="Para agendar citas necesitas estar registrado como médico (cédula). Captúrala en tu perfil." />
      ) : pacientes.length === 0 ? (
        <PendingNotice icon="group_off" text="No hay pacientes registrados aún. Crea un paciente antes de agendar una cita." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Paciente */}
          <Field label="Paciente" icon="person" required>
            <FocusSelect value={pid} onChange={(e) => setPid(e.target.value)}>
              {pacientes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FocusSelect>
          </Field>

          {/* Fecha / Hora / Duración */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr .9fr', gap: 22 }}>
            <div>
              <label style={FL}>Fecha</label>
              <PickerTrigger
                icon="calendar_today"
                value={dateValLabel(dateVal)}
                active={pickerOpen === 'date'}
                onClick={() => setPickerOpen('date')}
              />
            </div>
            <div>
              <label style={FL}>Hora</label>
              <PickerTrigger
                icon="schedule"
                value={timeValLabel(timeVal)}
                active={pickerOpen === 'time'}
                onClick={() => setPickerOpen('time')}
              />
            </div>
            <Field label="Duración (min)" icon="timer">
              <FocusSelect value={dur} onChange={(e) => setDur(e.target.value)}>
                {['15','30','45','60'].map((d) => <option key={d} value={d}>{d}</option>)}
              </FocusSelect>
            </Field>
          </div>

          {/* Tipo de cita */}
          <Field label="Tipo de cita" icon="category">
            <FocusSelect value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="consulta">Consulta</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="revision">Revisión</option>
              <option value="urgencia">Urgencia</option>
            </FocusSelect>
          </Field>
        </div>
      )}

      <ModalFooter>
        <CancelBtn onClick={onClose} />
        {puede && pacientes.length > 0 && (
          <PrimaryBtn onClick={guardar} disabled={saving || !pid}>
            {saving ? 'Agendando…' : 'Agendar cita'}
          </PrimaryBtn>
        )}
      </ModalFooter>

      {/* Wheel picker — remount via key when type switches */}
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

/* ═══════════════════════════════════════════════════════════
   REPORT MODAL — sin rediseño (usa Dialog)
   ═══════════════════════════════════════════════════════════ */
interface ReportModalProps {
  open: boolean; onClose: () => void;
  prefill?: { patientId?: string };
  toast?: (msg: string) => void; onCreated?: () => void;
}

export function ReportModal({ open, onClose, prefill, toast, onCreated }: ReportModalProps) {
  const account = useAccount();
  const { pacientes } = usePacientes(open, account.clinicaId);

  const [pid,    setPid]  = useState('');
  const [tipo,   setTipo] = useState<TipoInforme>('nota_evolucion');
  const [titulo, setTit]  = useState('');
  const [cuerpo, setCue]  = useState('');
  const [saving, setSaving] = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;
  const expedienteId = pacientes.find((p) => p.id === pid)?.expediente_id ?? null;

  useEffect(() => {
    if (open) { setPid(prefill?.patientId || ''); setTipo('nota_evolucion'); setTit(''); setCue(''); setSaving(false); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && !pid && pacientes.length) setPid(pacientes[0].id); }, [open, pacientes]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!expedienteId) { toast?.('El paciente no tiene expediente válido'); return; }
    if (!titulo.trim()) { toast?.('El título es obligatorio'); return; }
    setSaving(true);
    try {
      await crearInforme(expedienteId, { tipo, titulo, cuerpo });
      toast?.('Informe guardado correctamente');
      onCreated?.(); onClose();
    } catch (e: any) {
      toast?.('Error al guardar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} width={640}>
      <ModalHeader icon="description" title="Nuevo informe médico" subtitle="Redacta una nota clínica" onClose={onClose} />
      {!puede ? (
        <div style={{ padding: '8px 24px' }}><PendingNotice text="Para redactar informes necesitas estar registrado como médico (cédula). Captúrala en tu perfil." /></div>
      ) : pacientes.length === 0 ? (
        <div style={{ padding: '8px 24px' }}><PendingNotice icon="group_off" text="No hay pacientes registrados aún." /></div>
      ) : (
        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Select label="Paciente" icon="person" value={pid} onChange={setPid}
              options={pacientes.map((p) => ({ value: p.id, label: p.name }))} />
            <Select label="Tipo" icon="category" value={tipo} onChange={setTipo}
              options={Object.entries(TIPO_INFORME_LABEL).map(([value, label]) => ({ value, label: label as string }))} />
          </div>
          <TextField label="Título" icon="title" value={titulo} onChange={setTit} required />
          <TextField label="Contenido (cifrado)" icon="notes" value={cuerpo} onChange={setCue} multiline rows={6} placeholder="Subjetivo, objetivo, análisis y plan…" />
        </div>
      )}
      <ModalActions>
        <Button variant="text" onClick={onClose}>Cancelar</Button>
        {puede && pacientes.length > 0 && (
          <Button variant="filled" icon="check" onClick={guardar} disabled={saving || !titulo.trim()}>
            {saving ? 'Guardando…' : 'Guardar informe'}
          </Button>
        )}
      </ModalActions>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════
   PATIENT MODAL — rediseño hi-fi + wheel picker fecha nac.
   Backdrop NO cierra; solo × y Cancelar.
   ═══════════════════════════════════════════════════════════ */
interface PatientModalProps {
  open: boolean; onClose: () => void;
  toast?: (msg: string) => void; onCreated?: () => void;
}

export function PatientModal({ open, onClose, toast, onCreated }: PatientModalProps) {
  const account = useAccount();

  const [nombre,       setNombre]      = useState('');
  const [apPaterno,    setApPaterno]   = useState('');
  const [apMaterno,    setApMaterno]   = useState('');
  const [dateNacVal,   setDateNacVal]  = useState<DateVal>({ d: 1, m: 0, y: 1990 });
  const [dateNacSet,   setDateNacSet]  = useState(false);   // true once user picks a date
  const [pickerNacOpen, setPickerNacOpen] = useState(false);
  const [sexo,         setSexo]        = useState('');
  const [grupo,        setGrupo]       = useState('');
  const [telefono,     setTelefono]    = useState('');
  const [email,        setEmail]       = useState('');
  const [curp,         setCurp]        = useState('');
  const [domicilio,    setDomicilio]   = useState('');
  const [municipio,    setMunicipio]   = useState('');
  const [estado,       setEstado]      = useState('');
  const [nss,          setNss]         = useState('');
  const [rfc,          setRfc]         = useState('');
  const [saving,       setSaving]      = useState(false);

  useEffect(() => {
    if (open) {
      setNombre(''); setApPaterno(''); setApMaterno('');
      setDateNacVal({ d: 1, m: 0, y: 1990 }); setDateNacSet(false); setPickerNacOpen(false);
      setSexo(''); setGrupo(''); setTelefono(''); setEmail(''); setCurp('');
      setDomicilio(''); setMunicipio(''); setEstado(''); setNss(''); setRfc('');
      setSaving(false);
    }
  }, [open]);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  const guardar = async () => {
    if (!nombre.trim()) { toast?.('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      await createPaciente(account.clinicaId!, account.userId, {
        nombre, apellido_paterno: apPaterno, apellido_materno: apMaterno,
        fecha_nacimiento: dateNacSet ? dateValToISO(dateNacVal) : null,
        sexo: (sexo as SexoEnum) || null,
        grupo_sanguineo: (grupo as GrupoSanguineo) || null,
        telefono, email, curp,
        domicilio, municipio, estado, nss, rfc,
      });
      toast?.('Paciente registrado correctamente');
      onCreated?.(); onClose();
    } catch (e: any) {
      toast?.('Error al registrar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  if (!open) return null;

  // Date-of-birth wheel columns (1940–now)
  const days    = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const years_n = YEARS_NAC.map(String);
  const nacColumns: ColDef[] = [
    { items: days,    selectedIdx: dateNacVal.d - 1,                    flex: 1,   onChange: (i) => setDateNacVal(v => ({ ...v, d: i + 1 })) },
    { items: MONTHS,  selectedIdx: dateNacVal.m,                        flex: 1.1, onChange: (i) => setDateNacVal(v => ({ ...v, m: i })) },
    { items: years_n, selectedIdx: dateNacVal.y - YEARS_NAC[0],         flex: 1.1, onChange: (i) => setDateNacVal(v => ({ ...v, y: YEARS_NAC[i] })) },
  ];

  return (
    <ModalCard>
      <CloseBtn onClose={onClose} />
      <ModalBadge icon="person_add" title="Nuevo paciente" subtitle="Registra un expediente clínico" />

      {!puede ? (
        <PendingNotice text="Para dar de alta pacientes necesitas estar registrado como médico (cédula). Captúrala en tu perfil para habilitar el alta." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Nombre */}
          <Field label="Nombre(s)" icon="badge" required>
            <FocusInput value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. María Fernanda" />
          </Field>

          {/* Apellidos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Field label="Apellido paterno" icon="person">
              <FocusInput value={apPaterno} onChange={(e) => setApPaterno(e.target.value)} placeholder="Apellido paterno" />
            </Field>
            <Field label="Apellido materno" icon="person">
              <FocusInput value={apMaterno} onChange={(e) => setApMaterno(e.target.value)} placeholder="Apellido materno" />
            </Field>
          </div>

          {/* Fecha de nacimiento (wheel) + Sexo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <label style={FL}>Fecha de nacimiento</label>
              <PickerTrigger
                icon="calendar_today"
                value={dateNacSet ? dateValLabel(dateNacVal) : ''}
                active={pickerNacOpen}
                placeholder="Sin especificar"
                onClick={() => setPickerNacOpen(true)}
              />
            </div>
            <Field label="Sexo" icon="wc">
              <FocusSelect value={sexo} onChange={(e) => setSexo(e.target.value)}>
                <option value="">Sin especificar</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="otro">Otro</option>
              </FocusSelect>
            </Field>
          </div>

          {/* Grupo sanguíneo + Teléfono */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Field label="Grupo sanguíneo" icon="water_drop">
              <FocusSelect value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                <option value="">Sin especificar</option>
                {['O+','O-','A+','A-','B+','B-','AB+','AB-'].map((g) => <option key={g} value={g}>{g}</option>)}
                <option value="desconocido">Desconocido</option>
              </FocusSelect>
            </Field>
            <Field label="Teléfono" icon="call">
              <FocusInput type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="10 dígitos" maxLength={10} />
            </Field>
          </div>

          {/* Correo */}
          <Field label="Correo electrónico" icon="mail">
            <FocusInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          </Field>

          {/* CURP */}
          <Field label="CURP" icon="fingerprint">
            <FocusInput
              value={curp}
              onChange={(e) => setCurp(e.target.value.toUpperCase())}
              placeholder="18 caracteres"
              maxLength={18}
              style={{ letterSpacing: '.5px', textTransform: 'uppercase' }}
            />
          </Field>

          {/* Domicilio */}
          <Field label="Domicilio (calle y número)" icon="home">
            <FocusInput value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="Ej. Av. Juárez 123, Col. Centro" />
          </Field>

          {/* Municipio + Estado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Field label="Municipio / Alcaldía" icon="location_city">
              <FocusInput value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Ej. Guadalajara" />
            </Field>
            <Field label="Estado" icon="map">
              <FocusInput value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Ej. Jalisco" />
            </Field>
          </div>

          {/* NSS + RFC */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Field label="NSS (Núm. Seguro Social)" icon="badge">
              <FocusInput value={nss} onChange={(e) => setNss(e.target.value)} placeholder="11 dígitos" maxLength={11} />
            </Field>
            <Field label="RFC" icon="receipt_long">
              <FocusInput
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                placeholder="XAXX010101000"
                maxLength={13}
                style={{ textTransform: 'uppercase' }}
              />
            </Field>
          </div>
        </div>
      )}

      <ModalFooter>
        <CancelBtn onClick={onClose} />
        {puede && (
          <PrimaryBtn onClick={guardar} disabled={saving || !nombre.trim()}>
            {saving ? 'Guardando…' : 'Crear expediente'}
          </PrimaryBtn>
        )}
      </ModalFooter>

      {/* Date-of-birth wheel picker */}
      {pickerNacOpen && (
        <WheelPickerSheet
          key="nac"
          title="Fecha de nacimiento"
          columns={nacColumns}
          onClose={() => { setDateNacSet(true); setPickerNacOpen(false); }}
        />
      )}
    </ModalCard>
  );
}
