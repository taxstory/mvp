// src/components/ui/Badge.jsx
//
// Badge — compact status label. Pill — rounded pill with dot indicator.
//
// Badge props:
//   variant   'default' | 'pro' | 'new' | 'num' | 'success' | 'warning' | 'danger' | 'info'
//   size      'sm' | 'md'   (default: 'sm')
//   dot       boolean — show a colored status dot before text
//
// Pill props (alias of Badge with pill shape):
//   Same as Badge, always pill-shaped (border-radius: 999px)
//
// Usage:
//   <Badge variant="pro">Pro</Badge>
//   <Badge variant="num">3</Badge>
//   <Badge variant="success" dot>Active</Badge>
//   <Badge variant="warning">Trial</Badge>
//   <Pill variant="info">Tax Basic</Pill>

const BADGE_VARIANTS = {
  default: { bg: 'var(--color-bg)',        color: 'var(--color-muted)',     border: 'var(--color-border)',   dot: 'var(--color-muted)'  },
  pro:     { bg: 'var(--color-purple)',    color: '#fff',                   border: 'transparent',           dot: '#fff'                },
  new:     { bg: 'var(--color-green-bg)',  color: 'var(--color-green-dark)',border: 'var(--color-green-pale)',dot: 'var(--color-green)'  },
  num:     { bg: 'var(--color-red)',       color: '#fff',                   border: 'transparent',           dot: '#fff'                },
  success: { bg: 'var(--color-green-bg)',  color: 'var(--color-green-dark)',border: 'var(--color-green-pale)',dot: 'var(--color-green)'  },
  warning: { bg: 'var(--color-amber-light)',color: 'var(--color-amber-dark)',border: 'var(--color-amber-border)',dot: 'var(--color-amber)'},
  danger:  { bg: 'var(--color-red-light)', color: 'var(--color-red-dark)', border: 'var(--color-red-border)',dot: 'var(--color-red)'    },
  info:    { bg: 'var(--color-blue-bg)',   color: 'var(--color-blue)',      border: 'var(--color-blue-border)',dot: 'var(--color-blue)'  },
  muted:   { bg: 'var(--color-bg)',        color: 'var(--color-muted)',     border: 'var(--color-border)',   dot: 'var(--color-muted)'  },
};

const BADGE_SIZES = {
  sm: { fontSize: '10.5px', padding: '2px 7px',  fontWeight: 700, letterSpacing: '0.04em' },
  md: { fontSize: '12px',   padding: '4px 10px', fontWeight: 600, letterSpacing: '0.02em' },
};

export function Badge({
  children,
  variant   = 'default',
  size      = 'sm',
  dot       = false,
  pill      = false,
  className = '',
  style     = {},
  ...rest
}) {
  const v = BADGE_VARIANTS[variant] || BADGE_VARIANTS.default;
  const s = BADGE_SIZES[size]       || BADGE_SIZES.sm;

  return (
    <span
      className={`ts-badge ts-badge-${variant}${className ? ` ${className}` : ''}`}
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           dot ? 5 : 0,
        padding:       s.padding,
        fontSize:      s.fontSize,
        fontWeight:    s.fontWeight,
        letterSpacing: s.letterSpacing,
        textTransform: 'uppercase',
        borderRadius:  pill ? '999px' : '5px',
        background:    v.bg,
        color:         v.color,
        border:        `1px solid ${v.border}`,
        whiteSpace:    'nowrap',
        lineHeight:    1,
        fontFamily:    'inherit',
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width:       6,
            height:      6,
            borderRadius:'50%',
            background:  v.dot,
            flexShrink:  0,
            animation:   'ts-dot-pulse 2s ease-in-out infinite',
          }}
        />
      )}
      {children}
    </span>
  );
}

// Pill is just Badge with pill shape always on
export function Pill({ children, ...props }) {
  return <Badge pill {...props}>{children}</Badge>;
}

// Dot pulse animation
if (typeof document !== 'undefined' && !document.getElementById('ts-dot-pulse-kf')) {
  const style = document.createElement('style');
  style.id    = 'ts-dot-pulse-kf';
  style.textContent = '@keyframes ts-dot-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }';
  document.head.appendChild(style);
}
