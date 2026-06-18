import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAccount } from '../context/AccountContext';
import {
  Icon, Button, Card, Avatar, TextField, Select,
  SectionHeader, Divider, Chip, Switch,
} from '../components';
import type { Especialidad } from '../lib/types';

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface ClinicaFull {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  correo_contacto: string | null;
  logo_url: string | null;
}

interface MedicoDetalleFull {
  prefijo: string | null;
  cedula_profesional: string;
  universidad: string | null;
  especialidad_id: number | null;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export function Profile({ toast, refreshAccount }: { toast?: (m: string) => void; refreshAccount?: () => Promise<void> | void }) {
  const account  = useAccount();
  const fileRef  = useRef<HTMLInputElement>(null);
  const t        = (msg: string) => toast?.(msg);

  const [loading, setLoading]       = useState(true);
  const [clinica, setClinica]       = useState<ClinicaFull | null>(null);
  const [especialidades, setEsps]   = useState<Especialidad[]>([]);

  // form – datos personales
  const [nombre,     setNombre]     = useState('');
  const [apellidoP,  setApellidoP]  = useState('');
  const [apellidoM,  setApellidoM]  = useState('');
  const [telefono,   setTelefono]   = useState('');

  // form – clínica
  const [cNombre,  setCNombre]  = useState('');
  const [cDir,     setCDir]     = useState('');
  const [cTel,     setCTel]     = useState('');
  const [cCorreo,  setCCorreo]  = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // form – médico
  const [medicoOpen,    setMedicoOpen]    = useState(false);
  const [tieneCedula,   setTieneCedula]   = useState(false);
  const [prefijo,       setPrefijo]       = useState('');
  const [cedula,        setCedula]        = useState('');
  const [universidad,   setUniversidad]   = useState('');
  const [especialidadId, setEspecialidadId] = useState('');

  // saving states
  const [savingP, setSavingP] = useState(false);
  const [savingC, setSavingC] = useState(false);
  const [savingM, setSavingM] = useState(false);

  // stats
  const [statPacientes,  setStatPacientes]  = useState<number | null>(null);
  const [statConsultas,  setStatConsultas]  = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Perfil (telefono no está en AccountContext, lo cargamos aparte)
      const { data: pf } = await supabase
        .from('profiles')
        .select('nombre, apellido_paterno, apellido_materno, telefono')
        .eq('id', account.userId)
        .single<{ nombre: string | null; apellido_paterno: string | null; apellido_materno: string | null; telefono: string | null }>();
      setNombre(pf?.nombre ?? '');
      setApellidoP(pf?.apellido_paterno ?? '');
      setApellidoM(pf?.apellido_materno ?? '');
      setTelefono(pf?.telefono ?? '');

      // Clínica + stats
      if (account.clinicaId) {
        const [cliRes, pacRes, conRes] = await Promise.all([
          supabase.from('clinicas')
            .select('id, nombre, direccion, telefono, correo_contacto, logo_url')
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
        }
        setStatPacientes(pacRes.count ?? 0);
        setStatConsultas(conRes.count ?? 0);
      }

      // Médico detalles
      const { data: md } = await supabase
        .from('medico_detalles')
        .select('prefijo, cedula_profesional, universidad, especialidad_id')
        .eq('profile_id', account.userId)
        .maybeSingle<MedicoDetalleFull>();
      if (md) {
        setTieneCedula(true);
        setMedicoOpen(true);
        setPrefijo(md.prefijo ?? '');
        setCedula(md.cedula_profesional ?? '');
        setUniversidad(md.universidad ?? '');
        setEspecialidadId(md.especialidad_id ? String(md.especialidad_id) : '');
      }

      // Catálogo especialidades
      const { data: esps } = await supabase
        .from('especialidades')
        .select('id, nombre')
        .order('nombre');
      setEsps(esps ?? []);
    } catch (e: any) {
      t('Error al cargar el perfil: ' + (e.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ── Guardados ───────────────────────────────────────────────────────────────

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

  async function saveMedico() {
    if (!cedula.trim()) { t('La cédula profesional es obligatoria'); return; }
    setSavingM(true);
    try {
      const { error } = await supabase.from('medico_detalles').upsert({
        profile_id:          account.userId,
        prefijo:             prefijo.trim() || null,
        cedula_profesional:  cedula.trim(),
        universidad:         universidad.trim() || null,
        especialidad_id:     especialidadId ? Number(especialidadId) : null,
      }, { onConflict: 'profile_id' });
      if (error) throw error;
      setTieneCedula(true);
      await refreshAccount?.();   // actualiza puedeEmitirClinico en todo el app sin re-login
      t(tieneCedula ? 'Perfil profesional actualizado' : '¡Perfil profesional registrado! Ya puedes crear pacientes y recetas.');
    } catch (e: any) {
      t('Error: ' + (e.message ?? String(e)));
    } finally {
      setSavingM(false);
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { t('El archivo supera 2 MB'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  // ── Derivados visuales ──────────────────────────────────────────────────────

  const logoDisplay    = logoPreview ?? clinica?.logo_url ?? null;
  const nombreMostrado = [nombre, apellidoP, apellidoM].filter(Boolean).join(' ') || account.nombreCompleto;
  const espOptions     = [
    { value: '', label: 'Sin especialidad' },
    ...especialidades.map(e => ({ value: String(e.id), label: e.nombre })),
  ];
  const esOwnerOrMedico = account.rol === 'owner' || account.rol === 'medico';
  const rolLabel = account.rol === 'owner' ? 'Propietario' : account.rol === 'medico' ? 'Médico' : 'Asistente';

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="page-pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
    </div>
  );

  return (
    <div className="page-pad fade-up" style={{ maxWidth: 980 }}>
      <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginBottom: 20 }}>Mi perfil</h1>

      {/* Banner: cédula faltante */}
      {!account.puedeEmitirClinico && esOwnerOrMedico && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--warning-container)', color: 'var(--on-warning-container)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 18 }}>
          <Icon name="warning" size={22} fill />
          <span className="body-m" style={{ flex: 1 }}>
            Completa tu perfil profesional para poder emitir recetas y consultas.
          </span>
          <Button variant="tonal" size="sm" onClick={() => {
            setMedicoOpen(true);
            setTimeout(() => document.getElementById('seccion-medico')?.scrollIntoView({ behavior: 'smooth' }), 50);
          }}>
            Ir al perfil profesional
          </Button>
        </div>
      )}

      {/* ── Header ── */}
      <Card variant="elevated" style={{ overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ height: 120, background: 'linear-gradient(120deg, #00504A, #1E847A)' }} />
        <div style={{ padding: '0 28px 26px', marginTop: -42 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            {logoDisplay
              ? <img src={logoDisplay} alt="Logo" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--surface-container-low)', background: 'var(--surface-container)' }} />
              : <Avatar initials={account.iniciales} color="#00796B" size={96} fontSize={36} style={{ border: '4px solid var(--surface-container-low)' }} />
            }
            <div style={{ flex: 1, minWidth: 200, paddingBottom: 6 }}>
              <h2 className="headline-m" style={{ letterSpacing: '-.5px' }}>{nombreMostrado}</h2>
              <div className="body-l" style={{ color: 'var(--on-surface-variant)' }}>
                {rolLabel}{account.clinicaNombre ? ` · ${account.clinicaNombre}` : ''}
              </div>
              {tieneCedula && (
                <div style={{ marginTop: 6 }}>
                  <Chip label="Médico registrado" icon="verified" selected color="var(--success-container)" size="sm" />
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 24 }}>
            {([
              ['groups',          statPacientes != null ? String(statPacientes) : '—', 'Pacientes'],
              ['event_available', statConsultas != null ? String(statConsultas) : '—', 'Consultas'],
            ] as const).map(([ic, n, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-container-highest)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={ic} size={22} fill />
                </div>
                <div>
                  <div className="title-l" style={{ fontWeight: 800 }}>{n}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Grid: personal + clínica ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, marginBottom: 18 }} className="dash-grid">

        {/* Datos personales */}
        <Card variant="elevated" style={{ padding: 24 }}>
          <SectionHeader title="Datos personales" icon="person" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField label="Nombre(s)" value={nombre} onChange={setNombre} icon="badge" required />
            <TextField label="Apellido paterno" value={apellidoP} onChange={setApellidoP} />
            <TextField label="Apellido materno"  value={apellidoM} onChange={setApellidoM} />
            <TextField label="Teléfono" value={telefono} onChange={setTelefono} icon="phone" type="tel" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--outline-variant)' }}>
              <span className="body-m" style={{ color: 'var(--on-surface-variant)' }}>Correo</span>
              <span className="title-s">{account.email}</span>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="save" onClick={savePersonal} disabled={savingP || !nombre.trim()}>
              {savingP ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Card>

        {/* Datos de la clínica */}
        <Card variant="elevated" style={{ padding: 24 }}>
          <SectionHeader title="Mi clínica" icon="local_hospital" />

          {/* Logo upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            {logoDisplay
              ? <img src={logoDisplay} alt="Logo" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--outline-variant)' }} />
              : <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--surface-container-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--outline)', flexShrink: 0 }}>
                  <Icon name="add_photo_alternate" size={28} style={{ color: 'var(--on-surface-variant)' }} />
                </div>
            }
            <div>
              <Button variant="outlined" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                {logoDisplay ? 'Cambiar logo' : 'Subir logo'}
              </Button>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>PNG / JPG · máx 2 MB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={onLogoChange} />
          </div>
          <Divider style={{ marginBottom: 16 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <TextField label="Nombre de la clínica" value={cNombre} onChange={setCNombre} icon="business" required />
            <TextField label="Dirección"             value={cDir}    onChange={setCDir}    icon="location_on" />
            <TextField label="Teléfono"              value={cTel}    onChange={setCTel}    icon="phone" type="tel" />
            <TextField label="Correo de contacto"    value={cCorreo} onChange={setCCorreo} icon="mail" type="email" />
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="filled" icon="save" onClick={saveClinica} disabled={savingC || !account.clinicaId || !cNombre.trim()}>
              {savingC ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Perfil profesional ── */}
      <div id="seccion-medico">
        <Card variant="elevated" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: medicoOpen ? 20 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="medical_information" size={22} style={{ color: 'var(--primary)' }} />
              <h3 className="title-l" style={{ color: 'var(--on-surface)' }}>
                {tieneCedula ? 'Perfil profesional' : '¿Eres médico? Registra tu perfil profesional'}
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {tieneCedula && <Chip label="Médico activo" icon="verified" selected color="var(--success-container)" size="sm" />}
              <Button
                variant={medicoOpen ? 'text' : 'tonal'} size="sm"
                icon={medicoOpen ? 'expand_less' : 'expand_more'}
                onClick={() => setMedicoOpen(!medicoOpen)}
              >
                {medicoOpen ? 'Ocultar' : tieneCedula ? 'Editar' : 'Completar'}
              </Button>
            </div>
          </div>

          {!medicoOpen && !tieneCedula && (
            <p className="body-m" style={{ color: 'var(--on-surface-variant)', marginTop: 4 }}>
              Al registrar tu cédula podrás crear consultas y emitir recetas desde esta cuenta.
            </p>
          )}

          {medicoOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14 }}>
                <TextField label="Prefijo"              value={prefijo}  onChange={setPrefijo}  placeholder="Dr., Dra.…" />
                <TextField label="Cédula profesional *" value={cedula}   onChange={setCedula}   icon="badge" required />
              </div>
              <TextField label="Universidad / institución" value={universidad} onChange={setUniversidad} icon="school" />
              <Select
                label="Especialidad"
                value={especialidadId}
                onChange={setEspecialidadId}
                options={espOptions}
                icon="local_hospital"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <Button variant="filled" icon={tieneCedula ? 'save' : 'how_to_reg'} onClick={saveMedico} disabled={savingM || !cedula.trim()}>
                  {savingM ? 'Guardando…' : tieneCedula ? 'Actualizar' : 'Registrarme como médico'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
// (sin cambios respecto al original — usa mock temporal hasta que
//  se decida conectar notificaciones / 2FA reales)

function SettingRow({ icon, title, desc, control }: {
  icon: string; title: string; desc: string; control: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--outline-variant)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-container-highest)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title-s">{title}</div>
        <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 2 }}>{desc}</div>
      </div>
      {control}
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
  const [notif,      setNotif]      = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [twoFa,      setTwoFa]      = useState(false);
  const [lang,       setLang]       = useState('Español');

  const sections = [
    { title: 'Apariencia', icon: 'palette', rows: [
      { icon: 'dark_mode', title: 'Tema oscuro', desc: 'Cambia entre modo día y noche',
        control: <Switch checked={theme === 'dark'} onChange={(v: boolean) => setTheme(v ? 'dark' : 'light')} /> },
      { icon: 'nav_bar', title: 'Navegación', desc: 'Elige entre barra superior o barra lateral',
        control: <Select value={navStyle === 'topnav' ? 'Navbar superior' : 'Barra lateral'} onChange={(v: string) => setNavStyle(v === 'Navbar superior' ? 'topnav' : 'sidebar')} options={['Navbar superior', 'Barra lateral']} style={{ width: 170 }} /> },
      { icon: 'translate', title: 'Idioma', desc: 'Idioma de la interfaz',
        control: <Select value={lang} onChange={setLang} options={['Español', 'English']} style={{ width: 150 }} /> },
    ]},
    { title: 'Notificaciones', icon: 'notifications', rows: [
      { icon: 'notifications_active', title: 'Notificaciones push', desc: 'Recordatorios de citas y alertas',  control: <Switch checked={notif}      onChange={setNotif}      /> },
      { icon: 'mail',                 title: 'Resumen por correo',  desc: 'Recibe tu agenda diaria por email', control: <Switch checked={emailNotif} onChange={setEmailNotif} /> },
    ]},
    { title: 'Seguridad y privacidad', icon: 'security', rows: [
      { icon: 'encrypted', title: 'Autenticación en dos pasos', desc: 'Protege tu cuenta con un segundo factor', control: <Switch checked={twoFa} onChange={setTwoFa} /> },
      { icon: 'gpp_good', title: 'Cumplimiento NOM-024', desc: 'Expediente clínico electrónico certificado',
        control: <Chip label="Activo" icon="check" selected color="var(--success-container)" /> },
      { icon: 'history', title: 'Registro de actividad', desc: 'Auditoría de accesos al expediente',
        control: <Button variant="text" size="sm">Ver</Button> },
    ]},
  ];

  return (
    <div className="page-pad fade-up" style={{ maxWidth: 820 }}>
      <h1 className="headline-l" style={{ letterSpacing: '-.5px', marginBottom: 6 }}>Configuración</h1>
      <p className="body-m" style={{ color: 'var(--on-surface-variant)', marginBottom: 24 }}>Administra tu cuenta, preferencias y seguridad</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sections.map((s) => (
          <Card key={s.title} variant="elevated" style={{ padding: '20px 24px' }}>
            <SectionHeader title={s.title} icon={s.icon} />
            {s.rows.map((r, i) => <SettingRow key={i} {...r} />)}
          </Card>
        ))}
        <Card variant="outlined" style={{ padding: '20px 24px' }}>
          <SectionHeader title="Zona de cuenta" icon="manage_accounts" />
          <SettingRow
            icon="logout"
            title="Cerrar sesión"
            desc="Salir de tu cuenta en este dispositivo"
            control={
              <Button variant="outlined" icon="logout" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={onLogout}>
                Cerrar sesión
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  );
}
