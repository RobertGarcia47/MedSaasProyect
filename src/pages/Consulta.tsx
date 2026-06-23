import { useState, useEffect, useRef, useMemo } from 'react';
import { useAccount } from '../context/AccountContext';
import { fetchPacientesSelect, getOrCreateExpediente, actualizarGrupoSanguineo, type PacienteSelect } from '../lib/patients';
import type { GrupoSanguineo } from '../lib/types';
import { crearConsulta, obtenerConsultas, type ConsultaDetalleUI } from '../lib/consultas';
import { obtenerAntecedentes, guardarAntecedentes, ANTECEDENTES_VACIOS, type Antecedentes,
         obtenerAlergias, agregarAlergia, eliminarAlergia, type Alergia } from '../lib/antecedentes';
import { fetchCie10 } from '../lib/recetas';
import { Icon, Button, Card, IconButton, Select } from '../components';

// ── Campo outlined con label flotante (estilo del diseño) ────────────────────────
function Field({
  label, value, onChange, type = 'text', readOnly, hint, hintColor, tint,
}: {
  label: string; value: string; onChange?: (v: string) => void; type?: string;
  readOnly?: boolean; hint?: string; hintColor?: string; tint?: string;
}) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div style={{
        border: `1px solid ${tint || 'var(--outline-variant)'}`, borderRadius: 12,
        padding: '10px 12px 8px', background: tint ? `${tint}14` : 'var(--surface)',
      }}>
        <span style={{
          position: 'absolute', top: -8, left: 11, padding: '0 5px', background: 'var(--surface)',
          fontSize: 11.5, fontWeight: 600, color: hintColor || 'var(--on-surface-variant)',
        }}>{label}</span>
        <input
          type={type} value={value} readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--on-surface)', fontSize: 16, fontWeight: 500, fontFamily: 'var(--font-body)',
            cursor: readOnly ? 'default' : 'text',
          }}
        />
        {hint && <div style={{ fontSize: 12, fontWeight: 700, color: hintColor || 'var(--on-surface-variant)', marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
}

// ── Tarjeta del rail ──────────────────────────────────────────────────────────
function RailCard({ icon, title, action, children }: {
  icon: string; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
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

// ── IMC ──────────────────────────────────────────────────────────────────────
function calcImc(peso: string, talla: string): { value: string; hint: string; color: string } | null {
  const p = parseFloat(peso), t = parseFloat(talla);
  if (!p || !t) return null;
  const imc = Math.round((p / ((t / 100) ** 2)) * 10) / 10;
  let hint = 'Normal', color = 'var(--success)';
  if (imc < 18.5)      { hint = 'Bajo peso';  color = 'var(--warning)'; }
  else if (imc < 25)   { hint = 'Normal';     color = 'var(--success)'; }
  else if (imc < 30)   { hint = 'Sobrepeso';  color = 'var(--warning)'; }
  else                 { hint = 'Obesidad';   color = 'var(--error)'; }
  return { value: String(imc), hint, color };
}

// ── Plantillas de nota ──────────────────────────────────────────────────────────
const PLANTILLAS: Record<string, string> = {
  'Exploración física normal':
    '<p><b>Exploración física:</b> Paciente consciente, orientado, hidratado. Cardiopulmonar sin compromiso. Abdomen blando, depresible, no doloroso. Extremidades íntegras, sin edema.</p>',
  'Indicaciones generales':
    '<p><b>Indicaciones:</b></p><ul><li>Reposo relativo.</li><li>Abundantes líquidos.</li><li>Acudir a urgencias ante datos de alarma.</li><li>Cita de seguimiento.</li></ul>',
  'Estructura de nota':
    '<p><b>Padecimiento actual:</b> </p><p><b>Exploración física:</b> </p><p><b>Impresión diagnóstica:</b> </p><p><b>Plan e indicaciones:</b> </p>',
};

const VITAL_VACIO = { peso: '', talla: '', taSist: '', taDiast: '', fc: '', temp: '', fr: '', spo2: '', glucosa: '', periAbdo: '', grasaPct: '' };

// Opciones de grupo sanguíneo (mismo enum que la BD)
const GRUPO_SANGRE_OPTS = [
  { value: '', label: 'Sin especificar' },
  ...['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({ value: g, label: g })),
  { value: 'desconocido', label: 'Desconocido' },
];

// Categorías de antecedentes (las 4 narrativas que guarda la RPC guardar_antecedentes)
const CATS_ANT: { key: keyof Antecedentes; label: string; icon: string }[] = [
  { key: 'patologicos',      label: 'Patológicos',      icon: 'coronavirus' },
  { key: 'no_patologicos',   label: 'No patológicos',   icon: 'self_improvement' },
  { key: 'heredofamiliares', label: 'Heredofamiliares', icon: 'family_restroom' },
  { key: 'quirurgicos',      label: 'Quirúrgicos',      icon: 'vaccines' },
];

interface Dx { code: string; label: string }

export function Consulta({ go, goBack, toast, patientId }: {
  go: (n: string, p?: any) => void;
  goBack?: () => void;
  toast?: (m: string) => void;
  patientId?: string;
}) {
  const account = useAccount();
  const editorRef = useRef<HTMLDivElement>(null);

  const [pacientes, setPacientes] = useState<PacienteSelect[]>([]);
  const [pid, setPid]             = useState(patientId || '');
  const [patientOpen, setPatOpen] = useState(false);
  const [motivo, setMotivo]       = useState('');
  const [motivoErr, setMotivoErr] = useState(false);
  const [vitales, setVitales]     = useState({ ...VITAL_VACIO });
  const [dxQuery, setDxQuery]     = useState('');
  const [cie10, setCie10]         = useState<{ codigo: string; descripcion: string }[]>([]);
  const [diagnosticos, setDx]     = useState<Dx[]>([]);
  const [plantillaOpen, setPlantOpen] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);
  // Historial de consultas previas (acordeón en el rail, para revisar en caliente)
  const [historial, setHistorial]     = useState<ConsultaDetalleUI[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [openHist, setOpenHist]       = useState<string | null>(null);
  // Antecedentes médicos del expediente (4 categorías, persistentes)
  const [antecedentes, setAntecedentes] = useState<Antecedentes>(ANTECEDENTES_VACIOS);
  const [antLoading, setAntLoading]     = useState(false);
  const [antSaving, setAntSaving]       = useState(false);
  const [antDirty, setAntDirty]         = useState(false);
  const [openCat, setOpenCat]           = useState<string | null>(null);
  const [alergias, setAlergias]         = useState<Alergia[]>([]);
  const [alergiaInput, setAlergiaInput] = useState('');

  const puede = account.puedeEmitirClinico && !!account.clinicaId;

  useEffect(() => {
    if (!account.clinicaId) return;
    fetchPacientesSelect(account.clinicaId).then(setPacientes).catch((e) => console.error(e));
    fetchCie10().then(setCie10).catch((e) => console.error(e));
  }, [account.clinicaId]);

  useEffect(() => { if (!pid && pacientes.length) setPid(patientId || pacientes[0].id); }, [pacientes]);

  const paciente = pacientes.find((p) => p.id === pid) ?? null;
  const imc = calcImc(vitales.peso, vitales.talla);

  // Carga el historial de consultas previas del paciente seleccionado.
  const expedienteSel = paciente?.expediente_id ?? null;
  useEffect(() => {
    setOpenHist(null);
    setOpenCat(null);
    setAntDirty(false);
    setAlergiaInput('');
    if (!expedienteSel) { setHistorial([]); setAntecedentes(ANTECEDENTES_VACIOS); setAlergias([]); return; }
    setHistLoading(true);
    obtenerConsultas(expedienteSel)
      .then(setHistorial)
      .catch((e) => { console.error(e); setHistorial([]); })
      .finally(() => setHistLoading(false));
    setAntLoading(true);
    obtenerAntecedentes(expedienteSel)
      .then(setAntecedentes)
      .catch((e) => { console.error(e); setAntecedentes(ANTECEDENTES_VACIOS); })
      .finally(() => setAntLoading(false));
    obtenerAlergias(expedienteSel)
      .then(setAlergias)
      .catch((e) => { console.error(e); setAlergias([]); });
  }, [expedienteSel]);

  const dxResults = useMemo(() => {
    const q = dxQuery.trim().toLowerCase();
    if (!q) return [];
    return cie10
      .filter((c) => c.codigo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q))
      .filter((c) => !diagnosticos.some((d) => d.code === c.codigo))
      .slice(0, 6);
  }, [dxQuery, cie10, diagnosticos]);

  const updVital = (k: string, v: string) => { setVitales((p) => ({ ...p, [k]: v })); setDirty(true); };
  const addDx = (c: { codigo: string; descripcion: string }) => {
    setDx((prev) => prev.some((d) => d.code === c.codigo) ? prev : [...prev, { code: c.codigo, label: c.descripcion }]);
    setDxQuery(''); setDirty(true);
  };
  const removeDx = (code: string) => setDx((prev) => prev.filter((d) => d.code !== code));

  // ── Editor de texto enriquecido (contenteditable) ──
  const exec = (cmd: string) => { document.execCommand(cmd); editorRef.current?.focus(); setDirty(true); };
  const insertHTML = (html: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    setPlantOpen(false); setDirty(true);
  };

  const num = (v: string): number | null => { const n = parseFloat(v); return isNaN(n) ? null : n; };

  const registrar = async () => {
    if (!motivo.trim()) { setMotivoErr(true); toast?.('El motivo de consulta es obligatorio'); return; }
    if (!pid)           { toast?.('Selecciona un paciente'); return; }
    const notasHtml = (editorRef.current?.innerHTML || '').trim();
    const notas = notasHtml && notasHtml !== '<br>' ? notasHtml : null;

    setSaving(true);
    try {
      const expId = await getOrCreateExpediente(pid, account.clinicaId!);
      await crearConsulta(account.clinicaId!, expId, {
        motivo,
        notas,
        vitales: {
          peso_kg: num(vitales.peso), talla_cm: num(vitales.talla),
          ta_sistolica: num(vitales.taSist), ta_diastolica: num(vitales.taDiast),
          fc: num(vitales.fc), temp_c: num(vitales.temp),
          fr: num(vitales.fr), spo2: num(vitales.spo2),
          glucosa: num(vitales.glucosa),
          perimetro_abdominal_cm: num(vitales.periAbdo),
          grasa_corporal_pct: num(vitales.grasaPct),
        },
        diagnosticos: diagnosticos.map((d, i) => ({ codigo: d.code, es_principal: i === 0 })),
      });
      toast?.('Consulta registrada correctamente');
      go('patient', { id: pid });
    } catch (e: any) {
      toast?.('Error al registrar: ' + (e?.message ?? String(e)));
    } finally { setSaving(false); }
  };

  const setCat = (k: keyof Antecedentes, v: string) => { setAntecedentes((p) => ({ ...p, [k]: v })); setAntDirty(true); };

  const guardarAnt = async () => {
    if (!pid) { toast?.('Selecciona un paciente'); return; }
    setAntSaving(true);
    try {
      let expId = expedienteSel;
      if (!expId) {
        expId = await getOrCreateExpediente(pid, account.clinicaId!);
        setPacientes((prev) => prev.map((p) => p.id === pid ? { ...p, expediente_id: expId } : p));
      }
      await guardarAntecedentes(expId!, antecedentes);
      setAntDirty(false);
      toast?.('Antecedentes guardados');
    } catch (e: any) {
      toast?.('Error al guardar antecedentes: ' + (e?.message ?? String(e)));
    } finally { setAntSaving(false); }
  };

  const updGrupo = async (g: string) => {
    if (!pid) return;
    const prev = paciente?.grupo_sanguineo ?? null;
    const nuevo = (g || null) as GrupoSanguineo | null;
    setPacientes((list) => list.map((p) => p.id === pid ? { ...p, grupo_sanguineo: nuevo } : p));
    try {
      await actualizarGrupoSanguineo(pid, nuevo);
      toast?.('Grupo sanguíneo actualizado');
    } catch (e: any) {
      setPacientes((list) => list.map((p) => p.id === pid ? { ...p, grupo_sanguineo: prev } : p));
      toast?.('Error al actualizar grupo: ' + (e?.message ?? String(e)));
    }
  };

  const addAlergia = async () => {
    const a = alergiaInput.trim();
    if (!a || !pid) return;
    try {
      let expId = expedienteSel;
      if (!expId) {
        expId = await getOrCreateExpediente(pid, account.clinicaId!);
        setPacientes((prev) => prev.map((p) => p.id === pid ? { ...p, expediente_id: expId } : p));
      }
      const nueva = await agregarAlergia(expId!, account.clinicaId!, a);
      setAlergias((prev) => [...prev, nueva]);
      setAlergiaInput('');
    } catch (e: any) { toast?.('Error al agregar alergia: ' + (e?.message ?? String(e))); }
  };

  const removeAlergia = async (id: string) => {
    const prev = alergias;
    setAlergias((p) => p.filter((x) => x.id !== id));   // optimista
    try { await eliminarAlergia(id); }
    catch (e: any) { setAlergias(prev); toast?.('Error al eliminar alergia: ' + (e?.message ?? String(e))); }
  };

  // ── Guard: sin cédula no se registra ──
  if (!puede) {
    return (
      <div className="page-pad" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <Card variant="elevated" style={{ padding: '48px 28px' }}>
          <Icon name="badge" size={48} style={{ color: 'var(--primary)', opacity: .6 }} />
          <h2 className="title-l" style={{ marginTop: 14 }}>Registra tu cédula profesional</h2>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '8px auto 18px', maxWidth: 420 }}>
            Para registrar consultas necesitas estar dado de alta como médico. Captura tu cédula en tu perfil.
          </p>
          <Button variant="filled" icon="account_circle" onClick={() => go('profile')}>Ir a mi perfil</Button>
        </Card>
      </div>
    );
  }

  const fechaLarga = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* ── Top app bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--surface)',
        borderBottom: '1px solid var(--outline-variant)', padding: '10px 28px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
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
          <Icon name="stethoscope" size={22} fill />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="title-l" style={{ fontWeight: 700, letterSpacing: '-.2px', fontSize: 17 }}>Nueva consulta</div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            <span onClick={() => go('patients')} style={{ cursor: 'pointer' }}>Pacientes</span>
            {paciente && <>{' › '}<span>{paciente.name}</span></>}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
          fontSize: 12.5, fontWeight: 500,
          background: dirty ? 'var(--surface-container-highest)' : 'var(--success-container)',
          color: dirty ? 'var(--on-surface-variant)' : 'var(--on-success-container)',
        }}>
          <Icon name={dirty ? 'edit_document' : 'check_circle'} size={16} />{dirty ? 'Borrador' : 'Sin cambios'}
        </span>
        <Button variant="filled" icon="check_circle" onClick={registrar} disabled={saving}>
          {saving ? 'Registrando…' : 'Registrar consulta'}
        </Button>
      </div>

      {/* ── Cuerpo ── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1680, width: '100%', margin: '0 auto', padding: '24px 28px 40px' }} className="consulta-body">
        {/* Rail izquierdo */}
        <div style={{ width: 408, flex: 'none', position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 18 }} className="consulta-rail">
          {/* Paciente */}
          <RailCard icon="person" title="Paciente">
            <div style={{ position: 'relative' }}>
              <button onClick={() => setPatOpen(!patientOpen)} style={{
                width: '100%', textAlign: 'left', border: '1px solid var(--outline-variant)', borderRadius: 12,
                padding: '12px 44px 12px 14px', background: 'var(--surface)', cursor: 'pointer', position: 'relative',
              }}>
                <div className="title-s" style={{ fontSize: 16 }}>{paciente?.name ?? 'Selecciona un paciente'}</div>
                {paciente && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Exp. {paciente.expediente_id?.slice(0, 8) ?? '—'}</div>}
                <Icon name="arrow_drop_down" size={22} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-variant)' }} />
              </button>
              {patientOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, maxHeight: 280, overflowY: 'auto', padding: 6 }}>
                  {pacientes.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--on-surface-variant)' }}>Sin pacientes registrados.</div>}
                  {pacientes.map((p) => (
                    <button key={p.id} onClick={() => {
                      if (p.id !== pid && antDirty &&
                          !window.confirm('Tienes antecedentes sin guardar. ¿Cambiar de paciente y perder los cambios?')) return;
                      setPid(p.id); setPatOpen(false);
                    }} className="state-layer" style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                      padding: '10px 12px', borderRadius: 8, position: 'relative',
                      background: p.id === pid ? 'var(--secondary-container)' : 'transparent',
                      color: 'var(--on-surface)', fontFamily: 'var(--font-body)', fontSize: 14.5,
                    }}>{p.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => pid && go('patient', { id: pid })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-container)', color: 'var(--on-surface)', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', width: '100%' }}>
                <Icon name="folder_shared" size={16} style={{ color: 'var(--primary)' }} />Ver expediente completo
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                {([
                  { key: 'consulta',    icon: 'stethoscope',  label: 'Consulta' },
                  { key: 'receta',      icon: 'prescriptions',label: 'Receta'   },
                  { key: 'informe',     icon: 'clinical_notes',label: 'Informe' },
                  { key: 'laboratorio', icon: 'labs',          label: 'Lab'     },
                ] as const).map(({ key, icon, label }) => {
                  const active = key === 'consulta';
                  return (
                    <button key={key} disabled={active} onClick={() => !active && go(key, { patientId: pid })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 4px', borderRadius: 10, border: 'none', cursor: active ? 'default' : 'pointer', background: active ? 'var(--primary-container)' : 'var(--surface-container-high)', color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: active ? 700 : 500 }}>
                      <Icon name={icon} size={16} fill={active} />{label}
                    </button>
                  );
                })}
              </div>
            </div>
            {paciente && (
              <div style={{ marginTop: 12 }}>
                <Select label="Grupo sanguíneo" value={paciente.grupo_sanguineo ?? ''} onChange={updGrupo} options={GRUPO_SANGRE_OPTS} />
              </div>
            )}
          </RailCard>

          {/* Historial de consultas previas (acordeón — revisar en caliente) */}
          <RailCard icon="history" title="Historial de consultas"
            action={historial && historial.length > 0
              ? <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: 'var(--primary-container)', color: 'var(--on-primary-container)' }}>{historial.length}</span>
              : undefined}>
            {!paciente ? (
              <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Selecciona un paciente para ver su historial.</div>
            ) : histLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                <Icon name="hourglass_empty" size={16} />Cargando historial…
              </div>
            ) : (historial?.length ?? 0) === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                <Icon name="history" size={16} />Sin consultas previas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                {historial!.map((c) => {
                  const vit = [
                    c.peso_kg != null ? `${c.peso_kg} kg` : null,
                    c.talla_cm != null ? `${c.talla_cm} cm` : null,
                    (c.ta_sistolica != null && c.ta_diastolica != null) ? `PA ${c.ta_sistolica}/${c.ta_diastolica}` : null,
                    c.fc != null ? `${c.fc} lpm` : null,
                    c.fr != null ? `FR ${c.fr} rpm` : null,
                    c.temp_c != null ? `${c.temp_c} °C` : null,
                    c.spo2 != null ? `SpO₂ ${c.spo2}%` : null,
                    c.glucosa != null ? `Glucosa ${c.glucosa} mg/dL` : null,
                    c.perimetro_abdominal_cm != null ? `Abd. ${c.perimetro_abdominal_cm} cm` : null,
                    c.grasa_corporal_pct != null ? `GC ${c.grasa_corporal_pct}%` : null,
                  ].filter(Boolean).join(' · ');
                  const isOpen = openHist === c.id;
                  return (
                    <div key={c.id}>
                      <button
                        onClick={() => setOpenHist(isOpen ? null : c.id)}
                        aria-expanded={isOpen}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px',
                          background: isOpen ? 'var(--surface-container-high)' : 'var(--surface-container-low)',
                          border: '1px solid var(--outline-variant)', borderRadius: 10, cursor: 'pointer',
                          textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)',
                        }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="title-s" style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.motivo || 'Consulta médica'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                            {new Date(c.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>
                        <Icon name="expand_more" size={20} style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                      </button>
                      {isOpen && (
                        <div style={{ padding: '10px 4px 4px' }}>
                          {vit && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{vit}</div>}
                          {c.notas && (
                            <div className="nota-clinica-render"
                              style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-container-high)', borderRadius: 10, fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.55 }}
                              dangerouslySetInnerHTML={{ __html: c.notas }} />
                          )}
                          {!vit && !c.notas && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Sin detalles registrados.</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </RailCard>

          {/* Antecedentes médicos (4 categorías, persistentes en el expediente) */}
          <RailCard icon="clinical_notes" title="Antecedentes médicos"
            action={paciente
              ? <Button variant="text" size="sm" icon="save" onClick={guardarAnt} disabled={antSaving || !antDirty}>
                  {antSaving ? 'Guardando…' : 'Guardar'}
                </Button>
              : undefined}>
            {!paciente ? (
              <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Selecciona un paciente para registrar antecedentes.</div>
            ) : antLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                <Icon name="hourglass_empty" size={16} />Cargando antecedentes…
              </div>
            ) : (
              <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CATS_ANT.map(({ key, label, icon }) => {
                  const isOpen = openCat === key;
                  const val = antecedentes[key];
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setOpenCat(isOpen ? null : key)}
                        aria-expanded={isOpen}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 11px',
                          background: isOpen ? 'var(--surface-container-high)' : 'var(--surface-container-low)',
                          border: '1px solid var(--outline-variant)', borderRadius: 10, cursor: 'pointer',
                          textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--on-surface)',
                        }}>
                        <Icon name={icon} size={17} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
                        {val.trim() && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />}
                        <Icon name="expand_more" size={18} style={{ color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                      </button>
                      {isOpen && (
                        <textarea
                          value={val}
                          onChange={(e) => setCat(key, e.target.value)}
                          placeholder={`Antecedentes ${label.toLowerCase()}…`}
                          style={{
                            width: '100%', marginTop: 6, minHeight: 72, boxSizing: 'border-box',
                            border: '1px solid var(--outline-variant)', borderRadius: 10, padding: '10px 12px',
                            fontSize: 13.5, lineHeight: 1.5, fontFamily: 'var(--font-body)', color: 'var(--on-surface)',
                            background: 'var(--surface)', resize: 'vertical', outline: 'none',
                          }} />
                      )}
                      {!isOpen && val.trim() && (
                        <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', padding: '3px 6px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Alergias (tabla expediente_alergias) */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--outline-variant)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name="warning" size={16} style={{ color: 'var(--error)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Alergias</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {alergias.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Sin alergias registradas.</span>}
                  {alergias.map((a) => (
                    <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--error-container)', color: 'var(--on-error-container)', borderRadius: 999, padding: '5px 6px 5px 12px', fontSize: 12.5, fontWeight: 500 }}>
                      {a.alergia}
                      <Icon name="close" size={15} onClick={() => removeAlergia(a.id)} style={{ cursor: 'pointer' }} />
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={alergiaInput}
                    onChange={(e) => setAlergiaInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlergia(); } }}
                    placeholder="Agregar alergia…"
                    style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--outline-variant)', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, fontFamily: 'var(--font-body)', color: 'var(--on-surface)', background: 'var(--surface)', outline: 'none' }} />
                  <Button variant="filled" size="sm" icon="add" onClick={addAlergia} disabled={!alergiaInput.trim()}>Agregar</Button>
                </div>
              </div>
              </>
            )}
          </RailCard>

          {/* Signos vitales */}
          <RailCard icon="monitor_heart" title="Signos vitales">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Peso (kg)"      type="number" value={vitales.peso}    onChange={(v) => updVital('peso', v)} />
              <Field label="Estatura (cm)"  type="number" value={vitales.talla}   onChange={(v) => updVital('talla', v)} />
              <Field label="IMC"            value={imc?.value ?? ''} readOnly hint={imc?.hint} hintColor={imc?.color} tint={imc?.color} />
              <Field label="TA sistólica"   type="number" value={vitales.taSist}  onChange={(v) => updVital('taSist', v)} />
              <Field label="TA diastólica"  type="number" value={vitales.taDiast} onChange={(v) => updVital('taDiast', v)} />
              <Field label="FC (lpm)"       type="number" value={vitales.fc}      onChange={(v) => updVital('fc', v)} />
              <Field label="Temp (°C)"      type="number" value={vitales.temp}    onChange={(v) => updVital('temp', v)} />
              <Field label="FR (rpm)"       type="number" value={vitales.fr}      onChange={(v) => updVital('fr', v)} />
              <Field label="SpO₂ (%)"       type="number" value={vitales.spo2}    onChange={(v) => updVital('spo2', v)} />
              <Field label="Glucosa (mg/dL)" type="number" value={vitales.glucosa} onChange={(v) => updVital('glucosa', v)} />
              <Field label="Perímetro abd. (cm)" type="number" value={vitales.periAbdo}  onChange={(v) => updVital('periAbdo', v)} />
              <Field label="Grasa corporal (%)"  type="number" value={vitales.grasaPct}  onChange={(v) => updVital('grasaPct', v)} />
            </div>
          </RailCard>

          {/* Diagnósticos CIE-10 */}
          <RailCard icon="diagnosis" title="Diagnósticos (CIE-10)">
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 14px', background: 'var(--surface)' }}>
                <Icon name="search" size={20} style={{ color: 'var(--on-surface-variant)' }} />
                <input value={dxQuery} onChange={(e) => setDxQuery(e.target.value)} placeholder="Buscar por código o descripción…"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 14.5, fontFamily: 'var(--font-body)' }} />
              </div>
              {dxResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, padding: 6 }}>
                  {dxResults.map((c) => (
                    <button key={c.codigo} onClick={() => addDx(c)} className="state-layer" style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none',
                      cursor: 'pointer', padding: '9px 10px', borderRadius: 8, background: 'transparent', position: 'relative',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-primary-container)', background: 'var(--primary-container)', padding: '2px 7px', borderRadius: 6 }}>{c.codigo}</span>
                      <span style={{ fontSize: 13.5, color: 'var(--on-surface)' }}>{c.descripcion}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {diagnosticos.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Aún no se han agregado diagnósticos.</div>}
              {diagnosticos.map((d, i) => (
                <div key={d.code} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-primary)', background: 'var(--primary)', padding: '2px 7px', borderRadius: 6 }}>{d.code}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{d.label}</span>
                  {i === 0 && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--primary)', color: 'var(--on-primary)' }}>PRINCIPAL</span>}
                  <Icon name="close" size={18} onClick={() => removeDx(d.code)} style={{ cursor: 'pointer' }} />
                </div>
              ))}
            </div>
          </RailCard>
        </div>

        {/* Lienzo */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Motivo */}
          <Card variant="outlined" style={{ padding: '20px 22px', borderRadius: 20, borderColor: motivoErr ? 'var(--error)' : 'var(--outline-variant)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: motivoErr ? 'var(--error)' : 'var(--primary)', marginBottom: 6 }}>Motivo de consulta *</label>
            <input value={motivo} onChange={(e) => { setMotivo(e.target.value); setMotivoErr(false); setDirty(true); }}
              placeholder="Ej. Control de hipertensión, dolor abdominal de 3 días…"
              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 17, fontWeight: 500, fontFamily: 'var(--font-body)' }} />
            {motivoErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12.5, color: 'var(--error)' }}>
                <Icon name="error" size={16} />El motivo de consulta es obligatorio.
              </div>
            )}
          </Card>

          {/* Nota clínica */}
          <Card variant="outlined" style={{ borderRadius: 20, overflow: 'hidden', padding: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 12px' }}>
              <Icon name="edit_note" size={20} style={{ color: 'var(--primary)' }} />
              <span className="title-s" style={{ fontSize: 16 }}>Nota clínica</span>
              <span style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>Texto libre</span>
            </div>
            {/* Toolbar */}
            <div style={{ position: 'sticky', top: 80, zIndex: 5, display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', background: 'var(--surface-container-low)', borderTop: '1px solid var(--outline-variant)', borderBottom: '1px solid var(--outline-variant)' }}>
              {[['format_bold', 'bold'], ['format_italic', 'italic'], ['format_underlined', 'underline']].map(([ic, cmd]) => (
                <button key={cmd} onMouseDown={(e) => { e.preventDefault(); exec(cmd); }} style={toolBtn()}><Icon name={ic} size={20} /></button>
              ))}
              <div style={{ width: 1, height: 22, background: 'var(--outline-variant)', margin: '0 4px' }} />
              {[['format_list_bulleted', 'insertUnorderedList'], ['format_list_numbered', 'insertOrderedList']].map(([ic, cmd]) => (
                <button key={cmd} onMouseDown={(e) => { e.preventDefault(); exec(cmd); }} style={toolBtn()}><Icon name={ic} size={20} /></button>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ position: 'relative' }}>
                <Button variant="outlined" size="sm" icon="description" trailingIcon="arrow_drop_down" onClick={() => setPlantOpen(!plantillaOpen)}>Plantillas</Button>
                {plantillaOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, padding: 6, width: 260 }}>
                    {Object.keys(PLANTILLAS).map((k) => (
                      <button key={k} onMouseDown={(e) => { e.preventDefault(); insertHTML(PLANTILLAS[k]); }} className="state-layer" style={{
                        display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                        padding: '10px 12px', borderRadius: 8, background: 'transparent', color: 'var(--on-surface)',
                        fontFamily: 'var(--font-body)', fontSize: 14, position: 'relative',
                      }}>{k}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Editor */}
            <div style={{ padding: 16 }}>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Captura aquí la nota clínica completa: padecimiento actual, exploración física, impresión diagnóstica, plan e indicaciones…"
                onInput={() => setDirty(true)}
                className="consulta-editor"
                style={{
                  minHeight: 460, border: '1px solid var(--outline-variant)', borderRadius: 12,
                  padding: '18px 20px', fontSize: 15.5, lineHeight: 1.75, background: 'var(--surface)',
                  color: 'var(--on-surface)', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--on-surface-variant)' }}>
                <Icon name="info" size={15} />Las recetas formales se emiten desde la pestaña Recetas del expediente.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function pillStyle(): React.CSSProperties {
  return {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: 'none', cursor: 'pointer', background: 'var(--primary-container)', color: 'var(--on-primary-container)',
    borderRadius: 10, padding: 9, fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-body)', position: 'relative',
  };
}
function toolBtn(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent',
    color: 'var(--on-surface-variant)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}
