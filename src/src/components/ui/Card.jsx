// src/components/ui/Card.jsx
//
// Composable card system. All pieces are named exports so you import only what
// you need. Card is the container; CardTitle / CardBody / CardFooter are
// semantic slots that add the right spacing and typography automatically.
//
// Props (Card):
//   variant   'default' | 'outlined' | 'elevated' | 'flush'  (default: 'default')
//   as        element type                                     (default: 'div')
//   padding   number | string — override default padding
//   loading   boolean — shows a skeleton shimmer overlay
//   ...rest   className, style, onClick, aria-*
//
// Props (CardTitle):
//   sub       string | ReactNode — subdued label below the title
//   action    ReactNode — right-slotted button/link
//
// Usage:
//   <Card>
//     <CardTitle sub="Based on 2025 return" action={<Button size="sm">Edit</Button>}>
//       Federal Tax Summary
//     </CardTitle>
//     <CardBody>…content…</CardBody>
//     <CardFooter>
//       <Button variant="ghost" size="sm">View details</Button>
//     </CardFooter>
//   </Card>
//
//   <Card variant="outlined" loading={isLoading}>…</Card>

const VARIANTS = {
  default:  { background: 'var(--color-white)', border: '1px solid var(--color-border)',    shadow: '0 1px 4px rgba(107,92,231,.06)', radius: 'var(--radius-lg)' },
  outlined: { background: 'var(--color-white)', border: '1.5px solid var(--color-purple)', shadow: 'none',                           radius: 'var(--radius-lg)' },
  elevated: { background: 'var(--color-white)', border: '1px solid var(--color-border)',    shadow: '0 4px 16px rgba(26,18,48,.10)',  radius: 'var(--radius-xl)' },
  flush:    { background: 'var(--color-bg)',     border: 'none',                             shadow: 'none',                           radius: 'var(--radius-lg)' },
};

export function Card({
  children,
  variant   = 'default',
  as        = 'div',
  padding   = '20px',
  loading   = false,
  className = '',
  style     = {},
  ...rest
}) {
  const v   = VARIANTS[variant] || VARIANTS.default;
  const Tag = as;

  return (
    <Tag
      className={`ts-card ts-card-${variant}${className ? ` ${className}` : ''}`}
      style={{
        background:   v.background,
        border:       v.border,
        boxShadow:    v.shadow,
        borderRadius: v.radius,
        padding,
        position:     'relative',
        overflow:     'hidden',
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <div
          aria-hidden="true"
          style={{
            position:   'absolute',
            inset:      0,
            background: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,.6) 50%, transparent 75%)',
            backgroundSize: '400% 100%',
            animation:  'ts-shimmer 1.4s infinite',
            zIndex:     1,
          }}
        />
      )}
      {children}
    </Tag>
  );
}

export function CardTitle({ children, sub, action, style = {} }) {
  return (
    <div
      className="ts-card-title"
      style={{
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        gap:            12,
        marginBottom:   sub ? 4 : 14,
        ...style,
      }}
    >
      <div>
        <div style={{
          fontFamily:  'var(--font-serif)',
          fontSize:    15,
          fontWeight:  700,
          color:       'var(--color-dark)',
          lineHeight:  1.3,
        }}>
          {children}
        </div>
        {sub && (
          <div className="ts-card-sub" style={{
            fontSize:   11.5,
            color:      'var(--color-muted)',
            marginTop:  3,
            lineHeight: 1.4,
          }}>
            {sub}
          </div>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

export function CardBody({ children, style = {} }) {
  return (
    <div className="ts-card-body" style={{ lineHeight: 1.6, ...style }}>
      {children}
    </div>
  );
}

export function CardFooter({ children, style = {} }) {
  return (
    <div
      className="ts-card-footer"
      style={{
        marginTop:  16,
        paddingTop: 14,
        borderTop:  '1px solid var(--color-border)',
        display:    'flex',
        gap:        8,
        flexWrap:   'wrap',
        alignItems: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Inject shimmer keyframes once
if (typeof document !== 'undefined' && !document.getElementById('ts-shimmer-kf')) {
  const style = document.createElement('style');
  style.id    = 'ts-shimmer-kf';
  style.textContent = '@keyframes ts-shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }';
  document.head.appendChild(style);
}
