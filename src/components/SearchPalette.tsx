import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './index';
import { fetchPacientesSelect, type PacienteSelect } from '../lib/patients';

// Paleta de búsqueda global (Ctrl/⌘ + K): salta a un paciente o ejecuta una acción
// frecuente sin pasar por el menú. Los pacientes se cargan una vez al abrirse y se
// filtran en el cliente (sin acentos ni mayúsculas).

type Item =
  | { kind: 'paciente'; id: string; label: string; sub: string; icon: string; run: () => void }
  | { kind: 'accion';   id: string; label: string; sub: string; icon: string; run: () => void };

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SearchPalette({ open, onClose, clinicaId, dataVersion, go, openModal }: {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  dataVersion: number;
  go: (name: string, params?: any) => void;
  openModal: (type: string, prefill?: any) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [pacientes, setPacientes] = useState<PacienteSelect[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Se recarga al abrir (y tras cualquier alta, vía dataVersion) para no mostrar
  // una lista vieja.
  useEffect(() => {
    if (!open || !clinicaId) return;
    setQ(''); setSel(0);
    fetchPacientesSelect(clinicaId).then(setPacientes).catch((e) => { console.error('Búsqueda: pacientes', e); setPacientes([]); });
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, clinicaId, dataVersion]);

  const items = useMemo<Item[]>(() => {
    const cerrarY = (fn: () => void) => () => { onClose(); fn(); };
    const acciones: Item[] = [
      { kind: 'accion', id: 'a-cita',     label: 'Nueva cita',      sub: 'Agendar una cita',         icon: 'event',    run: cerrarY(() => openModal('appointment')) },
      { kind: 'accion', id: 'a-paciente', label: 'Nuevo paciente',  sub: 'Registrar un expediente',  icon: 'person_add', run: cerrarY(() => openModal('patient')) },
      { kind: 'accion', id: 'a-inicio',   label: 'Ir a Inicio',     sub: 'Resumen del día',          icon: 'space_dashboard', run: cerrarY(() => go('dashboard')) },
      { kind: 'accion', id: 'a-agenda',   label: 'Ir a Agenda',     sub: 'Calendario de citas',      icon: 'calendar_month', run: cerrarY(() => go('calendar')) },
      { kind: 'accion', id: 'a-pacientes', label: 'Ir a Pacientes', sub: 'Lista de pacientes',       icon: 'groups',   run: cerrarY(() => go('patients')) },
    ];
    const needle = sinAcentos(q.trim());
    const delPaciente = (p: PacienteSelect): Item => ({
      kind: 'paciente', id: p.id, label: p.name, sub: p.telefono ?? 'Sin teléfono', icon: 'person',
      run: cerrarY(() => go('patient', { id: p.id })),
    });
    if (!needle) return [...(pacientes ?? []).slice(0, 4).map(delPaciente), ...acciones];
    const digitos = needle.replace(/\D/g, '');
    const encontrados = (pacientes ?? [])
      .filter((p) => sinAcentos(p.name).includes(needle) || (digitos.length >= 3 && (p.telefono ?? '').replace(/\D/g, '').includes(digitos)))
      .slice(0, 8).map(delPaciente);
    const accionesQue = acciones.filter((a) => sinAcentos(`${a.label} ${a.sub}`).includes(needle));
    return [...encontrados, ...accionesQue];
  }, [q, pacientes, go, openModal, onClose]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, Math.max(items.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
  };

  const hayPacientes = items.some((i) => i.kind === 'paciente');
  let ultimoGrupo: Item['kind'] | null = null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'var(--scrim)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 0' }}>
      <div role="dialog" aria-modal="true" aria-label="Búsqueda" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
        style={{ width: 'min(560px, 100%)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--elev-3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', height: 56, borderBottom: '1px solid var(--outline-variant)' }}>
          <Icon name="search" size={22} style={{ color: 'var(--on-surface-variant)' }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente o acción…"
            role="combobox" aria-expanded="true" aria-controls="search-palette-list" aria-activedescendant={items[sel] ? `sp-${items[sel].id}` : undefined}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 16, fontFamily: 'var(--font-body)' }} />
          <kbd style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)', background: 'var(--surface-container-highest)', padding: '2px 7px', borderRadius: 6 }}>Esc</kbd>
        </div>

        <div ref={listRef} id="search-palette-list" role="listbox" style={{ overflowY: 'auto', padding: '6px 8px 10px' }}>
          {pacientes === null && <div className="body-m" style={{ padding: '18px 12px', color: 'var(--on-surface-variant)' }}>Cargando pacientes…</div>}
          {pacientes !== null && q.trim() && !hayPacientes && (
            <div className="body-m" style={{ padding: '12px 12px 4px', color: 'var(--on-surface-variant)' }}>Ningún paciente coincide con “{q.trim()}”.</div>
          )}
          {items.map((it, idx) => {
            const encabezado = it.kind !== ultimoGrupo;
            ultimoGrupo = it.kind;
            const activo = idx === sel;
            return (
              <div key={it.id}>
                {encabezado && (
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--on-surface-variant)', padding: '10px 12px 4px' }}>
                    {it.kind === 'paciente' ? 'Pacientes' : 'Acciones'}
                  </div>
                )}
                <div id={`sp-${it.id}`} role="option" aria-selected={activo} data-idx={idx} onClick={it.run} onMouseMove={() => setSel(idx)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer', background: activo ? 'var(--secondary-container)' : 'transparent', color: activo ? 'var(--on-secondary-container)' : 'var(--on-surface)' }}>
                  <Icon name={it.icon} size={20} style={{ color: activo ? 'inherit' : 'var(--on-surface-variant)' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
                    <div style={{ fontSize: 12, opacity: .75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>
                  </div>
                  {activo && <Icon name="keyboard_return" size={18} style={{ opacity: .6 }} />}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 16, padding: '8px 18px', borderTop: '1px solid var(--outline-variant)', fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
          <span>↑↓ moverse</span><span>↵ abrir</span><span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}
