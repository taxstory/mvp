// src/components/ui/Alert.jsx
//
// Inline alert/banner for feedback, errors, and status messages.
// Replaces the 25+ hand-rolled colored divs spread across every page.
//
// Props:
//   variant   'info' | 'success' | 'warning' | 'danger'   (default: 'info')
//   title     string — bold heading line (optional)
//   icon      ReactNode | boolean — false to hide icon, true/string to show
//   onDismiss () => void — shows ✕ button when provided
//   compact   boolean — reduces padding for inline use
//
// Usage:
//   <Alert variant="danger">{error}</Alert>
//   <Alert variant="success" title="Return parsed">12 fields extracted.</Alert>
//   <Alert variant="warning" onDismiss={() => setWarn(null)}>
//     Rental loss suspended by §469 — see Planning flags.
//   </Alert>
//   <Alert variant="info" compact>
//     🔒 PII is never stored — only financial figures leave this function.
//   </Alert>

const ALERT_VARIANTS = {
  info:    { bg: 'var(--color-blue-bg)',     border: 'var(--color-blue-border)',  color: 'var(--color-blue)',      icon: 'ℹ️' },
  success: { bg: 'var(--color-green-bg)',    border: 'var(--color-green-pale)',   color: 'var(--color-green-dark)',icon: '✓'  },
  warning: { bg: 'var(--color-amber-light)', border: 'var(--color-amber-border)', color: 'var(--color-amber-dark)',icon: '⚠️' },
  danger:  { bg: 'var(--color-red-light)',   border: 'var(--color-red-border)',   color: 'var(--color-red-dark)', icon: '✕'  },
};

export function Alert({
  children,
  variant   = 'info',
  title,
  icon,
  onDismiss,
  compact   = false,
  role      = 'status',
  className = '',
  style     = {},
  ...rest
}) {
  const v        = ALERT_VARIANTS[variant] || ALERT_VARIANTS.info;
  const showIcon = icon !== false;
  const iconChar = typeof icon === 'string' ? icon : (icon === true || icon === undefined ? v.icon : null);

  return (
    <div
      role={variant === 'danger' ? 'alert' : role}
      aria-live={variant === 'danger' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`ts-alert ts-alert-${variant}${className ? ` ${className}` : ''}`}
      style={{
        display:      'flex',
        alignItems:   title ? 'flex-start' : 'center',
        gap:          10,
        padding:      compact ? '8px 12px' : '11px 14px',
        borderRadius: 'var(--radius-md)',
        border:       `1px solid ${v.border}`,
        background:   v.bg,
        color:        v.color,
        fontSize:     compact ? '12px' : '13px',
        lineHeight:   1.5,
        ...style,
      }}
      {...rest}
    >
      {showIcon && iconChar && (
        <span aria-hidden="true" style={{ flexShrink: 0, fontSize: compact ? 13 : 15 }}>
          {iconChar}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontWeight: 700, marginBottom: 2, fontSize: compact ? '12px' : '13px' }}>
            {title}
          </div>
        )}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background:  'none',
            border:      'none',
            cursor:      'pointer',
            color:       v.color,
            opacity:     0.7,
            fontSize:    14,
            padding:     '0 2px',
            lineHeight:  1,
            flexShrink:  0,
            fontFamily:  'inherit',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
