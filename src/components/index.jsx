import { useState, useEffect, useCallback } from 'react';

/* ---------- Icon ---------- */
export function Icon({ name, fill, size = 24, weight, className = '', style = {} }) {
  return (
    <span
      className={`ms ${fill ? 'fill' : ''} ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight || 400}, 'GRAD' 0, 'opsz' ${size}`, ...style }}
    >{name}</span>
  );
}

/* ---------- Ripple ---------- */
export function useRipple() {
  return useCallback((e) => {
    const el = e.currentTarget;
    const circle = document.createElement('span');
    const d = Math.max(el.clientWidth, el.clientHeight);
    const rect = el.getBoundingClientRect();
    circle.style.cssText = `position:absolute;border-radius:50%;background:currentColor;opacity:.25;pointer-events:none;width:${d}px;height:${d}px;left:${e.clientX - rect.left - d / 2}px;top:${e.clientY - rect.top - d / 2}px;transform:scale(0);animation:ripple .55s ease-out forwards;`;
    el.appendChild(circle);
    setTimeout(() => circle.remove(), 560);
  }, []);
}

/* ---------- Button ---------- */
export function Button({ variant = 'filled', icon, trailingIcon, children, onClick, disabled, full, size = 'md', style = {}, type = 'button', danger }) {
  const ripple = useRipple();
  const variants = {
    filled:      { background: danger ? 'var(--error)' : 'var(--primary)', color: danger ? 'var(--on-error)' : 'var(--on-primary)', border: 'none', boxShadow: 'none' },
    tonal:       { background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', border: 'none' },
    primaryTonal:{ background: 'var(--primary-container)', color: 'var(--on-primary-container)', border: 'none' },
    outlined:    { background: 'transparent', color: 'var(--primary)', border: '1px solid var(--outline-variant)' },
    text:        { background: 'transparent', color: 'var(--primary)', border: 'none', padding: '0 12px' },
    elevated:    { background: 'var(--surface-container-low)', color: 'var(--primary)', border: 'none', boxShadow: 'var(--elev-1)' },
  };
  const v = variants[variant] || variants.filled;
  const pad = size === 'sm' ? '0 16px' : '0 24px';
  const h = size === 'sm' ? 36 : 40;
  return (
    <button
      type={type}
      onClick={(e) => { if (!disabled) { ripple(e); onClick && onClick(e); } }}
      disabled={disabled}
      className="state-layer"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: h, padding: v.padding || pad, borderRadius: 'var(--r-full)', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, letterSpacing: '.1px',
        opacity: disabled ? .38 : 1, width: full ? '100%' : 'auto', position: 'relative',
        transition: 'box-shadow .2s, background .2s', whiteSpace: 'nowrap', ...v, ...style,
      }}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={18} />}
    </button>
  );
}

/* ---------- IconButton ---------- */
export function IconButton({ name, fill, onClick, tooltip, active, size = 40, iconSize = 22, style = {}, color, className = '' }) {
  const ripple = useRipple();
  return (
    <button
      onClick={(e) => { ripple(e); onClick && onClick(e); }}
      title={tooltip}
      className={`state-layer ${className}`}
      style={{
        width: size, height: size, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        background: active ? 'var(--secondary-container)' : 'transparent',
        color: color || (active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)'), ...style,
      }}
    >
      <Icon name={name} fill={fill || active} size={iconSize} />
    </button>
  );
}

/* ---------- FAB ---------- */
export function FAB({ icon, label, onClick, extended, style = {} }) {
  const ripple = useRipple();
  return (
    <button
      onClick={(e) => { ripple(e); onClick && onClick(e); }}
      className="state-layer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12, height: 56,
        padding: extended ? '0 20px' : 0, width: extended ? 'auto' : 56,
        justifyContent: 'center', borderRadius: 'var(--r-lg)', border: 'none', cursor: 'pointer',
        background: 'var(--primary-container)', color: 'var(--on-primary-container)',
        boxShadow: 'var(--elev-3)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15,
        position: 'relative', ...style,
      }}
    >
      <Icon name={icon} size={24} />
      {extended && label}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ variant = 'elevated', children, onClick, style = {}, className = '', hover }) {
  const variants = {
    elevated: { background: 'var(--surface-container-low)', boxShadow: 'var(--elev-1)', border: 'none' },
    filled:   { background: 'var(--surface-container-highest)', border: 'none' },
    outlined: { background: 'var(--surface)', border: '1px solid var(--outline-variant)' },
  };
  return (
    <div
      onClick={onClick}
      className={`${className} ${onClick || hover ? 'state-layer' : ''}`}
      style={{
        borderRadius: 'var(--r-md)', padding: 0, color: 'var(--on-surface)',
        cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .2s, transform .2s',
        ...variants[variant], ...style,
      }}
    >{children}</div>
  );
}

/* ---------- Chip ---------- */
export function Chip({ label, icon, selected, onClick, color, onClose, style = {}, size = 'md' }) {
  const h = size === 'sm' ? 26 : 32;
  return (
    <button
      onClick={onClick}
      className={onClick ? 'state-layer' : ''}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: h, padding: '0 12px',
        borderRadius: 'var(--r-sm)', cursor: onClick ? 'pointer' : 'default', position: 'relative',
        border: selected ? 'none' : '1px solid var(--outline-variant)',
        background: selected ? (color || 'var(--secondary-container)') : 'transparent',
        color: selected ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: size === 'sm' ? 12 : 13, whiteSpace: 'nowrap', ...style,
      }}
    >
      {icon && <Icon name={icon} size={16} fill={selected} />}
      {label}
      {onClose && <Icon name="close" size={16} style={{ marginRight: -4 }} onClick={onClose} />}
    </button>
  );
}

/* ---------- StatusPill ---------- */
export function StatusPill({ status }) {
  const map = {
    'confirmada':  { label: 'Confirmada', bg: 'var(--success-container)', fg: 'var(--on-success-container)', icon: 'check_circle' },
    'pendiente':   { label: 'Pendiente',  bg: 'var(--surface-container-highest)', fg: 'var(--on-surface-variant)', icon: 'schedule' },
    'en-curso':    { label: 'En curso',   bg: 'var(--primary-container)', fg: 'var(--on-primary-container)', icon: 'play_circle' },
    'sala-espera': { label: 'En sala',    bg: 'var(--warning-container)', fg: 'var(--on-warning-container)', icon: 'chair' },
    'cancelada':   { label: 'Cancelada',  bg: 'var(--error-container)',   fg: 'var(--on-error-container)',   icon: 'cancel' },
    'completada':  { label: 'Completada', bg: 'var(--secondary-container)', fg: 'var(--on-secondary-container)', icon: 'task_alt' },
    'Activo':      { label: 'Activo',     bg: 'var(--success-container)', fg: 'var(--on-success-container)', icon: 'check_circle' },
    'Seguimiento': { label: 'Seguimiento',bg: 'var(--warning-container)', fg: 'var(--on-warning-container)', icon: 'visibility' },
  };
  const m = map[status] || map['pendiente'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 10px 0 8px', borderRadius: 'var(--r-full)', background: m.bg, color: m.fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <Icon name={m.icon} size={14} fill /> {m.label}
    </span>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ initials, color, size = 40, fontSize, style = {} }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: color || 'var(--primary)', color: '#fff', fontWeight: 700,
      fontFamily: 'var(--font-display)', fontSize: fontSize || size * 0.38, letterSpacing: '.3px',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', ...style,
    }}>{initials}</div>
  );
}

/* ---------- TextField ---------- */
export function TextField({ label, value, onChange, type = 'text', icon, trailingIcon, onTrailingClick, placeholder, required, error, helper, style = {}, multiline, rows = 3, autoFocus }) {
  const [focus, setFocus] = useState(false);
  const filled = value !== undefined && value !== '';
  const active = focus || filled;
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <div style={{ ...style }}>
      <div style={{
        position: 'relative', display: 'flex', alignItems: multiline ? 'flex-start' : 'center',
        background: 'var(--surface-container-highest)', borderRadius: 'var(--r-xs) var(--r-xs) 0 0',
        borderBottom: `2px solid ${error ? 'var(--error)' : focus ? 'var(--primary)' : 'var(--on-surface-variant)'}`,
        padding: icon ? '0 12px 0 12px' : '0 16px', minHeight: 56, transition: 'border-color .15s',
      }}>
        {icon && <Icon name={icon} size={22} style={{ color: focus ? 'var(--primary)' : 'var(--on-surface-variant)', marginRight: 12, marginTop: multiline ? 16 : 0 }} />}
        <div style={{ flex: 1, position: 'relative', paddingTop: active ? 18 : 0 }}>
          {label && (
            <label style={{
              position: 'absolute', left: 0, pointerEvents: 'none', transition: 'all .15s cubic-bezier(.2,0,0,1)',
              color: error ? 'var(--error)' : focus ? 'var(--primary)' : 'var(--on-surface-variant)',
              top: active ? 6 : '50%', transform: active ? 'none' : 'translateY(-50%)',
              fontSize: active ? 12 : 16, fontWeight: active ? 600 : 400,
            }}>{label}{required && ' *'}</label>
          )}
          <Comp
            type={type} value={value} autoFocus={autoFocus} rows={multiline ? rows : undefined}
            onChange={(e) => onChange && onChange(e.target.value)}
            onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            placeholder={active ? placeholder : ''}
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--on-surface)', fontSize: 16, fontFamily: 'var(--font-body)', resize: 'vertical',
              padding: label ? '8px 0 8px' : '16px 0', lineHeight: 1.4,
            }}
          />
        </div>
        {trailingIcon && (
          <span onMouseDown={(e) => { e.preventDefault(); onTrailingClick && onTrailingClick(); }}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: 8, flexShrink: 0 }}>
            <Icon name={trailingIcon} size={22} style={{ color: 'var(--on-surface-variant)' }} />
          </span>
        )}
      </div>
      {(helper || error) && (
        <div style={{ fontSize: 12, color: error ? 'var(--error)' : 'var(--on-surface-variant)', padding: '4px 16px 0' }}>{error || helper}</div>
      )}
    </div>
  );
}

/* ---------- Select ---------- */
export function Select({ label, value, onChange, options, icon, style = {} }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <div style={{
        display: 'flex', alignItems: 'center', background: 'var(--surface-container-highest)',
        borderRadius: 'var(--r-xs) var(--r-xs) 0 0', borderBottom: '2px solid var(--on-surface-variant)',
        padding: '0 12px', minHeight: 56,
      }}>
        {icon && <Icon name={icon} size={22} style={{ color: 'var(--on-surface-variant)', marginRight: 10 }} />}
        <div style={{ flex: 1 }}>
          {label && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>{label}</div>}
          <select value={value} onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 16, fontFamily: 'var(--font-body)', appearance: 'none', cursor: 'pointer', paddingTop: 2 }}>
            {options.map((o) => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
          </select>
        </div>
        <Icon name="arrow_drop_down" size={24} style={{ color: 'var(--on-surface-variant)' }} />
      </div>
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 52, height: 32, borderRadius: 'var(--r-full)', border: `2px solid ${checked ? 'var(--primary)' : 'var(--outline)'}`,
      background: checked ? 'var(--primary)' : 'var(--surface-container-highest)', cursor: 'pointer', position: 'relative', transition: 'all .2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: '50%', left: checked ? 24 : 6, transform: 'translateY(-50%)',
        width: checked ? 22 : 16, height: checked ? 22 : 16, borderRadius: '50%',
        background: checked ? 'var(--on-primary)' : 'var(--outline)', transition: 'all .2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <Icon name="check" size={14} style={{ color: 'var(--primary)' }} />}
      </span>
    </button>
  );
}

/* ---------- Segmented ---------- */
export function Segmented({ options, value, onChange, style = {} }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--outline)', borderRadius: 'var(--r-full)', overflow: 'hidden', ...style }}>
      {options.map((o, i) => {
        const val = typeof o === 'object' ? (o.value || o.label) : o;
        const sel = val === value;
        return (
          <button key={val} onClick={() => onChange(val)} className="state-layer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', border: 'none',
              borderLeft: i ? '1px solid var(--outline)' : 'none', cursor: 'pointer', position: 'relative',
              background: sel ? 'var(--secondary-container)' : 'transparent',
              color: sel ? 'var(--on-secondary-container)' : 'var(--on-surface)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5,
            }}>
            {sel && o.label && <Icon name="check" size={16} />}
            {o.icon && <Icon name={o.icon} size={16} fill={sel} />}
            {o.label || (typeof o === 'string' ? o : null)}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Dialog ---------- */
export function Dialog({ open, onClose, children, width = 560, style = {} }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose && onClose();
    if (open) document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'fadeIn .2s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface-container-high)', borderRadius: 'var(--r-xl)', width, maxWidth: '100%',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--elev-3)',
        animation: 'scaleIn .25s cubic-bezier(.2,0,0,1)', ...style,
      }}>{children}</div>
    </div>
  );
}

/* ---------- Snackbar ---------- */
export function Snackbar({ message, action, open }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1100,
      background: 'var(--inverse-surface)', color: 'var(--inverse-on-surface)', borderRadius: 'var(--r-xs)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'var(--elev-3)',
      animation: 'fadeUp .3s ease', minWidth: 320, maxWidth: '90vw',
    }}>
      <span style={{ flex: 1, fontSize: 14 }}>{message}</span>
      {action && <span style={{ color: 'var(--inverse-primary)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{action}</span>}
    </div>
  );
}

/* ---------- Divider ---------- */
export function Divider({ style = {} }) {
  return <div style={{ height: 1, background: 'var(--outline-variant)', ...style }} />;
}

/* ---------- SectionHeader ---------- */
export function SectionHeader({ title, action, onAction, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && <Icon name={icon} size={22} style={{ color: 'var(--primary)' }} />}
        <h3 className="title-l" style={{ color: 'var(--on-surface)' }}>{title}</h3>
      </div>
      {action && <Button variant="text" icon={action.icon} onClick={onAction}>{action.label}</Button>}
    </div>
  );
}
