import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAccount } from '../context/AccountContext';
import { Switch, Select } from '../components';
import type { Especialidad } from '../lib/types';

// ─── Tipos locales ─────────────────────────────────────────────────────────────

interface ClinicaFull {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  correo_contacto: string | null;
  logo_url: string | null;
  rfc: string | null;
  clues: string | null;
}

interface MedicoDetalleFull {
  prefijo: string | null;
  cedula_profesional: string;
  universidad: string | null;
  especialidad_id: number | null;
}

type TabId = 'personal' | 'clinica' | 'profesional';

// ─── Inline SVGs (Feather/Heroicons style) ────────────────────────────────────

const IUser = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IPhone = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const IMail = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IBuilding = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
);
const IPin = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IDoc = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/>
  </svg>
);
const ISchool = ({ c = '#0d5c4e', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
);
const IHeartPulse = ({ c = '#0d5c4e', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);
const ISave = ({ c = '#fff', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
  </svg>
);
const ICheck = ({ c = '#fff', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IUpload = ({ c = '#0d5c4e', s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
);
const IGlobe = ({ c = '#0d5c4e', s = 26 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IEyeOff = ({ c = '#9ca3af', s = 11 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const IHome = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IChevron = ({ c = '#9ca3af', s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// ─── PField: campo de formulario con estilo handoff ───────────────────────────

const ITrash = ({ c = '#dc2626', s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const IPlus = ({ c = '#0d5c4e', s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

function PField({ label, value, onChange, type = 'text', placeholder, icon, fullWidth, readOnly, required, prefix }: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; icon?: React.ReactNode;
  fullWidth?: boolean; readOnly?: boolean; required?: boolean; prefix?: string;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused && !readOnly;
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>
        {label}{required && ' *'}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: active ? '1.5px solid #0d5c4e' : '1px solid #e5e9e7', borderRadius: 8, padding: '9px 13px', background: readOnly ? '#f3f4f6' : (active ? '#f6fdf9' : '#fafbfa'), transition: 'border-color .15s, background .15s' }}>
        {icon && <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>}
        {prefix && <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '13.5px', fontWeight: active ? 600 : 400, color: readOnly ? '#9ca3af' : (active ? '#0d5c4e' : (value ? '#374151' : '#9ca3af')), fontFamily: 'inherit', cursor: readOnly ? 'default' : 'text' }}
        />
      </div>
    </div>
  );
}

// ─── PSelect: select con estilo handoff ───────────────────────────────────────

function PSelect({ label, value, onChange, options, icon, fullWidth }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ReactNode; fullWidth?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== '';
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: focused ? '1.5px solid #0d5c4e' : '1px solid #e5e9e7', borderRadius: 8, padding: '9px 13px', background: focused ? '#f6fdf9' : '#fafbfa', transition: 'border-color .15s, background .15s' }}>
        {icon && <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>}
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '13.5px', fontWeight: (focused || hasValue) ? 600 : 400, color: (focused || hasValue) ? '#0d5c4e' : '#9ca3af', fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <IChevron />
      </div>
    </div>
  );
}

// ─── SaveBtn ──────────────────────────────────────────────────────────────────

function SaveBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0d5c4e', color: '#fff', fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'opacity .15s' }}
    >
      {children}
    </button>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export function Profile({ toast, refreshAccount }: { toast?: (m: string) => void; refreshAccount?: () => Promise<void> | void }) {
  const account  = useAccount();
  const fileRef  = useRef<HTMLInputElement>(null);
  const t        = (msg: string) => toast?.(msg);

  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('personal');
  const [clinica, setClinica]     = useState<ClinicaFull | null>(null);
  const [especialidades, setEsps] = useState<Especialidad[]>([]);

  // form – datos personales
  const [nombre,    setNombre]    = useState('');
  const [apellidoP, setApellidoP] = useState('');
  const [apellidoM, setApellidoM] = useState('');
  const [telefono,  setTelefono]  = useState('');

  // form – clínica
  const [cNombre,  setCNombre]  = useState('');
  const [cDir,     setCDir]     = useState('');
  const [cTel,     setCTel]     = useState('');
  const [cCorreo,  setCCorreo]  = useState('');
  const [cRfc,     setCRfc]     = useState('');
  const [cClues,   setCClues]   = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // form – médico
  const [tieneCedula,   setTieneCedula]   = useState(false);
  const [prefijo,       setPrefijo]       = useState('');
  const [cedula,        setCedula]        = useState('');
  const [universidad,   setUniversidad]   = useState('');
  const [especialidadId, setEspecialidadId] = useState('');
  // cédulas múltiples (medico_cedulas): id de la default espejada + adicionales
  const [defaultCedulaId, setDefaultCedulaId] = useState<string | null>(null);
  const [extraCedulas,    setExtraCedulas]    = useState<{ id: string | null; cedula: string; especialidad_id: string }[]>([]);
  const [savingExtras,    setSavingExtras]    = useState(false);

  // saving states
  const [savingP, setSavingP] = useState(false);
  const [savingC, setSavingC] = useState(false);
  const [savingM, setSavingM] = useState(false);

  // stats
  const [statPacientes, setStatPacientes] = useState<number | null>(null);
  const [statConsultas, setStatConsultas] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: pf } = await supabase
        .from('profiles')
        .select('nombre, apellido_paterno, apellido_materno, telefono')
        .eq('id', account.userId)
        .single<{ nombre: string | null; apellido_paterno: string | null; apellido_materno: string | null; telefono: string | null }>();
      setNombre(pf?.nombre ?? '');
      setApellidoP(pf?.apellido_paterno ?? '');
      setApellidoM(pf?.apellido_materno ?? '');
      setTelefono(pf?.telefono ?? '');

      if (account.clinicaId) {
        const [cliRes, pacRes, conRes] = await Promise.all([
          supabase.from('clinicas')
            .select('id, nombre, direccion, telefono, correo_contacto, logo_url, rfc, clues')
            .eq('id', account.clinicaId)
            .single<ClinicaFull>(),
          supabase.from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('clinica_id', account.clinicaId),
          supabase.from('consultas')
            .select('*', { count: 'exact', head: true })
            .eq('clinica_id', account.clinicaId),
        ]);

        if (cliRes.data) {
          const cli = cliRes.data;
          setClinica(cli);
          setCNombre(cli.nombre ?? '');
          setCDir(cli.direccion ?? '');
          setCTel(cli.telefono ?? '');
          setCCorreo(cli.correo_contacto ?? '');
          setCRfc(cli.rfc ?? '');
          setCClues(cli.clues ?? '');
        }
        setStatPacientes(pacRes.count ?? 0);
        setStatConsultas(conRes.count ?? 0);
      }

      const { data: md } = await supabase
        .from('medico_detalles')
        .select('prefijo, cedula_profesional, universidad, especialidad_id')
        .eq('profile_id', account.userId)
        .maybeSingle<MedicoDetalleFull>();
      if (md) {
        setTieneCedula(true);
        setPrefijo(md.prefijo ?? '');
        setCedula(md.cedula_profesional ?? '');
        setUniversidad(md.universidad ?? '');
        setEspecialidadId(md.especialidad_id ? String(md.especialidad_id) : '');
      }

      const { data: esps } = await supabase
        .from('especialidades')
        .select('id, nombre')
        .order('nombre');
      setEsps(esps ?? []);

      await reloadCedulas();
    } catch (e: any) {
      t('Error al cargar el perfil: ' + (e.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function savePersonal() {
    setSavingP(true);
    try {
      const { error } = await supabase.from('profiles').update({
        nombre:           nombre.trim() || null,
        apellido_paterno: apellidoP.trim() || null,
        apellido_materno: apellidoM.trim() || null,
        telefono:         telefono.trim() || null,
      }).eq('id', account.userId);
      if (error) throw error;
      await refreshAccount?.();
      t('Datos personales guardados');
    } catch (e: any) {
      t('Error: ' + (e.message ?? String(e)));
    } finally {
      setSavingP(false);
    }
  }

  async function saveClinica() {
    if (!account.clinicaId) return;
    setSavingC(true);
    try {
      let logo_url = clinica?.logo_url ?? null;

      if (logoFile) {
        const path = `${account.userId}/logo`;
        const { error: upErr } = await supabase.storage
          .from('logos')
          .upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
        logo_url = publicUrl;
        setLogoFile(null);
        setLogoPreview(null);
      }

      const { error } = await supabase.from('clinicas').update({
        nombre:           cNombre.trim(),
        direccion:        cDir.trim() || null,
        telefono:         cTel.trim() || null,
        correo_contacto:  cCorreo.trim() || null,
        rfc:              cRfc.trim().toUpperCase() || null,
        clues:            cClues.trim().toUpperCase() || null,
        logo_url,
      }).eq('id', account.clinicaId);
      if (error) throw error;

      setClinica(prev => prev ? { ...prev, logo_url } : prev);
      await refreshAccount?.();
      t('Datos de la clínica guardados');
    } catch (e: any) {
      t('Error: ' + (e.message ?? String(e)));
    } finally {
      setSavingC(false);
    }
  }

  // Recarga las cédulas (default + adicionales) desde medico_cedulas
  async function reloadCedulas() {
    const { data: ceds } = await supabase
      .from('medico_cedulas')
      .select('id, cedula, especialidad_id, es_default')
      .eq('profile_id', account.userId)
      .order('created_at');
    const list = ceds ?? [];
    const def = list.find((c: any) => c.es_default);
    setDefaultCedulaId(def?.id ?? null);
    setExtraCedulas(
      list.filter((c: any) => !c.es_default).map((c: any) => ({
        id: c.id, cedula: c.cedula, especialidad_id: c.especialidad_id ? String(c.especialidad_id) : '',
      }))
    );
  }

  async function saveMedico() {
    if (!cedula.trim()) { t('La cédula profesional es obligatoria'); return; }
    setSavingM(true);
    try {
      const { error } = await supabase.from('medico_detalles').upsert({
        profile_id:         account.userId,
        prefijo:            prefijo.trim() || null,
        cedula_profesional: cedula.trim(),
        universidad:        universidad.trim() || null,
        especialidad_id:    especialidadId ? Number(especialidadId) : null,
      }, { onConflict: 'profile_id' });
      if (error) throw error;

      // Mantén la cédula DEFAULT espejada en medico_cedulas (fuente de las cédulas múltiples)
      const defPayload = { cedula: cedula.trim(), especialidad_id: especialidadId ? Number(especialidadId) : null };
      if (defaultCedulaId) {
        await supabase.from('medico_cedulas').update(defPayload).eq('id', defaultCedulaId);
      } else {
        const { data: ins } = await supabase.from('medico_cedulas')
          .insert({ profile_id: account.userId, es_default: true, ...defPayload })
          .select('id').single();
        if (ins) setDefaultCedulaId((ins as any).id);
      }

      setTieneCedula(true);
      await refreshAccount?.();
      t(tieneCedula ? 'Perfil profesional actualizado' : '¡Perfil profesional registrado! Ya puedes crear pacientes y recetas.');
    } catch (e: any) {
      t('Error: ' + (e.message ?? String(e)));
    } finally {
      setSavingM(false);
    }
  }

  // ── Cédulas adicionales (otras especialidades) ───────────────────────────────
  function addExtra() {
    if (extraCedulas.length >= 2) { t('Máximo 3 cédulas en total (1 principal + 2 adicionales)'); return; }
    setExtraCedulas(prev => [...prev, { id: null, cedula: '', especialidad_id: '' }]);
  }
  function updateExtra(idx: number, field: 'cedula' | 'especialidad_id', value: string) {
    setExtraCedulas(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }
  async function removeExtra(idx: number) {
    const row = extraCedulas[idx];
    if (row.id) {
      const { error } = await supabase.from('medico_cedulas').delete().eq('id', row.id);
      if (error) { t('Error al eliminar: ' + error.message); return; }
      t('Cédula eliminada');
    }
    setExtraCedulas(prev => prev.filter((_, i) => i !== idx));
  }
  async function saveExtras() {
    setSavingExtras(true);
    try {
      for (const row of extraCedulas) {
        const ced = row.cedula.trim();
        if (!ced) continue; // ignora filas en blanco
        const payload = { cedula: ced, especialidad_id: row.especialidad_id ? Number(row.especialidad_id) : null };
        if (row.id) {
          const { error } = await supabase.from('medico_cedulas').update(payload).eq('id', row.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('medico_cedulas')
            .insert({ profile_id: account.userId, es_default: false, ...payload });
          if (error) throw error;
        }
      }
      await reloadCedulas();
      t('Cédulas adicionales guardadas');
    } catch (e: any) {
      t('Error: ' + (e.message ?? String(e)));
    } finally {
      setSavingExtras(false);
    }
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { t('El archivo supera 2 MB'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  // ── Derivados ───────────────────────────────────────────────────────────────

  const logoDisplay  = logoPreview ?? clinica?.logo_url ?? null;
  const nombreMostrado = [nombre, apellidoP, apellidoM].filter(Boolean).join(' ') || account.nombreCompleto;
  const rolLabel = account.rol === 'owner' ? 'Propietario' : account.rol === 'medico' ? 'Médico' : 'Asistente';
  const esOwnerOrMedico = account.rol === 'owner' || account.rol === 'medico';
  const espOptions = [
    { value: '', label: 'Sin especialidad' },
    ...especialidades.map(e => ({ value: String(e.id), label: e.nombre })),
  ];

  const tabStyle = (id: TabId): React.CSSProperties => ({
    padding: '12px 16px',
    fontSize: 13,
    fontWeight: activeTab === id ? 600 : 500,
    color: activeTab === id ? '#0d5c4e' : '#9ca3af',
    border: 'none',
    borderBottom: activeTab === id ? '2px solid #0d5c4e' : '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    letterSpacing: '0.1px',
    transition: 'color .15s, border-color .15s',
    fontFamily: 'inherit',
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #c8e6e0', borderTopColor: '#0d5c4e', animation: 'spin .8s linear infinite' }} />
    </div>
  );

  return (
    <div className="fade-up" style={{ minHeight: '100%', paddingBottom: 48 }}>
      <div style={{ width: 'min(100%, 680px)', margin: '0 auto', padding: '0 16px' }}>

        {/* Breadcrumb */}
        <div style={{ padding: '14px 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Cuenta</span>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>›</span>
          <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>Mi perfil</span>
        </div>

        {/* Banner: cédula faltante */}
        {!account.puedeEmitirClinico && esOwnerOrMedico && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style={{ flex: 1 }}>Completa tu perfil profesional para poder emitir recetas y consultas.</span>
            <button
              onClick={() => setActiveTab('profesional')}
              style={{ background: '#0d5c4e', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Ir al perfil profesional
            </button>
          </div>
        )}

        {/* ── Header card ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', overflow: 'hidden', marginBottom: 20 }}>
          {/* Gradient strip */}
          <div style={{ height: 5, background: 'linear-gradient(90deg, #0d5c4e 0%, #1a8c78 100%)' }} />

          <div style={{ padding: '24px 24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>

              {/* Avatar + online dot */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {logoDisplay
                  ? <img src={logoDisplay} alt="Logo" style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', background: '#d1ece7', border: '3px solid #e8f5f2' }} />
                  : <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#d1ece7', border: '3px solid #e8f5f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 22, fontWeight: 700, color: '#0d5c4e', letterSpacing: '-0.5px' }}>{account.iniciales}</span>
                    </div>
                }
                <div style={{ position: 'absolute', bottom: 2, right: 2, width: 13, height: 13, background: '#22c55e', borderRadius: '50%', border: '2px solid #fff' }} />
              </div>

              {/* Name + badge + rol */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>{nombreMostrado}</span>
                  {tieneCedula && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                      <svg width="6" height="6" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#16a34a" /></svg>
                      Médico registrado
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#9ca3af', fontSize: 13 }}>
                  <IHome />
                  <span>{rolLabel}{account.clinicaNombre ? ` · ${account.clinicaNombre}` : ''}</span>
                </div>
              </div>

              {/* Stat pills */}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {([
                  [statPacientes, 'Pacientes'],
                  [statConsultas, 'Consultas'],
                ] as [number | null, string][]).map(([n, label]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f8faf9', border: '1px solid #e5e9e7', borderRadius: 10, padding: '10px 18px' }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#0d5c4e', lineHeight: 1 }}>{n != null ? n : '—'}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontWeight: 500 }}>{label}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* Tab nav */}
          <div style={{ display: 'flex', borderTop: '1px solid #f3f4f6', padding: '0 24px' }}>
            <button style={tabStyle('personal')}    onClick={() => setActiveTab('personal')}>Datos personales</button>
            <button style={tabStyle('clinica')}     onClick={() => setActiveTab('clinica')}>Mi clínica</button>
            <button style={tabStyle('profesional')} onClick={() => setActiveTab('profesional')}>Perfil profesional</button>
          </div>
        </div>

        {/* ── Tab: Datos personales ── */}
        {activeTab === 'personal' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <IUser c="#0d5c4e" s={17} />
              <span style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>Datos personales</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <PField label="Nombre(s)" value={nombre} onChange={setNombre} icon={<IUser c="#0d5c4e" />} fullWidth required />
              <PField label="Apellido paterno" value={apellidoP} onChange={setApellidoP} />
              <PField label="Apellido materno"  value={apellidoM} onChange={setApellidoM} />
              <PField label="Teléfono"          value={telefono}  onChange={setTelefono}  icon={<IPhone />} type="tel" />
              <PField label="Correo electrónico" value={account.email ?? ''} icon={<IMail />} readOnly />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <SaveBtn onClick={savePersonal} disabled={savingP || !nombre.trim()}>
                <ISave />{savingP ? 'Guardando…' : 'Guardar'}
              </SaveBtn>
            </div>
          </div>
        )}

        {/* ── Tab: Mi clínica ── */}
        {activeTab === 'clinica' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <IBuilding c="#0d5c4e" s={17} />
              <span style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>Mi clínica</span>
            </div>

            {/* Logo block */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f8faf9', border: '1px solid #e5e9e7', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, background: '#e8f5f2', border: '1.5px solid #c8e6e0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                {logoDisplay
                  ? <img src={logoDisplay} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <IGlobe />
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Logo de la clínica</div>
                <div style={{ fontSize: 12.5, color: '#6b7280' }}>PNG / JPG · máx. 2 MB</div>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#0d5c4e', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #0d5c4e', cursor: 'pointer' }}
              >
                <IUpload />{logoDisplay ? 'Cambiar logo' : 'Subir logo'}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onLogoChange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <PField label="Nombre de la clínica" value={cNombre} onChange={setCNombre} icon={<IBuilding c="#0d5c4e" />} fullWidth required />
              <PField label="Dirección"             value={cDir}    onChange={setCDir}    icon={<IPin />}  fullWidth />
              <PField label="Teléfono"              value={cTel}    onChange={setCTel}    icon={<IPhone />} type="tel" />
              <PField label="Correo de contacto"    value={cCorreo} onChange={setCCorreo} icon={<IMail />}  type="email" />
              <PField label="RFC del establecimiento" value={cRfc}   onChange={setCRfc}   icon={<IDoc />}  placeholder="XAXX010101000" />
              <PField label="CLUES"                   value={cClues} onChange={setCClues} prefix="#"       placeholder="OCSSA0000000" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <SaveBtn onClick={saveClinica} disabled={savingC || !account.clinicaId || !cNombre.trim()}>
                <ISave />{savingC ? 'Guardando…' : 'Guardar'}
              </SaveBtn>
            </div>
          </div>
        )}

        {/* ── Tab: Perfil profesional ── */}
        {activeTab === 'profesional' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e9e7', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IDoc c="#0d5c4e" s={17} />
                <span style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>
                  {tieneCedula ? 'Perfil profesional' : '¿Eres médico? Registra tu perfil profesional'}
                </span>
              </div>
              {tieneCedula && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                    <svg width="6" height="6" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#16a34a" /></svg>
                    Médico activo
                  </span>
                  <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', color: '#6b7280', fontSize: 12.5, fontWeight: 500, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e9e7', cursor: 'default' }}>
                    <IEyeOff />
                    Activo
                  </button>
                </div>
              )}
            </div>

            {!tieneCedula && (
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                Al registrar tu cédula podrás crear consultas y emitir recetas desde esta cuenta.
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 16 }}>
              <PField label="Prefijo"              value={prefijo}    onChange={setPrefijo}    placeholder="Dr., Dra.…" />
              <PField label="Cédula profesional"   value={cedula}     onChange={setCedula}     icon={<IDoc />} required />
              <PField label="Universidad / institución" value={universidad} onChange={setUniversidad} icon={<ISchool />} fullWidth />
              <PSelect label="Especialidad" value={especialidadId} onChange={setEspecialidadId} options={espOptions} icon={<IHeartPulse />} fullWidth />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <SaveBtn onClick={saveMedico} disabled={savingM || !cedula.trim()}>
                <ICheck />{savingM ? 'Guardando…' : tieneCedula ? 'Actualizar' : 'Registrarme como médico'}
              </SaveBtn>
            </div>

            {tieneCedula && (
              <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid #e5e9e7' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0d3d2e' }}>Otras cédulas / especialidades</h3>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{1 + extraCedulas.length} / 3</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 16 }}>
                  Si tienes cédulas adicionales por otras especialidades, agrégalas aquí (hasta 2 más). La principal es la de arriba.
                </p>

                {extraCedulas.length === 0 && (
                  <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>Aún no has agregado cédulas adicionales.</p>
                )}

                {extraCedulas.map((row, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
                    <PField label={`Cédula ${idx + 2}`} value={row.cedula} onChange={v => updateExtra(idx, 'cedula', v)} icon={<IDoc />} />
                    <PSelect label="Especialidad" value={row.especialidad_id} onChange={v => updateExtra(idx, 'especialidad_id', v)} options={espOptions} icon={<IHeartPulse />} />
                    <button onClick={() => removeExtra(idx)} title="Eliminar cédula" style={{ height: 40, width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fecaca', background: '#fff5f5', borderRadius: 8, cursor: 'pointer' }}>
                      <ITrash />
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={addExtra} disabled={extraCedulas.length >= 2}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: extraCedulas.length >= 2 ? '#9ca3af' : '#0d5c4e', border: `1px solid ${extraCedulas.length >= 2 ? '#e5e9e7' : '#0d5c4e'}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: extraCedulas.length >= 2 ? 'not-allowed' : 'pointer' }}>
                    <IPlus c={extraCedulas.length >= 2 ? '#9ca3af' : '#0d5c4e'} /> Agregar otra cédula
                  </button>
                  <SaveBtn onClick={saveExtras} disabled={savingExtras}>
                    <ICheck />{savingExtras ? 'Guardando…' : 'Guardar cédulas'}
                  </SaveBtn>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingRow({ icon, title, desc, control, last }: {
  icon: string; title: string; desc: string; control: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--outline-variant)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span className="ms" style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--on-surface)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>{desc}</div>
      </div>
      {control}
    </div>
  );
}

// Encabezado de sección dentro de cada tab de Configuración
function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
      <span className="ms" style={{ fontSize: 21, color: 'var(--primary)' }}>{icon}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>{title}</span>
    </div>
  );
}

export function Settings({ theme, setTheme, onLogout, navStyle, setNavStyle }: {
  theme: string;
  setTheme: (t: string) => void;
  onLogout: () => void;
  navStyle: string;
  setNavStyle: (s: string) => void;
}) {
  const [tab,         setTab]         = useState('apariencia');
  const [notif,       setNotif]       = useState(true);
  const [emailNotif,  setEmailNotif]  = useState(true);
  const [twoFa,       setTwoFa]       = useState(false);
  const [lang,        setLang]        = useState('Español');
  const [logoutHover, setLogoutHover] = useState(false);

  const TABS = [
    { key: 'apariencia', label: 'Apariencia',             icon: 'palette' },
    { key: 'notif',      label: 'Notificaciones',         icon: 'notifications' },
    { key: 'seguridad',  label: 'Seguridad y privacidad', icon: 'security' },
    { key: 'cuenta',     label: 'Cuenta',                 icon: 'manage_accounts' },
  ];

  return (
    <div className="page-pad fade-up" style={{ maxWidth: 780, margin: '0 auto', width: '100%' }}>
      {/* Encabezado de la página (fuera de la tarjeta) */}
      <h1 className="headline-l" style={{ letterSpacing: '-.3px', marginBottom: 6 }}>Configuración</h1>
      <p className="body-m" style={{ color: 'var(--on-surface-variant)', margin: '0 0 28px' }}>
        Administra tu apariencia, notificaciones, seguridad y cuenta
      </p>

      {/* Tarjeta principal — sin overflow:hidden (el indicador de tab usa margin-bottom:-1) */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--outline-variant)', padding: '0 20px', overflowX: 'auto' }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '18px 14px', marginBottom: -1,
                  border: 'none', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14,
                  color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
                  borderBottom: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
                  transition: 'color .18s',
                }}
              >
                <span className="ms" style={{ fontSize: 18 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Contenido del tab activo */}
        <div style={{ padding: '32px 36px', minHeight: 280 }}>

          {tab === 'apariencia' && (
            <>
              <SectionHead icon="palette" title="Apariencia" />
              <SettingRow icon="dark_mode" title="Tema oscuro" desc="Cambia entre modo día y noche"
                control={<Switch checked={theme === 'dark'} onChange={(v: boolean) => setTheme(v ? 'dark' : 'light')} />} />
              <SettingRow icon="menu" title="Navegación" desc="Elige entre barra superior o barra lateral"
                control={<Select value={navStyle === 'topnav' ? 'Navbar superior' : 'Barra lateral'} onChange={(v: string) => setNavStyle(v === 'Navbar superior' ? 'topnav' : 'sidebar')} options={['Navbar superior', 'Barra lateral']} style={{ width: 170 }} />} />
              <SettingRow icon="translate" title="Idioma" desc="Idioma de la interfaz" last
                control={<Select value={lang} onChange={setLang} options={['Español', 'English', 'Français', 'Português']} style={{ width: 160 }} />} />
            </>
          )}

          {tab === 'notif' && (
            <>
              <SectionHead icon="notifications" title="Notificaciones" />
              <SettingRow icon="notifications_active" title="Notificaciones push" desc="Recordatorios de citas y alertas"
                control={<Switch checked={notif} onChange={setNotif} />} />
              <SettingRow icon="mail" title="Resumen por correo" desc="Recibe tu agenda diaria por email" last
                control={<Switch checked={emailNotif} onChange={setEmailNotif} />} />
            </>
          )}

          {tab === 'seguridad' && (
            <>
              <SectionHead icon="security" title="Seguridad y privacidad" />
              <SettingRow icon="verified_user" title="Autenticación en dos pasos" desc="Protege tu cuenta con un segundo factor"
                control={<Switch checked={twoFa} onChange={setTwoFa} />} />
              <SettingRow icon="verified" title="Cumplimiento NOM-024" desc="Expediente clínico electrónico certificado"
                control={<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-container)', padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>Activo</span>} />
              <SettingRow icon="manage_history" title="Registro de actividad" desc="Auditoría de accesos al expediente" last
                control={<button style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Ver</button>} />
            </>
          )}

          {tab === 'cuenta' && (
            <>
              <SectionHead icon="manage_accounts" title="Cuenta" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, border: '1.5px solid var(--error-container, #ffd0c8)', borderRadius: 16, padding: '20px 24px', background: 'var(--surface-container-lowest)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--error-container, #ffebe6)', color: 'var(--error)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="ms" style={{ fontSize: 20 }}>logout</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--on-surface)' }}>Cerrar sesión</div>
                  <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>Salir de tu cuenta en este dispositivo</div>
                </div>
                <button
                  onClick={onLogout}
                  onMouseEnter={() => setLogoutHover(true)}
                  onMouseLeave={() => setLogoutHover(false)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 'var(--r-full)',
                    border: '1.5px solid var(--error)', padding: '0 20px', height: 38, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                    background: logoutHover ? 'var(--error)' : 'transparent',
                    color: logoutHover ? 'var(--on-error)' : 'var(--error)',
                    transition: 'background .18s, color .18s', whiteSpace: 'nowrap',
                  }}
                >
                  <span className="ms" style={{ fontSize: 18 }}>logout</span>
                  Cerrar sesión
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
