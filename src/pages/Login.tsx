import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, Button, TextField, Divider } from '../components';

// URL del onboarding (app separada que crea la cuenta + tenant).
const ONBOARDING_URL = 'https://medsaas-onboarding.vercel.app/';

// Mapea errores de Supabase Auth a mensajes en español (por substring del message).
function authErrorMsg(message?: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
  if (m.includes('invalid email')) return 'Correo electrónico inválido.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Intenta más tarde.';
  if (m.includes('network')) return 'Error de red. Verifica tu conexión.';
  return 'Ocurrió un error. Intenta de nuevo.';
}

/* ---------- BrandMark ---------- */
export function BrandMark({ size = 44, light = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: size, height: size, borderRadius: 14, flexShrink: 0,
        background: light ? 'rgba(255,255,255,0.16)' : 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: light ? 'none' : '0 6px 18px -6px var(--primary)',
        border: light ? '1px solid rgba(255,255,255,0.25)' : 'none',
      }}>
        <Icon name="clinical_notes" size={size * 0.56} fill style={{ color: light ? '#fff' : 'var(--on-primary)' }} />
      </div>
      <div style={{ lineHeight: 1.05 }}>
        <div className="title-l" style={{ fontWeight: 800, color: light ? '#fff' : 'var(--on-surface)', letterSpacing: '-.3px' }}>MedSaaS</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: light ? 'rgba(255,255,255,0.8)' : 'var(--on-surface-variant)', letterSpacing: '.5px' }}>EXPEDIENTE CLÍNICO</div>
      </div>
    </div>
  );
}

/* ---------- Google Button ---------- */
function GoogleButton({ onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="state-layer" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', height: 52,
      borderRadius: 'var(--r-full)', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-lowest)',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1,
      position: 'relative', color: 'var(--on-surface)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15,
    }}>
      <svg width="20" height="20" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continuar con Google
    </button>
  );
}

/* ---------- Medical backdrop (CSS-only) ---------- */
function MedicalBackdrop({ children, style = {}, className = '' }) {
  return (
    <div className={className} style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(150deg, #00504A 0%, #006A60 45%, #1E847A 100%)',
      ...style,
    }}>
      <div style={{ position: 'absolute', width: 460, height: 460, borderRadius: '50%', top: -140, right: -120, background: 'radial-gradient(circle, rgba(158,242,228,0.35), transparent 70%)' }} />
      <div style={{ position: 'absolute', width: 380, height: 380, borderRadius: '50%', bottom: -120, left: -100, background: 'radial-gradient(circle, rgba(194,232,253,0.22), transparent 70%)' }} />
      <svg viewBox="0 0 800 120" preserveAspectRatio="none" style={{ position: 'absolute', bottom: '14%', left: 0, width: '120%', height: 90, opacity: 0.5 }}>
        <polyline points="0,60 120,60 150,60 165,20 185,100 205,40 225,60 360,60 390,60 405,30 425,90 445,60 600,60 640,60 655,28 675,92 695,60 800,60"
          fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }}>
        <defs>
          <pattern id="plus" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M24 18h8v6h6v8h-6v6h-8v-6h-6v-8h6z" fill="#fff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#plus)" />
      </svg>
      {children}
    </div>
  );
}

/* ---------- Login form ---------- */
function LoginForm({ onLogin, authError, onClearAuthError }) {
  const [tab, setTab]         = useState('login');
  const [email, setEmail]     = useState('');
  const [pwd, setPwd]         = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const isReg = tab === 'register';

  const displayError = authError || error;
  const clearError = () => { setError(''); onClearAuthError?.(); };

  const handleEmailAuth = async () => {
    if (!email || !pwd) { setError('Completa todos los campos.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: pwd,
      });
      if (signInError) {
        setError(authErrorMsg(signInError.message));
        return;
      }
      // El listener onAuthStateChange en App aplica el guard (perfil + trial).
      onLogin?.();
    } catch (e: any) {
      setError(authErrorMsg(e?.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      // OAuth con redirect: la página navega a Google y vuelve al origin.
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) {
        setError(authErrorMsg(oauthError.message));
        setLoading(false);
      }
    } catch (e: any) {
      setError(authErrorMsg(e?.message));
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleEmailAuth(); };

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-container-high)', borderRadius: 'var(--r-full)', marginBottom: 28 }}>
        {[['login', 'Iniciar sesión'], ['register', 'Registrarse']].map(([k, l]) => (
          <button key={k}
            onClick={() => {
              if (k === 'register') {
                window.open(ONBOARDING_URL, '_blank', 'noopener,noreferrer');
              } else {
                setTab(k);
                clearError();
              }
            }}
            style={{
              flex: 1, height: 40, border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer',
              background: tab === k ? 'var(--primary)' : 'transparent', color: tab === k ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, transition: 'all .2s',
            }}>{l}</button>
        ))}
      </div>

      <h1 className="headline-m" style={{ marginBottom: 6, letterSpacing: '-.5px' }}>
        {isReg ? 'Crea tu cuenta' : 'Bienvenida de nuevo'}
      </h1>
      <p className="body-m" style={{ color: 'var(--on-surface-variant)', marginBottom: 26 }}>
        {isReg ? 'Regístrate para gestionar tu consulta clínica.' : 'Accede a tu expediente clínico electrónico.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onKeyDown={handleKeyDown}>
        {isReg && <TextField label="Nombre completo" icon="badge" value={name} onChange={setName} />}
        <TextField label="Correo electrónico" icon="mail" type="email" value={email} onChange={(v) => { setEmail(v); clearError(); }} placeholder="nombre@clinica.mx" />
        <TextField label="Contraseña" icon="lock" type={showPwd ? 'text' : 'password'} value={pwd} onChange={(v) => { setPwd(v); clearError(); }}
          trailingIcon={showPwd ? 'visibility_off' : 'visibility'} onTrailingClick={() => setShowPwd(!showPwd)} />

        {displayError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--r-sm)', background: 'var(--error-container)', color: 'var(--on-error-container)', fontSize: 13.5, fontWeight: 500 }}>
            <Icon name="error" size={18} fill style={{ flexShrink: 0 }} />
            {displayError}
          </div>
        )}

        {!isReg && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6 }}>
            <a style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>¿Olvidaste tu contraseña?</a>
          </div>
        )}
        <Button full size="md" onClick={handleEmailAuth} disabled={loading} style={{ height: 52, marginTop: 4 }} trailingIcon={loading ? undefined : 'arrow_forward'}>
          {loading ? 'Cargando…' : isReg ? 'Crear cuenta' : 'Ingresar con correo'}
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0' }}>
        <Divider style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', fontWeight: 600 }}>O CONTINÚA CON</span>
        <Divider style={{ flex: 1 }} />
      </div>
      <GoogleButton onClick={handleGoogle} disabled={loading} />

      <p className="body-s" style={{ textAlign: 'center', color: 'var(--on-surface-variant)', marginTop: 26, lineHeight: 1.6 }}>
        {isReg ? 'Al registrarte aceptas los ' : 'Al continuar aceptas los '}
        <a style={{ color: 'var(--primary)', fontWeight: 600 }}>Términos</a> y la <a style={{ color: 'var(--primary)', fontWeight: 600 }}>Política de privacidad</a>.
      </p>
    </div>
  );
}

/* ---------- Split variant ---------- */
function LoginSplit({ onLogin, authError, onClearAuthError }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', height: '100%', minHeight: 0 }} className="login-split">
      <MedicalBackdrop className="login-hero" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 56px' }}>
        <BrandMark light />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="display-s" style={{ color: '#fff', maxWidth: 460, letterSpacing: '-1px', lineHeight: 1.1 }}>
            El expediente clínico que tu equipo médico merece.
          </h2>
          <p className="body-l" style={{ color: 'rgba(255,255,255,0.82)', maxWidth: 420, marginTop: 16 }}>
            Agenda, recetas, informes y expedientes — seguros, accesibles y en un solo lugar.
          </p>
          <div style={{ display: 'flex', gap: 28, marginTop: 36 }}>
            {[['groups', '12k+', 'Pacientes'], ['verified_user', 'NOM-024', 'Cumplimiento'], ['encrypted', 'E2E', 'Cifrado']].map(([ic, n, l]) => (
              <div key={l} style={{ color: '#fff' }}>
                <Icon name={ic} size={22} style={{ opacity: .85 }} />
                <div className="title-l" style={{ fontWeight: 800, marginTop: 4 }}>{n}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', position: 'relative', zIndex: 1 }}>© 2026 MedSaaS · Clínica Santa Marta</div>
      </MedicalBackdrop>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', background: 'var(--surface)', overflowY: 'auto' }}>
        <LoginForm onLogin={onLogin} authError={authError} onClearAuthError={onClearAuthError} />
      </div>
    </div>
  );
}

/* ---------- Centered variant ---------- */
function LoginCentered({ onLogin, authError, onClearAuthError }) {
  return (
    <MedicalBackdrop style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 460, background: 'var(--surface)',
        borderRadius: 'var(--r-xl)', boxShadow: '0 30px 70px -20px rgba(0,0,0,0.45)', padding: '40px 40px 36px',
        animation: 'scaleIn .4s cubic-bezier(.2,0,0,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}><BrandMark /></div>
        <LoginForm onLogin={onLogin} authError={authError} onClearAuthError={onClearAuthError} />
      </div>
    </MedicalBackdrop>
  );
}

/* ---------- Hero variant ---------- */
function LoginHero({ onLogin, authError, onClearAuthError }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--surface)' }}>
      <MedicalBackdrop style={{ padding: '36px 32px 64px', borderRadius: '0 0 32px 32px' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <BrandMark light />
          <h2 className="headline-l" style={{ color: '#fff', marginTop: 28, maxWidth: 520, letterSpacing: '-.5px' }}>
            Tu consultorio, en una sola plataforma.
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
            {['Agenda', 'Recetas', 'Expedientes', 'Informes'].map((t) => (
              <span key={t} style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)' }}>{t}</span>
            ))}
          </div>
        </div>
      </MedicalBackdrop>
      <div style={{ padding: '0 24px 40px', marginTop: -36, position: 'relative', zIndex: 2 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--elev-2)', padding: '32px 28px', maxWidth: 440, margin: '0 auto', border: '1px solid var(--outline-variant)' }}>
          <LoginForm onLogin={onLogin} authError={authError} onClearAuthError={onClearAuthError} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Login (exported) ---------- */
export function Login({ variant = 'split', onLogin, authError, onClearAuthError }) {
  const V = variant === 'centered' ? LoginCentered : variant === 'hero' ? LoginHero : LoginSplit;
  return <div style={{ height: '100%' }}><V onLogin={onLogin} authError={authError} onClearAuthError={onClearAuthError} /></div>;
}
