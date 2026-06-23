import { useState, useEffect, useRef } from 'react';
import { useAccount } from '../context/AccountContext';
import { fetchPacientesSelect, getOrCreateExpediente, type PacienteSelect } from '../lib/patients';
import { crearReceta, fetchCie10, type MedicamentoInput } from '../lib/recetas';
import { Icon, Button, Card, IconButton } from '../components';

// ── Campo outlined con label flotante ────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', readOnly }: {
  label: string; value: string; onChange?: (v: string) => void; type?: string; readOnly?: boolean;
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 12px 8px', background: readOnly ? 'var(--surface-container-low)' : 'var(--surface)' }}>
        <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: readOnly ? 'var(--surface-container-low)' : 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{label}</span>
        <input type={type} value={value} readOnly={readOnly} onChange={(e) => onChange?.(e.target.value)}
          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: readOnly ? 'default' : 'text' }} />
      </div>
    </div>
  );
}

function RailCard({ icon, title, action, children }: { icon: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="outlined" style={{ padding: 18, borderRadius: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name={icon} size={19} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--on-surface-variant)' }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function calcEdad(birth: string): string {
  if (!birth) return '—';
  const b = new Date(birth); if (isNaN(b.getTime())) return '—';
  const h = new Date();
  let a = h.getFullYear() - b.getFullYear();
  if (h.getMonth() < b.getMonth() || (h.getMonth() === b.getMonth() && h.getDate() < b.getDate())) a--;
  return a >= 0 ? `${a} años` : '—';
}

interface Med {
  id: number; nombre: string; dosis: string; frecuencia: string; duracion: string; via: string;
  instrucciones: string; controlado: boolean;
}
const nuevoMed = (id: number): Med => ({ id, nombre: '', dosis: '', frecuencia: '', duracion: '', via: '', instrucciones: '', controlado: false });

export function Receta({ go, goBack, toast, patientId }: {
  go: (n: string, p?: any) => void; goBack?: () => void; toast?: (m: string) => void; patientId?: string;
}) {
  const account = useAccount();
  const obsRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(2);

  const [pacientes, setPacientes] = useState<PacienteSelect[]>([]);
  const [pid, setPid]             = useState(patientId || '');
  const [patientOpen, setPatOpen] = useState(false);
  const [birth, setBirth]         = useState('');
  const [recipeDate, setRecipeDate] = useState(new Date().toISOString().slice(0, 10));
  const [dx, setDx]               = useState('');
  const [cie10, setCie10]         = useState<{ codigo: string; descripcion: string }[]>([]);
  const [meds, setMeds]           = useState<Med[]>([nuevoMed(1)]);
  const [medsErr, setMedsErr]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  useEffect(() => {
    if (!account.clinicaId) return;
    fetchPacientesSelect(account.clinicaId).then(setPacientes).catch((e) => console.error(e));
    fetchCie10().then(setCie10).catch((e) => console.error(e));
  }, [account.clinicaId]);
  useEffect(() => { if (!pid && pacientes.length) setPid(patientId || pacientes[0].id); }, [pacientes]);

  const paciente = pacientes.find((p) => p.id === pid) ?? null;
  const controlados = meds.filter((m) => m.controlado).length;
  const conNombre = meds.filter((m) => m.nombre.trim()).length;

  const updMed = (id: number, k: keyof Med, v: any) => { setMeds((ms) => ms.map((m) => m.id === id ? { ...m, [k]: v } : m)); setDirty(true); };
  const addMed = () => { setMeds((ms) => [...ms, nuevoMed(idRef.current++)]); setDirty(true); };
  const delMed = (id: number) => setMeds((ms) => { const r = ms.filter((m) => m.id !== id); return r.length ? r : [nuevoMed(idRef.current++)]; });

  const exec = (cmd: string) => { document.execCommand(cmd); obsRef.current?.focus(); setDirty(true); };

  const emitir = async () => {
    if (conNombre === 0) { setMedsErr(true); toast?.('Agrega al menos un medicamento con nombre'); return; }
    if (!pid)            { toast?.('Selecciona un paciente'); return; }
    const obs = (obsRef.current?.innerHTML || '').trim();
    const medicamentos: MedicamentoInput[] = meds.filter((m) => m.nombre.trim()).map((m) => ({
      medicamento: m.nombre.trim(), dosis: m.dosis || null, frecuencia: m.frecuencia || null,
      duracion: m.duracion || null, via: m.via || null,
      instrucciones: m.instrucciones || null, controlado: m.controlado,
    }));
    setSaving(true);
    try {
      const expId = await getOrCreateExpediente(pid, account.clinicaId!);
      await crearReceta(expId, {
        diagnostico_cie10: dx || null,
        indicaciones: obs && obs !== '<br>' ? obs : null,
        medicamentos,
        fecha_receta: recipeDate || null,
      });
      toast?.('Receta emitida correctamente');
      go('patient', { id: pid });
    } catch (e: any) {
      toast?.('Error al emitir: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  if (!puede) {
    return (
      <div className="page-pad" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <Card variant="elevated" style={{ padding: '48px 28px' }}>
          <Icon name="badge" size={48} style={{ color: 'var(--primary)', opacity: .6 }} />
          <h2 className="title-l" style={{ marginTop: 14 }}>Registra tu cédula profesional</h2>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '8px auto 18px', maxWidth: 420 }}>
            Para emitir recetas necesitas estar dado de alta como médico. Captura tu cédula en tu perfil.
          </p>
          <Button variant="filled" icon="account_circle" onClick={() => go('profile')}>Ir a mi perfil</Button>
        </Card>
      </div>
    );
  }

  const fechaLarga = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top app bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)', borderBottom: '1px solid var(--outline-variant)', padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {goBack && (
          <button onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--on-surface-variant)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Icon name="arrow_back" size={18} />Regresar
          </button>
        )}
        <button onClick={() => pid && go('patient', { id: pid })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <Icon name="folder_shared" size={18} />{paciente ? paciente.name : 'Expediente'}
        </button>
        <div style={{ width: 1, height: 32, background: 'var(--outline-variant)', flexShrink: 0 }} />
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="prescriptions" size={22} fill />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="title-l" style={{ fontWeight: 700, letterSpacing: '-.2px', fontSize: 17 }}>Nueva receta</div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            <span onClick={() => go('patients')} style={{ cursor: 'pointer' }}>Pacientes</span>
            {paciente && <>{' › '}<span>{paciente.name}</span></>}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, background: dirty ? 'var(--surface-container-highest)' : 'var(--success-container)', color: dirty ? 'var(--on-surface-variant)' : 'var(--on-success-container)' }}>
          <Icon name={dirty ? 'edit_document' : 'check_circle'} size={16} />{dirty ? 'Borrador' : 'Sin cambios'}
        </span>
        <Button variant="filled" icon="check_circle" onClick={emitir} disabled={saving}>
          {saving ? 'Emitiendo…' : 'Emitir receta'}
        </Button>
      </div>

      {/* Cuerpo */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1680, width: '100%', margin: '0 auto', padding: '24px 28px 40px' }} className="consulta-body">
        {/* Rail */}
        <div style={{ width: 408, flex: 'none', position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 18 }} className="consulta-rail">
          {/* Paciente */}
          <RailCard icon="person" title="Paciente">
            <div style={{ position: 'relative' }}>
              <button onClick={() => setPatOpen(!patientOpen)} style={{ width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '12px 44px 12px 14px', background: 'var(--surface)', cursor: 'pointer', position: 'relative' }}>
                <div className="title-s" style={{ fontSize: 16 }}>{paciente?.name ?? 'Selecciona un paciente'}</div>
                {paciente && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{calcEdad(birth)} · Exp. {paciente.expediente_id?.slice(0, 8) ?? '—'}</div>}
                <Icon name="arrow_drop_down" size={22} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)' }} />
              </button>
              {patientOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, maxHeight: 280, overflowY: 'auto', padding: 6 }}>
                  {pacientes.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--on-surface-variant)' }}>Sin pacientes registrados.</div>}
                  {pacientes.map((p) => (
                    <button key={p.id} onClick={() => { setPid(p.id); setPatOpen(false); }} className="state-layer" style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '10px 12px', borderRadius: 8, position: 'relative', background: p.id === pid ? 'var(--secondary-container)' : 'transparent', color: 'var(--on-surface)', fontFamily: 'var(--font-body)', fontSize: 14.5 }}>{p.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <Field label="Fecha de nacimiento" type="date" value={birth} onChange={(v) => { setBirth(v); setDirty(true); }} />
              <Field label="Edad calculada" value={calcEdad(birth)} readOnly />
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => pid && go('patient', { id: pid })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-container)', color: 'var(--on-surface)', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', width: '100%' }}>
                <Icon name="folder_shared" size={16} style={{ color: 'var(--primary)' }} />Ver expediente completo
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                {([
                  { key: 'consulta',    icon: 'stethoscope',   label: 'Consulta' },
                  { key: 'receta',      icon: 'prescriptions', label: 'Receta'   },
                  { key: 'informe',     icon: 'clinical_notes',label: 'Informe'  },
                  { key: 'laboratorio', icon: 'labs',           label: 'Lab'     },
                ] as const).map(({ key, icon, label }) => {
                  const active = key === 'receta';
                  return (
                    <button key={key} disabled={active} onClick={() => !active && go(key, { patientId: pid })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 4px', borderRadius: 10, border: 'none', cursor: active ? 'default' : 'pointer', background: active ? 'var(--primary-container)' : 'var(--surface-container-high)', color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: active ? 700 : 500 }}>
                      <Icon name={icon} size={16} fill={active} />{label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <Field label="Fecha de la receta" type="date" value={recipeDate} onChange={(v) => { setRecipeDate(v); setDirty(true); }} />
              {/* Folio asignado por DB al guardar */}
              <div style={{ position: 'relative' }}>
                <div style={{ border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 12px 8px', background: 'var(--surface-container-low)' }}>
                  <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface-container-low)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)' }}>Folio</span>
                  <div style={{ fontSize: 12.5, fontStyle: 'italic', color: 'var(--on-surface-variant)' }}>Se asignará al guardar</div>
                </div>
              </div>
            </div>
          </RailCard>

          {/* Diagnóstico */}
          <RailCard icon="diagnosis" title="Diagnóstico (CIE-10)">
            <select value={dx} onChange={(e) => { setDx(e.target.value); setDirty(true); }}
              style={{ width: '100%', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '12px 14px', background: 'var(--surface)', color: dx ? 'var(--on-surface)' : 'var(--on-surface-variant)', fontSize: 14.5, fontFamily: 'var(--font-body)', cursor: 'pointer', appearance: 'none' }}>
              <option value="">Sin diagnóstico</option>
              {cie10.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descripcion}</option>)}
            </select>
          </RailCard>

          {/* Resumen */}
          <RailCard icon="receipt_long" title="Resumen">
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>Medicamentos</span>
              <span style={{ fontWeight: 700 }}>{conNombre}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span style={{ color: 'var(--on-surface-variant)' }}>Controlados</span>
              <span style={{ fontWeight: 700, color: controlados > 0 ? 'var(--warning)' : 'var(--on-surface)' }}>{controlados}</span>
            </div>
            {controlados > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: '12px 14px', background: 'var(--warning-container)', color: 'var(--on-warning-container)', borderRadius: 12, fontSize: 12.5, lineHeight: 1.5 }}>
                <Icon name="gpp_maybe" size={18} style={{ flexShrink: 0 }} />
                Incluye medicamento controlado. Requiere receta con código de barras / folio especial y registro conforme a normativa.
              </div>
            )}
          </RailCard>
        </div>

        {/* Lienzo */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Medicamentos */}
          <Card variant="outlined" style={{ borderRadius: 20, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="pill" size={20} style={{ color: 'var(--primary)' }} />
                <span className="title-s" style={{ fontSize: 16 }}>Medicamentos</span>
              </div>
              <Button variant="outlined" size="sm" icon="add" onClick={addMed}>Agregar</Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {meds.map((m, idx) => (
                <div key={m.id} style={{
                  border: `1px solid ${m.controlado ? 'var(--warning)' : 'var(--outline-variant)'}`,
                  background: m.controlado ? 'var(--warning-container)' : 'transparent',
                  borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary)', color: 'var(--on-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{idx + 1}</span>
                    <Field label="Medicamento" value={m.nombre} onChange={(v) => { updMed(m.id, 'nombre', v); setMedsErr(false); }} />
                    <IconButton name="delete" onClick={() => delMed(m.id)} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <Field label="Dosis"      value={m.dosis}      onChange={(v) => updMed(m.id, 'dosis', v)} />
                    <Field label="Frecuencia" value={m.frecuencia} onChange={(v) => updMed(m.id, 'frecuencia', v)} />
                    <Field label="Duración"   value={m.duracion}   onChange={(v) => updMed(m.id, 'duracion', v)} />
                    <Field label="Vía"        value={m.via}        onChange={(v) => updMed(m.id, 'via', v)} />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -8, left: 11, padding: '0 5px', background: m.controlado ? 'var(--warning-container)' : 'var(--surface)', fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-variant)', zIndex: 1 }}>Instrucciones del medicamento</span>
                    <textarea value={m.instrucciones} onChange={(e) => updMed(m.id, 'instrucciones', e.target.value)} rows={2}
                      placeholder="Tomar con alimentos, evitar alcohol, suspender ante reacción adversa…"
                      style={{ width: '100%', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '12px', background: 'var(--surface)', color: 'var(--on-surface)', fontSize: 14.5, fontFamily: 'var(--font-body)', resize: 'vertical', outline: 'none' }} />
                  </div>
                  {/* Controlado */}
                  <button onClick={() => updMed(m.id, 'controlado', !m.controlado)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
                    border: `1px solid ${m.controlado ? 'var(--warning)' : 'var(--outline-variant)'}`,
                    background: m.controlado ? 'var(--warning-container)' : 'var(--surface)',
                    borderRadius: 12, padding: '12px 14px',
                  }}>
                    <Icon name={m.controlado ? 'check_box' : 'check_box_outline_blank'} size={22} style={{ color: m.controlado ? 'var(--warning)' : 'var(--on-surface-variant)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: m.controlado ? 'var(--on-warning-container)' : 'var(--on-surface)' }}>Medicamento controlado</div>
                      {m.controlado && <div style={{ fontSize: 12, color: 'var(--on-warning-container)' }}>Requiere folio / receta especial conforme a normativa</div>}
                    </div>
                    {m.controlado && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'var(--warning)', color: 'var(--on-primary)' }}>CONTROLADO</span>}
                  </button>
                </div>
              ))}
            </div>

            {medsErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12.5, color: 'var(--error)' }}>
                <Icon name="error" size={16} />Agrega al menos un medicamento con nombre para emitir la receta.
              </div>
            )}
          </Card>

          {/* Observaciones */}
          <Card variant="outlined" style={{ borderRadius: 20, overflow: 'hidden', padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px' }}>
              <Icon name="edit_note" size={20} style={{ color: 'var(--primary)' }} />
              <span className="title-s" style={{ fontSize: 16 }}>Observaciones generales</span>
              <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Indicaciones para el paciente · texto libre</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', background: 'var(--surface-container-low)', borderTop: '1px solid var(--outline-variant)', borderBottom: '1px solid var(--outline-variant)' }}>
              {[['format_bold', 'bold'], ['format_italic', 'italic'], ['format_list_bulleted', 'insertUnorderedList'], ['format_list_numbered', 'insertOrderedList']].map(([ic, cmd]) => (
                <button key={cmd} onMouseDown={(e) => { e.preventDefault(); exec(cmd); }} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--on-surface-variant)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={20} /></button>
              ))}
            </div>
            <div style={{ padding: 16 }}>
              <div ref={obsRef} contentEditable suppressContentEditableWarning
                data-placeholder="Indicaciones generales para el paciente: cuidados, recomendaciones, datos de alarma y seguimiento…"
                onInput={() => setDirty(true)} className="consulta-editor"
                style={{ minHeight: 200, border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '16px 18px', fontSize: 15, lineHeight: 1.7, background: 'var(--surface)', color: 'var(--on-surface)', outline: 'none' }} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
