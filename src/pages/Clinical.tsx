import { useState, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { createPaciente, fetchPacientesSelect } from '../lib/patients';
import { createCita, encodeMotivoConTipo, fetchCitasDia } from '../lib/citas';
import type { ApptUI } from '../lib/consultas';
import { crearInforme, TIPO_INFORME_LABEL } from '../lib/informes';
import type { TipoInforme } from '../lib/informes';
import { Icon, Button, Card, IconButton, Dialog, TextField, Select } from '../components';
import type { PacienteSelect } from '../lib/patients';
import type { SexoEnum, GrupoSanguineo } from '../lib/types';
import { fetchMedicosClinica, fetchMedicosAsignados, type MedicoOption } from '../lib/equipo';
import {
  fetchCandidatos, fetchOportunidadesAbiertas, asignarOportunidad, descartarOportunidad,
  type CandidatoUI, type OportunidadUI,
} from '../lib/oportunidades';

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

/** Combina DateVal + "HH:MM" (24h, del grid de horarios) → ISO. */
export function dateHHMMToISO(d: DateVal, hhmm: string): string | null {
  if (!hhmm) return null;
  const dt = new Date(`${d.y}-${pad(d.m + 1)}-${pad(d.d)}T${hhmm}`);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

/* ── Grid de horarios (reemplaza la rueda de hora en "Nueva cita") ──────────
   07:00–22:30 cada 30 min. Los horarios ya ocupados de ESE médico ese día se
   ven apagados y no se pueden elegir — evita enterarte del choque hasta
   después de darle a Agendar. */
export function generarHorarios(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 22; h++) {
    slots.push(`${pad(h)}:00`);
    slots.push(`${pad(h)}:30`);
  }
  return slots;
}

function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function computeOcupados(citasDelDia: ApptUI[], durMin: number): Set<string> {
  const activos = citasDelDia.filter((c) => c.status !== 'cancelada');
  const ocupados = new Set<string>();
  for (const slot of generarHorarios()) {
    const inicio = hhmmToMin(slot);
    const fin = inicio + durMin;
    const choca = activos.some((c) => inicio < hhmmToMin(c.end) && fin > hhmmToMin(c.start));
    if (choca) ocupados.add(slot);
  }
  return ocupados;
}

/** Citas del día de un médico concreto — para saber qué horarios del grid apagar. */
export function useCitasDelDia(clinicaId: string | null, medicoId: string, dateStr: string) {
  const [citas, setCitas] = useState<ApptUI[]>([]);
  useEffect(() => {
    if (!clinicaId || !medicoId || !dateStr) { setCitas([]); return; }
    const [y, m, d] = dateStr.split('-').map(Number);
    fetchCitasDia(clinicaId, new Date(y, m - 1, d))
      .then((rows) => setCitas(rows.filter((r) => r.medicoId === medicoId)))
      .catch((e) => console.error('useCitasDelDia:', e));
  }, [clinicaId, medicoId, dateStr]);
  return citas;
}

export function TimeSlotGrid({ value, onChange, ocupados }: {
  value: string; onChange: (v: string) => void; ocupados: Set<string>;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))', gap: 8 }}>
      {generarHorarios().map((s) => {
        const isOcupado = ocupados.has(s);
        const isActivo = value === s;
        return (
          <button
            key={s}
            type="button"
            disabled={isOcupado}
            onClick={() => onChange(s)}
            title={isOcupado ? 'Horario ocupado' : undefined}
            style={{
              padding: '9px 4px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: isOcupado ? 'not-allowed' : 'pointer',
              border: `1.5px solid ${isActivo ? 'var(--primary)' : 'var(--outline-variant)'}`,
              background: isActivo ? 'var(--primary)' : isOcupado ? 'var(--surface-container-highest)' : 'var(--surface)',
              color: isActivo ? 'var(--on-primary)' : isOcupado ? 'var(--on-surface-variant)' : 'var(--on-surface)',
              opacity: isOcupado ? 0.55 : 1,
              textDecoration: isOcupado ? 'line-through' : 'none',
              transition: 'transform .1s, box-shadow .1s',
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

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
            color: i === selectedIdx ? 'var(--on-surface)' : 'var(--on-surface-variant)',
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
        background: 'var(--scrim)', borderRadius: 24,
        display: 'flex', alignItems: 'flex-end', zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--surface-container-high)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -16px 40px var(--shadow)',
          padding: '16px 22px 22px',
        }}
      >
        {/* Sheet header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)' }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', color: 'var(--primary)',
              fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', padding: '6px 8px', borderRadius: 9,
              transition: 'background .15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--primary-container)'; }}
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
            height: IH, background: 'var(--surface-container-highest)', borderRadius: 10, zIndex: 0,
          }} />
          {/* Columns */}
          <div style={{ position: 'relative', display: 'flex', height: '100%', zIndex: 1 }}>
            {columns.map((col, i) => <WheelCol key={i} {...col} />)}
          </div>
          {/* Fade top */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: IH * 2,
            background: 'linear-gradient(var(--surface-container-high), transparent)',
            pointerEvents: 'none', zIndex: 2,
          }} />
          {/* Fade bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: IH * 2,
            background: 'linear-gradient(transparent, var(--surface-container-high))',
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
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', marginBottom: 7,
};
const FI: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none',
  borderBottom: '1.6px solid var(--outline-variant)', outline: 'none',
  padding: '9px 0 9px 30px', fontSize: 15, color: 'var(--on-surface)',
  fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color .15s',
};
const FICON: React.CSSProperties = {
  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--on-surface-variant)', fontSize: 19, pointerEvents: 'none', lineHeight: 1,
};

export function Field({ label, icon, required, children }: { label: string; icon: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={FL}>
        {label}{required && <span style={{ color: 'var(--primary)', marginLeft: 2 }}>*</span>}
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
      style={{ ...FI, borderBottomColor: f ? 'var(--primary)' : 'var(--outline-variant)', ...props.style }}
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
          color: 'var(--on-surface-variant)', paddingRight: 24, cursor: 'pointer',
          borderBottomColor: f ? 'var(--primary)' : 'var(--outline-variant)',
        } as React.CSSProperties}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
      />
      <span className="ms" style={{
        position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
        fontSize: 16, color: 'var(--on-surface-variant)', pointerEvents: 'none',
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
        borderBottom: `1.6px solid ${active ? 'var(--primary)' : 'var(--outline-variant)'}`,
        transition: 'border-color .15s',
      }}
    >
      <span className="ms" style={{ ...FICON, fontSize: 18 }}>{icon}</span>
      <div style={{
        padding: '9px 0 9px 27px', fontSize: 14.5,
        color: value ? 'var(--on-surface)' : 'var(--on-surface-variant)',
      }}>
        {value || placeholder || '—'}
      </div>
    </div>
  );
}

// Outer fixed backdrop + inner card (position:relative for picker overlay)
export function ModalCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="modal-card-backdrop" style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
      background: 'var(--scrim)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 28, overflowY: 'auto', animation: 'fadeIn .2s ease',
    }}>
      <div className="modal-card" style={{
        position: 'relative', width: 580, maxWidth: '100%',
        background: 'var(--surface-container-high)', borderRadius: 24,
        boxShadow: '0 30px 70px var(--shadow)',
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
        background: 'transparent', color: 'var(--on-surface-variant)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--surface-container-highest)'; b.style.color = 'var(--on-surface)'; }}
      onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--on-surface-variant)'; }}
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
        background: 'linear-gradient(145deg, var(--primary-container), var(--primary))',
        boxShadow: '0 8px 18px color-mix(in srgb, var(--primary) 35%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="ms" style={{ fontSize: 26, color: 'var(--on-primary-container)' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-.3px', lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
      gap: 8, marginTop: 30, paddingTop: 22, borderTop: '1px solid var(--outline-variant)',
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
        fontSize: 14.5, fontWeight: 600, color: 'var(--on-surface-variant)',
        padding: '11px 18px', borderRadius: 11, border: 'none',
        background: 'transparent', cursor: 'pointer',
        transition: 'background .15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-container-highest)'; }}
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
        background: disabled ? 'var(--outline-variant)' : 'linear-gradient(145deg, color-mix(in srgb, var(--primary) 85%, white), var(--primary))',
        color: disabled ? 'var(--on-surface-variant)' : 'var(--on-primary)', fontSize: 14.5, fontWeight: 600,
        padding: '12px 22px', borderRadius: 12, border: 'none',
        boxShadow: disabled ? 'none' : '0 10px 22px color-mix(in srgb, var(--primary) 32%, transparent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform .15s, box-shadow .15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          const b = e.currentTarget as HTMLButtonElement;
          b.style.transform = 'translateY(-1px)';
          b.style.boxShadow = '0 14px 28px color-mix(in srgb, var(--primary) 42%, transparent)';
        }
      }}
      onMouseLeave={(e) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.transform = '';
        b.style.boxShadow = disabled ? 'none' : '0 10px 22px color-mix(in srgb, var(--primary) 32%, transparent)';
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

/** Médicos con cédula de la clínica — para el picker "¿para qué médico?" que
 *  necesitan Nuevo paciente/Agendar cita ahora que cualquier miembro activo
 *  (no solo quien tiene cédula) puede crearlos. Un asistente solo ve el/los
 *  médico(s) a los que está asignado (medico_asistentes) — la RLS de
 *  pacientes/citas solo le deja escribir para esos, así que mostrarle el
 *  resto de la clínica solo generaría un guardado que falla. */
export function useMedicos(open: boolean, clinicaId: string | null) {
  const account = useAccount();
  const [medicos, setMedicos] = useState<MedicoOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !clinicaId) return;
    setLoading(true);
    const fetcher =
      account.rol === 'asistente'
        ? fetchMedicosAsignados(clinicaId, account.userId)
        : fetchMedicosClinica(clinicaId);
    fetcher
      .then(setMedicos)
      .catch((e) => console.error('fetchMedicos:', e))
      .finally(() => setLoading(false));
  }, [open, clinicaId, account.rol, account.userId]);
  return { medicos, loading };
}

/* ═══════════════════════════════════════════════════════════
   OPORTUNIDADES — lista de espera para adelanto de citas
   ═══════════════════════════════════════════════════════════ */

type OrdenCandidatos = 'beneficio' | 'solicitud';

function sortCandidatos(list: CandidatoUI[], orden: OrdenCandidatos): CandidatoUI[] {
  const arr = [...list];
  if (orden === 'beneficio') arr.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  else arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return arr;
}

function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

function CandidatoRow({ c, onAsignar, asignando }: { c: CandidatoUI; onAsignar: () => void; asignando: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--outline-variant)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>{c.pacienteName}</div>
        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>
          Cita actual: {fmtFechaHora(c.fecha)}{c.telefono ? ` · ${c.telefono}` : ''}
        </div>
      </div>
      <button
        onClick={onAsignar}
        disabled={asignando}
        style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: 'var(--on-primary)', fontSize: 12.5, fontWeight: 700, cursor: asignando ? 'not-allowed' : 'pointer', opacity: asignando ? 0.6 : 1, fontFamily: 'inherit' }}
      >
        {asignando ? 'Asignando…' : 'Asignar'}
      </button>
    </div>
  );
}

function OrdenToggle({ orden, setOrden }: { orden: OrdenCandidatos; setOrden: (o: OrdenCandidatos) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      {(['beneficio', 'solicitud'] as OrdenCandidatos[]).map((o) => (
        <button
          key={o}
          onClick={() => setOrden(o)}
          style={{ padding: '5px 11px', borderRadius: 999, border: `1px solid ${orden === o ? 'var(--primary)' : 'var(--outline-variant)'}`, background: orden === o ? 'var(--primary-container)' : 'transparent', color: orden === o ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {o === 'beneficio' ? 'Mayor beneficio' : 'Orden de solicitud'}
        </button>
      ))}
    </div>
  );
}

export interface OportunidadModalSingle {
  oportunidadId: string;
  medicoId: string;
  fecha: string;       // ISO del hueco liberado
  duracionMin: number;
}

/**
 * Dos modos en un solo componente (mismo contenido central — lista de candidatos, orden,
 * asignar — solo cambia el alcance):
 * - `single` presente: una oportunidad puntual, recién creada al cancelar una cita — candidato
 *   top preseleccionado, con opción de expandir a la lista completa.
 * - `single` ausente: explorar TODAS las oportunidades abiertas de la clínica (desde el badge
 *   de Dashboard), cada una expandible a su propia lista de candidatos.
 */
export function OportunidadModal({ open, onClose, clinicaId, currentUserId, toast, onResolved, single }: {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  currentUserId: string;
  toast: (m: string) => void;
  onResolved: () => void;
  single?: OportunidadModalSingle | null;
}) {
  const [loading,   setLoading]   = useState(false);
  const [orden,     setOrden]     = useState<OrdenCandidatos>('beneficio');
  const [expandido, setExpandido] = useState(false);
  const [error,     setError]     = useState('');
  const [busyId,    setBusyId]    = useState<string | null>(null);

  const [candidatosSingle, setCandidatosSingle] = useState<CandidatoUI[]>([]);
  const [lista,         setLista]         = useState<OportunidadUI[]>([]);
  const [abiertaId,     setAbiertaId]     = useState<string | null>(null);
  const [candidatosPorOp, setCandidatosPorOp] = useState<Record<string, CandidatoUI[]>>({});

  useEffect(() => {
    if (!open) return;
    setError(''); setExpandido(false); setOrden('beneficio'); setAbiertaId(null); setCandidatosPorOp({});
    setLoading(true);
    if (single) {
      fetchCandidatos(clinicaId, single.medicoId, single.fecha)
        .then(setCandidatosSingle)
        .catch((e: any) => setError(e.message ?? 'Error al cargar candidatos'))
        .finally(() => setLoading(false));
    } else {
      fetchOportunidadesAbiertas(clinicaId)
        .then(setLista)
        .catch((e: any) => setError(e.message ?? 'Error al cargar oportunidades'))
        .finally(() => setLoading(false));
    }
  }, [open, single?.oportunidadId, clinicaId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function handleAsignar(oportunidadId: string, medicoId: string, fecha: string, duracionMin: number, c: CandidatoUI) {
    setBusyId(c.citaId); setError('');
    try {
      await asignarOportunidad(oportunidadId, c.citaId, clinicaId, medicoId, fecha, duracionMin, currentUserId);
      toast(`Cita reasignada a ${c.pacienteName}`);
      if (single) {
        onResolved(); onClose();
      } else {
        setLista((l) => l.filter((o) => o.id !== oportunidadId));
        onResolved();
      }
    } catch (e: any) {
      setError(e.message ?? 'No se pudo asignar');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDescartar(oportunidadId: string) {
    setBusyId(oportunidadId); setError('');
    try {
      await descartarOportunidad(oportunidadId, currentUserId);
      toast('Oportunidad descartada');
      setLista((l) => l.filter((o) => o.id !== oportunidadId));
      onResolved();
    } catch (e: any) {
      setError(e.message ?? 'No se pudo descartar');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleExpandOp(op: OportunidadUI) {
    if (abiertaId === op.id) { setAbiertaId(null); return; }
    setAbiertaId(op.id);
    if (!candidatosPorOp[op.id]) {
      try {
        const cs = await fetchCandidatos(clinicaId, op.medicoId, op.fecha);
        setCandidatosPorOp((m) => ({ ...m, [op.id]: cs }));
      } catch (e: any) { setError(e.message ?? 'Error al cargar candidatos'); }
    }
  }

  // ── Modo "una oportunidad" (post-cancelación) ──────────────────────────────
  if (single) {
    const ordenados = sortCandidatos(candidatosSingle, orden);
    const top  = ordenados[0];
    const resto = ordenados.slice(1);
    return (
      <ModalCard>
        <CloseBtn onClose={onClose} />
        <ModalBadge icon="event_available" title="Hueco liberado" subtitle={fmtFechaHora(single.fecha)} />
        {loading ? (
          <div style={{ padding: '18px 0', color: 'var(--on-surface-variant)', fontSize: 13.5 }}>Buscando pacientes en espera…</div>
        ) : !top ? (
          <div style={{ padding: '18px 0', color: 'var(--on-surface-variant)', fontSize: 13.5 }}>No hay nadie en espera para este horario.</div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Paciente sugerido
            </div>
            <div style={{ background: 'var(--primary-container)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-primary-container)' }}>{top.pacienteName}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--on-primary-container)', opacity: 0.85, marginTop: 2 }}>
                    Cita actual: {fmtFechaHora(top.fecha)}{top.telefono ? ` · ${top.telefono}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleAsignar(single.oportunidadId, single.medicoId, single.fecha, single.duracionMin, top)}
                  disabled={busyId === top.citaId}
                  style={{ flexShrink: 0, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'var(--on-primary)', fontSize: 13, fontWeight: 700, cursor: busyId === top.citaId ? 'not-allowed' : 'pointer', opacity: busyId === top.citaId ? 0.6 : 1, fontFamily: 'inherit' }}
                >
                  {busyId === top.citaId ? 'Asignando…' : `Asignar a ${top.pacienteName.split(' ')[0]}`}
                </button>
              </div>
            </div>

            {resto.length > 0 && (
              <button onClick={() => setExpandido((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '0 0 12px', fontFamily: 'inherit' }}>
                {expandido ? 'Ocultar lista completa' : `Ver lista completa (${resto.length} más)`}
              </button>
            )}

            {expandido && (
              <div>
                <OrdenToggle orden={orden} setOrden={setOrden} />
                {resto.map((c) => (
                  <CandidatoRow
                    key={c.citaId} c={c} asignando={busyId === c.citaId}
                    onAsignar={() => handleAsignar(single.oportunidadId, single.medicoId, single.fecha, single.duracionMin, c)}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {error && <div style={{ fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', padding: '8px 12px', borderRadius: 8, marginTop: 14 }}>{error}</div>}
        <ModalFooter>
          <CancelBtn onClick={onClose} />
        </ModalFooter>
      </ModalCard>
    );
  }

  // ── Modo "explorar todas" (badge de Dashboard) ─────────────────────────────
  return (
    <ModalCard>
      <CloseBtn onClose={onClose} />
      <ModalBadge icon="event_available" title="Oportunidades abiertas" subtitle="Huecos liberados con pacientes en espera" />
      {loading ? (
        <div style={{ padding: '18px 0', color: 'var(--on-surface-variant)', fontSize: 13.5 }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ padding: '18px 0', color: 'var(--on-surface-variant)', fontSize: 13.5 }}>No hay oportunidades abiertas.</div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {lista.map((op) => (
            <div key={op.id} style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)' }}>{op.medicoNombre ?? 'Médico'}</div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>Hueco: {fmtFechaHora(op.fecha)}</div>
                </div>
                <button onClick={() => toggleExpandOp(op)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface)', color: 'var(--on-surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {abiertaId === op.id ? 'Ocultar' : 'Ver candidatos'}
                </button>
                <button onClick={() => handleDescartar(op.id)} disabled={busyId === op.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--error)', background: 'transparent', color: 'var(--error)', fontSize: 12, fontWeight: 600, cursor: busyId === op.id ? 'not-allowed' : 'pointer', opacity: busyId === op.id ? 0.5 : 1, fontFamily: 'inherit' }}>
                  Descartar
                </button>
              </div>
              {abiertaId === op.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--outline-variant)' }}>
                  {!candidatosPorOp[op.id] ? (
                    <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Cargando…</div>
                  ) : candidatosPorOp[op.id].length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Sin candidatos.</div>
                  ) : (
                    candidatosPorOp[op.id].map((c) => (
                      <CandidatoRow
                        key={c.citaId} c={c} asignando={busyId === c.citaId}
                        onAsignar={() => handleAsignar(op.id, op.medicoId, op.fecha, op.duracionMin, c)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: 'var(--on-error-container)', background: 'var(--error-container)', padding: '8px 12px', borderRadius: 8, marginTop: 14 }}>{error}</div>}
      <ModalFooter>
        <CancelBtn onClick={onClose} />
      </ModalFooter>
    </ModalCard>
  );
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
  const { medicos } = useMedicos(open, account.clinicaId);

  const initDate = (): DateVal => { const n = new Date(); return { d: n.getDate(), m: n.getMonth(), y: n.getFullYear() }; };

  const [pid,         setPid]        = useState('');
  const [medicoId,    setMedicoId]   = useState('');
  const [dateVal,     setDateVal]    = useState<DateVal>(initDate);
  const [horaSel,     setHoraSel]    = useState('');
  const [dur,         setDur]        = useState('30');
  const [tipo,        setTipo]       = useState('consulta');
  const [adelanto,    setAdelanto]   = useState(false);
  const [pickerOpen,  setPickerOpen] = useState<null | 'date'>(null);
  const [saving,      setSaving]     = useState(false);

  const dateStr = dateValToISO(dateVal);
  const citasDelDia = useCitasDelDia(account.clinicaId, medicoId, dateStr);
  const ocupados = computeOcupados(citasDelDia, Number(dur) || 30);

  // Si cambia médico/fecha/duración y el horario elegido ya no está libre, se limpia
  // — mejor pedir que elija de nuevo a que se guarde un choque sin darse cuenta.
  useEffect(() => {
    if (horaSel && ocupados.has(horaSel)) setHoraSel('');
  }, [ocupados]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cualquier miembro activo puede agendar (no solo quien tiene cédula) — el
  // picker de "¿para qué médico?" de abajo es lo que mantiene la cita bien
  // atribuida cuando quien la crea no es médico. Con la suscripción vencida
  // (accesoNivel 'limitado') se bloquea crear cosas nuevas, aunque se pueda
  // seguir viendo lo que ya existe.
  const puede = !!account.clinicaId && account.accesoNivel !== 'limitado';

  useEffect(() => {
    if (open) {
      setPid(prefill?.patientId || '');
      // Si el propio usuario es médico (aparece en la lista), se autoselecciona;
      // si no (asistente), se deja vacío y hay que elegir.
      setMedicoId(account.puedeEmitirClinico ? account.userId : '');
      setDateVal(initDate()); setHoraSel('');
      setDur('30'); setTipo('consulta'); setAdelanto(false); setPickerOpen(null); setSaving(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !pid && pacientes.length) setPid(pacientes[0].id);
  }, [open, pacientes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !medicoId && medicos.length === 1) setMedicoId(medicos[0].profileId);
  }, [open, medicos]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!pid) { toast?.('Selecciona un paciente'); return; }
    if (!medicoId) { toast?.('Selecciona a qué médico pertenece la cita'); return; }
    if (!horaSel) { toast?.('Selecciona un horario'); return; }
    const fecha = dateHHMMToISO(dateVal, horaSel);
    if (!fecha) { toast?.('Fecha u hora inválida'); return; }
    setSaving(true);
    try {
      const TIPO_LABELS: Record<string, string> = { consulta: 'Consulta', seguimiento: 'Seguimiento', revision: 'Revisión', urgencia: 'Urgencia' };
      await createCita(account.clinicaId!, medicoId, account.userId, {
        paciente_id: pid, fecha, duracion_min: Number(dur) || 30,
        motivo: encodeMotivoConTipo(tipo, TIPO_LABELS[tipo] ?? tipo),
        acepta_adelanto: adelanto,
      });
      toast?.('Cita agendada correctamente');
      onCreated?.(); onClose();
    } catch (e: any) {
      toast?.('Error al agendar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  if (!open) return null;

  // Wheel picker de fecha (la hora ahora se elige en el grid, no en rueda)
  const days    = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const years_c = YEARS_CITA.map(String);

  const dateColumns: ColDef[] = [
    { items: days,    selectedIdx: dateVal.d - 1,              flex: 1,   onChange: (i) => setDateVal(v => ({ ...v, d: i + 1 })) },
    { items: MONTHS,  selectedIdx: dateVal.m,                  flex: 1.1, onChange: (i) => setDateVal(v => ({ ...v, m: i })) },
    { items: years_c, selectedIdx: dateVal.y - YEARS_CITA[0],  flex: 1.1, onChange: (i) => setDateVal(v => ({ ...v, y: YEARS_CITA[i] })) },
  ];

  return (
    <ModalCard>
      <CloseBtn onClose={onClose} />
      <ModalBadge icon="event_available" title="Agendar cita" subtitle="Programa una consulta para un paciente" />

      {!account.clinicaId ? (
        <PendingNotice text="No perteneces a ninguna clínica todavía." />
      ) : account.accesoNivel === 'limitado' ? (
        <PendingNotice icon="lock_clock" text="Tu suscripción venció. Renueva desde Configuración para poder agendar citas nuevas." />
      ) : pacientes.length === 0 ? (
        <PendingNotice icon="group_off" text="No hay pacientes registrados aún. Crea un paciente antes de agendar una cita." />
      ) : medicos.length === 0 ? (
        <PendingNotice icon="badge" text="Todavía no hay ningún médico con cédula registrado en la clínica. Se necesita al menos uno para agendar citas." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Paciente */}
          <Field label="Paciente" icon="person" required>
            <FocusSelect value={pid} onChange={(e) => setPid(e.target.value)}>
              {pacientes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FocusSelect>
          </Field>

          {/* Médico — solo se muestra si hay más de uno (o si quien agenda no es médico) */}
          {(medicos.length > 1 || !account.puedeEmitirClinico) && (
            <Field label="Médico" icon="stethoscope" required>
              <FocusSelect value={medicoId} onChange={(e) => setMedicoId(e.target.value)}>
                <option value="" disabled>Selecciona un médico</option>
                {medicos.map((m) => <option key={m.profileId} value={m.profileId}>{m.nombre}</option>)}
              </FocusSelect>
            </Field>
          )}

          {/* Fecha / Duración */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22 }}>
            <div>
              <label style={FL}>Fecha</label>
              <PickerTrigger
                icon="calendar_today"
                value={dateValLabel(dateVal)}
                active={pickerOpen === 'date'}
                onClick={() => setPickerOpen('date')}
              />
            </div>
            <Field label="Duración (min)" icon="timer">
              <FocusSelect value={dur} onChange={(e) => setDur(e.target.value)}>
                {['15','30','45','60'].map((d) => <option key={d} value={d}>{d}</option>)}
              </FocusSelect>
            </Field>
          </div>

          {/* Hora de inicio — grid, horarios ocupados de este médico ese día apagados */}
          <div>
            <label style={FL}>Hora de inicio</label>
            <TimeSlotGrid value={horaSel} onChange={setHoraSel} ocupados={ocupados} />
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

          {/* Adelanto de cita — lista de espera si se libera un hueco más cercano con el
              mismo médico (ver src/lib/oportunidades.ts). */}
          <button
            type="button"
            onClick={() => setAdelanto((v) => !v)}
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
      )}

      <ModalFooter>
        <CancelBtn onClick={onClose} />
        {puede && pacientes.length > 0 && medicos.length > 0 && (
          <PrimaryBtn onClick={guardar} disabled={saving || !pid || !medicoId || !horaSel}>
            {saving ? 'Agendando…' : 'Agendar cita'}
          </PrimaryBtn>
        )}
      </ModalFooter>

      {pickerOpen === 'date' && (
        <WheelPickerSheet
          key="date"
          title="Fecha"
          columns={dateColumns}
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

  const puede = account.puedeEmitirClinico && !!account.clinicaId && account.accesoNivel !== 'limitado';
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
      {account.accesoNivel === 'limitado' ? (
        <div style={{ padding: '8px 24px' }}><PendingNotice icon="lock_clock" text="Tu suscripción venció. Renueva desde Configuración para poder redactar informes." /></div>
      ) : !puede ? (
        <div style={{ padding: '8px 24px' }}><PendingNotice text="Para redactar informes necesitas estar registrado como médico (cédula). Captúrala en tu perfil." /></div>
      ) : pacientes.length === 0 ? (
        <div style={{ padding: '8px 24px' }}><PendingNotice icon="group_off" text="No hay pacientes registrados aún." /></div>
      ) : (
        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
  const { medicos } = useMedicos(open, account.clinicaId);

  const [nombre,       setNombre]      = useState('');
  const [medicoId,     setMedicoId]    = useState('');
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
      // Si el propio usuario es médico (aparece en la lista), se autoselecciona
      // como médico tratante; si no (asistente), se deja vacío y hay que elegir.
      setMedicoId(account.puedeEmitirClinico ? account.userId : '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !medicoId && medicos.length === 1) setMedicoId(medicos[0].profileId);
  }, [open, medicos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cualquier miembro activo puede dar de alta pacientes (no solo quien tiene
  // cédula) — el picker de "médico tratante" de abajo mantiene el dato correcto
  // cuando quien registra no es médico. Con la suscripción vencida (accesoNivel
  // 'limitado') se bloquea crear pacientes nuevos.
  const puede = !!account.clinicaId && account.accesoNivel !== 'limitado';

  const guardar = async () => {
    if (!nombre.trim()) { toast?.('El nombre es obligatorio'); return; }
    if (!medicoId) { toast?.('Selecciona el médico tratante'); return; }
    setSaving(true);
    try {
      await createPaciente(account.clinicaId!, medicoId, {
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

      {!account.clinicaId ? (
        <PendingNotice text="No perteneces a ninguna clínica todavía." />
      ) : account.accesoNivel === 'limitado' ? (
        <PendingNotice icon="lock_clock" text="Tu suscripción venció. Renueva desde Configuración para poder dar de alta pacientes." />
      ) : medicos.length === 0 ? (
        <PendingNotice icon="badge" text="Todavía no hay ningún médico con cédula registrado en la clínica. Se necesita al menos uno para dar de alta pacientes." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Nombre */}
          <Field label="Nombre(s)" icon="badge" required>
            <FocusInput value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. María Fernanda" />
          </Field>

          {/* Médico tratante — solo se muestra si hay más de uno (o si quien registra no es médico) */}
          {(medicos.length > 1 || !account.puedeEmitirClinico) && (
            <Field label="Médico tratante" icon="stethoscope" required>
              <FocusSelect value={medicoId} onChange={(e) => setMedicoId(e.target.value)}>
                <option value="" disabled>Selecciona un médico</option>
                {medicos.map((m) => <option key={m.profileId} value={m.profileId}>{m.nombre}</option>)}
              </FocusSelect>
            </Field>
          )}

          {/* Apellidos */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Field label="Apellido paterno" icon="person">
              <FocusInput value={apPaterno} onChange={(e) => setApPaterno(e.target.value)} placeholder="Apellido paterno" />
            </Field>
            <Field label="Apellido materno" icon="person">
              <FocusInput value={apMaterno} onChange={(e) => setApMaterno(e.target.value)} placeholder="Apellido materno" />
            </Field>
          </div>

          {/* Fecha de nacimiento (wheel) + Sexo */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <Field label="Municipio / Alcaldía" icon="location_city">
              <FocusInput value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Ej. Guadalajara" />
            </Field>
            <Field label="Estado" icon="map">
              <FocusInput value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Ej. Jalisco" />
            </Field>
          </div>

          {/* NSS + RFC */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
        {puede && medicos.length > 0 && (
          <PrimaryBtn onClick={guardar} disabled={saving || !nombre.trim() || !medicoId}>
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
