import { useState, useEffect } from 'react';
import { Component } from 'react';
import { supabase } from './lib/supabase';
import { loadAccountContext, type AccountContext } from './lib/db';
import { AccountCtx } from './context/AccountContext';
import { Icon, Button, IconButton, FAB, Avatar, Divider, Snackbar } from './components';
import { Login, BrandMark } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Calendar } from './pages/Calendar';
import { PatientList, PatientRecord } from './pages/Patients';
import { Prescriptions, Reports, AppointmentModal, ReportModal, PatientModal } from './pages/Clinical';
import { Consulta } from './pages/Consulta';
import { Receta } from './pages/Receta';
import { Informe } from './pages/Informe';
import { Laboratorio } from './pages/Laboratorio';
import { Profile, Settings } from './pages/Profile';

// URL del onboarding (donde el usuario completa alta + tenant).
const ONBOARDING_URL = 'https://medsaasr.web.app/';

const ROL_LABEL: Record<string, string> = {
  owner: 'Propietario',
  medico: 'Médico',
  asistente: 'Asistente',
};

// Color de avatar determinista por id de usuario (no hay columna de color en el esquema).
const AVATAR_COLORS = ['#006A60', '#3F6375', '#7A5AE0', '#1E6E52', '#8A5A00', '#6750A4', '#00696D', '#984061'];
function avatarColor(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Identidad mostrada en el shell — todo sale del perfil real de Supabase.
function doctorFromAccount(account: AccountContext | null) {
  if (!account) return { name: 'Usuario', specialty: '', email: '', initials: '··', color: AVATAR_COLORS[0] };
  return {
    name: account.nombreCompleto,
    specialty: account.clinicaNombre || ROL_LABEL[account.rol ?? ''] || 'Clínica',
    email: account.email,
    initials: account.iniciales,
    color: avatarColor(account.userId),
  };
}

const NAV = [
  { key: 'dashboard',    label: 'Inicio',        icon: 'space_dashboard' },
  { key: 'calendar',     label: 'Agenda',         icon: 'calendar_month' },
  { key: 'patients',     label: 'Pacientes',      icon: 'groups' },
  { key: 'prescriptions',label: 'Recetas',        icon: 'prescriptions' },
  { key: 'reports',      label: 'Informes',       icon: 'description' },
];
const NAV2 = [
  { key: 'profile',  label: 'Mi perfil',     icon: 'account_circle' },
  { key: 'settings', label: 'Configuración', icon: 'settings' },
];

/* ---------- Sidebar ---------- */
function Sidebar({ route, go, collapsed, setCollapsed, onLogout, doctor }) {
  const NavItem = ({ item }) => {
    const active = route.name === item.key || (item.key === 'patients' && route.name === 'patient');
    return (
      <button onClick={() => go(item.key)} className="state-layer" title={collapsed ? item.label : ''} style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', height: 52,
        padding: collapsed ? 0 : '0 16px', justifyContent: collapsed ? 'center' : 'flex-start',
        border: 'none', cursor: 'pointer', position: 'relative', borderRadius: 'var(--r-full)',
        background: active ? 'var(--secondary-container)' : 'transparent',
        color: active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
      }}>
        <Icon name={item.icon} size={24} fill={active} />
        {!collapsed && <span>{item.label}</span>}
      </button>
    );
  };

  return (
    <aside style={{
      width: collapsed ? 84 : 264, flexShrink: 0, background: 'var(--surface-container-low)', height: '100%',
      display: 'flex', flexDirection: 'column', padding: collapsed ? '16px 14px' : '16px 18px',
      borderRight: '1px solid var(--outline-variant)', transition: 'width .25s cubic-bezier(.2,0,0,1)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: collapsed ? 0 : '0 6px', justifyContent: collapsed ? 'center' : 'space-between', marginBottom: 12, flexShrink: 0 }}>
        {!collapsed && <BrandMark size={36} />}
        <IconButton name={collapsed ? 'menu' : 'menu_open'} onClick={() => setCollapsed(!collapsed)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map((i) => <NavItem key={i.key} item={i} />)}
      </div>
      <Divider style={{ margin: '14px 6px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV2.map((i) => <NavItem key={i.key} item={i} />)}
      </div>

      <div style={{ flex: 1 }} />

      {!collapsed ? (
        <div style={{ background: 'var(--surface-container-high)', borderRadius: 'var(--r-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Avatar initials={doctor.initials} color={doctor.color} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="title-s" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doctor.name}</div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doctor.specialty}</div>
          </div>
          <IconButton name="logout" tooltip="Cerrar sesión" onClick={onLogout} />
        </div>
      ) : (
        <IconButton name="logout" tooltip="Cerrar sesión" onClick={onLogout} style={{ alignSelf: 'center', flexShrink: 0 }} />
      )}
    </aside>
  );
}

/* ---------- Top nav ---------- */
function TopNav({ route, go, theme, setTheme, openProfileMenu, doctor }) {
  return (
    <header style={{ height: 68, flexShrink: 0, background: 'var(--surface-container-low)', borderBottom: '1px solid var(--outline-variant)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px' }}>
      <BrandMark size={36} />
      <nav className="topnav-items" style={{ display: 'flex', gap: 2, marginLeft: 28, flex: 1 }}>
        {NAV.map((i) => {
          const active = route.name === i.key || (i.key === 'patients' && route.name === 'patient');
          return (
            <button key={i.key} onClick={() => go(i.key)} className="state-layer" style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px',
              borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', position: 'relative',
              background: active ? 'var(--secondary-container)' : 'transparent',
              color: active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
            }}>
              <Icon name={i.icon} size={20} fill={active} />{i.label}
            </button>
          );
        })}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton name="search" tooltip="Buscar" />
        <IconButton name={theme === 'dark' ? 'light_mode' : 'dark_mode'} tooltip="Tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        <IconButton name="notifications" tooltip="Notificaciones" />
        <div onClick={openProfileMenu} style={{ cursor: 'pointer', marginLeft: 4 }}>
          <Avatar initials={doctor.initials} color={doctor.color} size={40} />
        </div>
      </div>
    </header>
  );
}

/* ---------- App bar (sidebar layout) ---------- */
function AppBar({ theme, setTheme, onMenu, openProfileMenu, doctor }) {
  const [q, setQ] = useState('');
  return (
    <header style={{ height: 72, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--outline-variant)' }}>
      <IconButton name="menu" onClick={onMenu} className="mobile-menu-btn" />
      <div className="appbar-search" style={{ flex: 1, maxWidth: 460, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-container-high)', borderRadius: 'var(--r-full)', padding: '0 18px', height: 46 }}>
        <Icon name="search" size={22} style={{ color: 'var(--on-surface-variant)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pacientes, citas, recetas…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 14.5, fontFamily: 'var(--font-body)' }} />
        <kbd style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface-variant)', background: 'var(--surface-container-highest)', padding: '2px 7px', borderRadius: 6 }}>⌘K</kbd>
      </div>
      <div style={{ flex: 1 }} />
      <IconButton name={theme === 'dark' ? 'light_mode' : 'dark_mode'} tooltip="Tema día/noche" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      <div style={{ position: 'relative' }}>
        <IconButton name="notifications" tooltip="Notificaciones" />
        <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--error)', border: '2px solid var(--surface)' }} />
      </div>
      <Divider style={{ width: 1, height: 32 }} />
      <div onClick={openProfileMenu} className="state-layer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 4px 4px', borderRadius: 'var(--r-full)', cursor: 'pointer' }}>
        <Avatar initials={doctor.initials} color={doctor.color} size={40} />
        <div className="appbar-user" style={{ lineHeight: 1.15 }}>
          <div className="title-s">{doctor.name}</div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{doctor.specialty}</div>
        </div>
        <Icon name="expand_more" size={20} style={{ color: 'var(--on-surface-variant)' }} />
      </div>
    </header>
  );
}

/* ---------- Profile menu ---------- */
function ProfileMenu({ open, onClose, go, theme, setTheme, onLogout, doctor }) {
  if (!open) return null;
  const items = [
    ['account_circle', 'Mi perfil',       () => { go('profile');  onClose(); }],
    ['settings',       'Configuración',   () => { go('settings'); onClose(); }],
    [theme === 'dark' ? 'light_mode' : 'dark_mode', theme === 'dark' ? 'Modo día' : 'Modo noche', () => setTheme(theme === 'dark' ? 'light' : 'dark')],
    ['help',           'Ayuda y soporte', onClose],
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900 }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: 70, right: 24, width: 280,
        background: 'var(--surface-container-high)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--elev-3)', padding: 8, animation: 'scaleIn .18s ease', transformOrigin: 'top right',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
          <Avatar initials={doctor.initials} color={doctor.color} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="title-s">{doctor.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doctor.email}</div>
          </div>
        </div>
        <Divider style={{ margin: '6px 0' }} />
        {items.map(([ic, l, fn]) => (
          <button key={l} onClick={fn} className="state-layer" style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%', height: 46, padding: '0 12px',
            border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 'var(--r-sm)',
            color: 'var(--on-surface)', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 14, position: 'relative',
          }}>
            <Icon name={ic} size={22} style={{ color: 'var(--on-surface-variant)' }} />{l}
          </button>
        ))}
        <Divider style={{ margin: '6px 0' }} />
        <button onClick={onLogout} className="state-layer" style={{
          display: 'flex', alignItems: 'center', gap: 14, width: '100%', height: 46, padding: '0 12px',
          border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 'var(--r-sm)',
          color: 'var(--error)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, position: 'relative',
        }}>
          <Icon name="logout" size={22} />Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ---------- Bottom nav (mobile) ---------- */
function BottomNav({ route, go }) {
  return (
    <nav className="bottom-nav" style={{
      height: 72, flexShrink: 0, background: 'var(--surface-container)',
      borderTop: '1px solid var(--outline-variant)', alignItems: 'center', justifyContent: 'space-around', padding: '0 4px',
    }}>
      {NAV.map((i) => {
        const active = route.name === i.key || (i.key === 'patients' && route.name === 'patient');
        return (
          <button key={i.key} onClick={() => go(i.key)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: active ? 'var(--primary)' : 'var(--on-surface-variant)', flex: 1, padding: '8px 0',
          }}>
            <span style={{ padding: '2px 16px', borderRadius: 999, background: active ? 'var(--secondary-container)' : 'transparent', display: 'flex' }}>
              <Icon name={i.icon} size={22} fill={active} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{i.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- Trial vencido (gate §6.1) ---------- */
function TrialExpired({ doctor, onLogout }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: 'var(--surface)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--r-xl)', padding: '40px 32px' }}>
        <Icon name="lock_clock" size={48} style={{ color: 'var(--error)' }} />
        <h2 className="headline-s">Tu periodo de prueba terminó</h2>
        <p className="body-m" style={{ color: 'var(--on-surface-variant)' }}>
          {doctor?.name ? `${doctor.name}, ` : ''}para seguir usando MedSaaS necesitas activar un plan.
          Tus datos están a salvo y se reactivan al comprar.
        </p>
        <Button variant="filled" icon="shopping_cart" onClick={() => window.open(ONBOARDING_URL, '_blank', 'noopener,noreferrer')}>
          Activar un plan
        </Button>
        <button onClick={onLogout} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--on-surface-variant)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13 }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ---------- Error boundary ---------- */
class ErrorBoundary extends Component<any, { err: any }> {
  constructor(p: any) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err: any) { return { err }; }
  componentDidUpdate(prev: any) { if (prev.routeKey !== this.props.routeKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      return (
        <div className="page-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 80, textAlign: 'center' }}>
          <Icon name="error" size={48} style={{ color: 'var(--error)' }} />
          <h2 className="headline-s">Algo salió mal en esta vista</h2>
          <p className="body-m" style={{ color: 'var(--on-surface-variant)', maxWidth: 420 }}>{String(this.state.err.message || this.state.err)}</p>
          <Button variant="filled" icon="refresh" onClick={() => this.setState({ err: null })}>Reintentar</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================================================
   App root
   ============================================================ */
export default function App() {
  const [account,    setAccount]    = useState<AccountContext | null>(null);
  const [authed,     setAuthed]     = useState(false);
  const [authReady,  setAuthReady]  = useState(false);
  const [authError,  setAuthError]  = useState('');
  const [theme,     setTheme]     = useState('light');
  const [route,     setRoute]     = useState<{ name: string; params: any }>({ name: 'dashboard', params: {} });
  const [prevRoute, setPrevRoute] = useState<{ name: string; params: any } | null>(null);
  const [navStyle,  setNavStyle]  = useState('topnav');
  const [collapsed, setCollapsed] = useState(false);
  const [drawer,    setDrawer]    = useState(false);
  const [modal,     setModal]     = useState<{ type: string; prefill?: any } | null>(null);
  const [snack,     setSnack]     = useState<string | null>(null);
  const [pmenu,     setPmenu]     = useState(false);
  const [dataVersion, setDataVersion] = useState(0); // se incrementa tras un write para refrescar listas
  const bumpData = () => setDataVersion((v) => v + 1);

  // Aplica el guard: sesión → perfil → onboarding_completed → trial (§6.1).
  const resolveSession = async () => {
    try {
      const load = await loadAccountContext();
      if (!load) {
        setAccount(null);
        setAuthed(false);
        return;
      }
      if (load.state === 'no-profile' || load.state === 'onboarding-incompleto') {
        await supabase.auth.signOut();
        setAccount(null);
        setAuthed(false);
        setAuthError('Completa tu registro en el onboarding antes de iniciar sesión.');
        return;
      }
      setAccount(load.account);
      setAuthed(true);
      setAuthError('');
    } catch (e: any) {
      console.error('Error al resolver la sesión:', e);
      setAuthError('No se pudo cargar tu cuenta. Intenta de nuevo.');
      setAuthed(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    resolveSession().finally(() => { if (mounted) setAuthReady(true); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setAccount(null);
        setAuthed(false);
      } else {
        resolveSession();
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const go = (name: string, params: any = {}) => {
    setPrevRoute(route);
    setRoute({ name, params });
    setDrawer(false);
    window.scrollTo(0, 0);
    const m = document.querySelector('.main-scroll');
    if (m) (m as HTMLElement).scrollTop = 0;
  };
  const goBack = () => {
    if (prevRoute) go(prevRoute.name, prevRoute.params);
  };

  const openModal = (type: string, prefill?: any) => {
    setModal({ type, prefill });
  };
  const closeModal = () => setModal(null);
  const toast = (message: string) => {
    setSnack(message);
    clearTimeout((window as any).__snackT);
    (window as any).__snackT = setTimeout(() => setSnack(null), 3200);
  };
  const onLogout = async () => {
    await supabase.auth.signOut();
    setPmenu(false);
  };

  if (!authReady) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: 'var(--on-surface-variant)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--primary-container)', borderTopColor: 'var(--primary)', animation: 'spin .8s linear infinite' }} />
          <span className="body-m">Cargando…</span>
        </div>
      </div>
    );
  }

  if (!authed) {
    return <Login variant="split" onLogin={() => { /* el listener resuelve la sesión */ }} authError={authError} onClearAuthError={() => setAuthError('')} />;
  }

  const doctor = doctorFromAccount(account);

  // Gate de vigencia del trial (§6.1): vencido → bloquear y mandar a comprar.
  if (account && !account.accesoVigente) {
    return <TrialExpired doctor={doctor} onLogout={onLogout} />;
  }

  const pageProps = { go, goBack: prevRoute ? goBack : undefined, openModal, toast, dataVersion, refreshAccount: resolveSession };
  let page;
  switch (route.name) {
    case 'dashboard':    page = <Dashboard    {...pageProps} />; break;
    case 'calendar':     page = <Calendar     {...pageProps} />; break;
    case 'patients':     page = <PatientList  {...pageProps} />; break;
    case 'patient':      page = <PatientRecord id={route.params.id} {...pageProps} />; break;
    case 'consulta':     page = <Consulta patientId={route.params.patientId} {...pageProps} />; break;
    case 'receta':       page = <Receta   patientId={route.params.patientId} {...pageProps} />; break;
    case 'informe':      page = <Informe      patientId={route.params.patientId} {...pageProps} />; break;
    case 'laboratorio':  page = <Laboratorio  patientId={route.params.patientId} {...pageProps} />; break;
    case 'prescriptions':page = <Prescriptions {...pageProps} />; break;
    case 'reports':      page = <Reports      {...pageProps} />; break;
    case 'profile':      page = <Profile      {...pageProps} />; break;
    case 'settings':     page = <Settings theme={theme} setTheme={setTheme} onLogout={onLogout} navStyle={navStyle} setNavStyle={setNavStyle} />; break;
    default:             page = <Dashboard    {...pageProps} />;
  }

  return (
    <AccountCtx.Provider value={account}>
    <div className="density-regular" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
      {navStyle === 'topnav' && (
        <TopNav route={route} go={go} theme={theme} setTheme={setTheme} openProfileMenu={() => setPmenu(true)} doctor={doctor} />
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {navStyle === 'sidebar' && (
          <div className="sidebar-wrap">
            <Sidebar route={route} go={go} collapsed={collapsed} setCollapsed={setCollapsed} onLogout={onLogout} doctor={doctor} />
          </div>
        )}

        {navStyle === 'sidebar' && drawer && (
          <div onClick={() => setDrawer(false)} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 800 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ height: '100%', width: 280, animation: 'fadeIn .2s' }}>
              <Sidebar route={route} go={go} collapsed={false} setCollapsed={() => setDrawer(false)} onLogout={onLogout} doctor={doctor} />
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {navStyle === 'sidebar' && (
            <AppBar theme={theme} setTheme={setTheme} onMenu={() => setDrawer(true)} openProfileMenu={() => setPmenu(true)} doctor={doctor} />
          )}
          <main className="main-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <ErrorBoundary routeKey={route.name + (route.params.id || '')}>{page}</ErrorBoundary>
          </main>
        </div>
      </div>

      <BottomNav route={route} go={go} />

      <div className="mobile-fab">
        <FAB icon="add" onClick={() => openModal('appointment')} />
      </div>

      <ProfileMenu open={pmenu} onClose={() => setPmenu(false)} go={go} theme={theme} setTheme={setTheme} onLogout={onLogout} doctor={doctor} />

      <AppointmentModal  open={modal?.type === 'appointment'}  onClose={closeModal} prefill={modal?.prefill} toast={toast} onCreated={bumpData} />
      <ReportModal       open={modal?.type === 'report'}       onClose={closeModal} prefill={modal?.prefill} toast={toast} onCreated={bumpData} />
      <PatientModal      open={modal?.type === 'patient'}      onClose={closeModal} toast={toast} onCreated={bumpData} />

      <Snackbar open={!!snack} message={snack} action="Deshacer" />
    </div>
    </AccountCtx.Provider>
  );
}
