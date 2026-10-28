// src/components/ui/EmptyState.jsx
//
// Consistent empty state for lists, tables, and dashboards.
// Replaces the 15+ bespoke empty-state divs across the app.
//
// Props:
//   icon      string | ReactNode   (default: '📭')
//   title     string               (required)
//   body      string | ReactNode   — descriptive sentence
//   action    ReactNode            — primary CTA button
//   size      'sm' | 'md' | 'lg'  (default: 'md')
//   bordered  boolean              — wrap in a dashed border box
//
// Usage:
//   <EmptyState
//     icon="👤"
//     title="No clients yet"
//     body="Add your first client to start generating walkthroughs."
//     action={<Button onClick={() => navigate('/clients/new')}>Add client</Button>}
//   />
//
//   <EmptyState icon="💬" title="No messages" size="sm" />
//   <EmptyState icon="📊" title="No projections yet" bordered />

const EMPTY_SIZES = {
  sm: { padding: '28px 16px', iconSize: '28px', titleSize: '13px', bodySize: '12px', gap: 6 },
  md: { padding: '48px 24px', iconSize: '40px', titleSize: '15px', bodySize: '13px', gap: 8 },
  lg: { padding: '72px 32px', iconSize: '56px', titleSize: '17px', bodySize: '14px', gap: 10 },
};

export function EmptyState({
  icon     = '📭',
  title,
  body,
  action,
  size     = 'md',
  bordered = false,
  className= '',
  style    = {},
}) {
  const s = EMPTY_SIZES[size] || EMPTY_SIZES.md;

  return (
    <div
      className={`ts-empty-state${className ? ` ${className}` : ''}`}
      style={{
        textAlign:    'center',
        padding:      s.padding,
        color:        'var(--color-muted)',
        borderRadius: 'var(--radius-lg)',
        border:       bordered ? '1.5px dashed var(--color-border)' : 'none',
        background:   bordered ? 'var(--color-bg)'                  : 'transparent',
        ...style,
      }}
    >
      {icon && (
        <div aria-hidden="true" style={{ fontSize: s.iconSize, marginBottom: s.gap, lineHeight: 1 }}>
          {icon}
        </div>
      )}
      {title && (
        <div style={{
          fontSize:   s.titleSize,
          fontWeight: 700,
          color:      'var(--color-dark)',
          marginBottom: body || action ? s.gap : 0,
          fontFamily: 'var(--font-serif)',
        }}>
          {title}
        </div>
      )}
      {body && (
        <div style={{
          fontSize:   s.bodySize,
          lineHeight: 1.6,
          maxWidth:   320,
          margin:     '0 auto',
          marginBottom: action ? s.gap * 2 : 0,
        }}>
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: s.gap * 1.5 }}>{action}</div>}
    </div>
  );
}
