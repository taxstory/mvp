// src/components/ui/Button.jsx
//
// Props:
//   variant   'primary' | 'secondary' | 'ghost' | 'danger'  (default: 'primary')
//   size      'sm' | 'md' | 'lg'                             (default: 'md')
//   loading   boolean — shows spinner, disables interaction
//   disabled  boolean
//   icon      ReactNode — rendered before children
//   iconRight ReactNode — rendered after children
//   fullWidth boolean
//   as        'button' | 'a'                                 (default: 'button')
//   ...rest   passed through (onClick, href, type, aria-*, data-*)
//
// Accessibility:
//   - aria-disabled on loading/disabled (not just HTML disabled, so focus is kept
//     and screen readers announce the state rather than skipping the element)
//   - aria-busy on loading
//   - role="button" when rendered as <a>
//   - All keyboard interactions work natively (button element)
//
// Usage:
//   <Button onClick={save}>Save</Button>
//   <Button variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
//   <Button loading={saving}>Save changes</Button>
//   <Button variant="danger" icon="🗑" size="sm">Delete</Button>
//   <Button as="a" href="/billing">View billing</Button>

import { forwardRef } from 'react';

const VARIANTS = {
  primary:   { bg: 'var(--color-purple)',    color: '#fff',                   border: 'transparent',           hoverBg: 'var(--color-purple-2)' },
  secondary: { bg: 'transparent',           color: 'var(--color-purple)',    border: 'var(--color-border)',   hoverBg: 'var(--color-bg)'       },
  ghost:     { bg: 'transparent',           color: 'var(--color-muted)',     border: 'transparent',           hoverBg: 'var(--color-bg)'       },
  danger:    { bg: 'var(--color-red-light)', color: 'var(--color-red-dark)', border: 'var(--color-red-border)', hoverBg: 'var(--color-red-bg)'  },
};

const SIZES = {
  sm: { padding: '5px 12px',  fontSize: '12px', height: '30px', gap: '5px',  radius: 'var(--radius-sm)', iconSize: '13px' },
  md: { padding: '9px 18px',  fontSize: '13px', height: '38px', gap: '7px',  radius: 'var(--radius-md)', iconSize: '15px' },
  lg: { padding: '12px 24px', fontSize: '14px', height: '46px', gap: '8px',  radius: 'var(--radius-lg)', iconSize: '16px' },
};

const SPINNER_STYLE = (size) => ({
  width:  size === 'sm' ? '11px' : size === 'lg' ? '16px' : '13px',
  height: size === 'sm' ? '11px' : size === 'lg' ? '16px' : '13px',
  border: '2px solid currentColor',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'ts-spin 0.7s linear infinite',
  flexShrink: 0,
});

export const Button = forwardRef(function Button(
  {
    children,
    variant   = 'primary',
    size      = 'md',
    loading   = false,
    disabled  = false,
    icon      = null,
    iconRight = null,
    fullWidth = false,
    as        = 'button',
    style     = {},
    className = '',
    ...rest
  },
  ref
) {
  const v    = VARIANTS[variant] || VARIANTS.primary;
  const s    = SIZES[size]       || SIZES.md;
  const isBusy = loading || disabled;

  const baseStyle = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            s.gap,
    padding:        s.padding,
    height:         s.height,
    fontSize:       s.fontSize,
    fontWeight:     600,
    fontFamily:     'inherit',
    letterSpacing:  '0.01em',
    borderRadius:   s.radius,
    border:         `1.5px solid ${v.border}`,
    background:     v.bg,
    color:          v.color,
    cursor:         isBusy ? 'not-allowed' : 'pointer',
    opacity:        isBusy ? 0.65 : 1,
    transition:     'background .15s, opacity .15s, transform .1s',
    textDecoration: 'none',
    whiteSpace:     'nowrap',
    userSelect:     'none',
    width:          fullWidth ? '100%' : undefined,
    boxSizing:      'border-box',
    outline:        'none',
    ...style,
  };

  const props = {
    ref,
    className: `ts-btn ts-btn-${variant} ts-btn-${size}${className ? ` ${className}` : ''}`,
    style: baseStyle,
    'aria-disabled': isBusy ? 'true' : undefined,
    'aria-busy':     loading  ? 'true' : undefined,
    disabled:        isBusy,
    tabIndex:        isBusy ? -1 : undefined,
    // Hover state via CSS since inline styles can't do :hover
    onMouseEnter: (e) => {
      if (!isBusy) e.currentTarget.style.background = v.hoverBg;
      rest.onMouseEnter?.(e);
    },
    onMouseLeave: (e) => {
      if (!isBusy) e.currentTarget.style.background = v.bg;
      rest.onMouseLeave?.(e);
    },
    onMouseDown: (e) => {
      if (!isBusy) e.currentTarget.style.transform = 'scale(0.97)';
      rest.onMouseDown?.(e);
    },
    onMouseUp: (e) => {
      e.currentTarget.style.transform = '';
      rest.onMouseUp?.(e);
    },
    ...rest,
    // Override onClick to block when disabled/loading
    onClick: isBusy ? (e) => e.preventDefault() : rest.onClick,
  };

  if (as === 'a') props.role = 'button';

  const Tag = as;

  return (
    <Tag {...props}>
      {loading && <span style={SPINNER_STYLE(size)} aria-hidden="true" />}
      {!loading && icon && <span style={{ fontSize: s.iconSize, lineHeight: 1 }} aria-hidden="true">{icon}</span>}
      {children}
      {iconRight && !loading && <span style={{ fontSize: s.iconSize, lineHeight: 1 }} aria-hidden="true">{iconRight}</span>}
    </Tag>
  );
});

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('ts-spin-kf')) {
  const style = document.createElement('style');
  style.id = 'ts-spin-kf';
  style.textContent = '@keyframes ts-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
