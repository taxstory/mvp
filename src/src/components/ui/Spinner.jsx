// src/components/ui/Spinner.jsx
//
// Spinner — inline loading indicator.
// PageSpinner — full-page centered loading state.
// Skeleton — shimmer placeholder for content that's loading.
//
// Spinner props:
//   size    number | 'sm' | 'md' | 'lg'   (default: 'md')
//   color   string CSS color              (default: 'var(--color-purple)')
//   label   string — sr-only accessible label
//
// Skeleton props:
//   width   string | number
//   height  string | number              (default: '16px')
//   radius  string                       (default: 'var(--radius-sm)')
//   lines   number — render N stacked skeleton lines
//
// Usage:
//   <Spinner />
//   <Spinner size="sm" color="white" />
//   <PageSpinner label="Loading projections…" />
//   <Skeleton width="60%" />
//   <Skeleton lines={3} />

const SPINNER_SIZES = { sm: 14, md: 20, lg: 32 };

export function Spinner({
  size  = 'md',
  color = 'var(--color-purple)',
  label = 'Loading…',
  style = {},
}) {
  const px = typeof size === 'number' ? size : (SPINNER_SIZES[size] || 20);

  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', ...style }}
    >
      <span
        aria-hidden="true"
        style={{
          display:      'block',
          width:        px,
          height:       px,
          border:       `${Math.max(2, Math.round(px / 8))}px solid ${color}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation:    'ts-spin 0.7s linear infinite',
          flexShrink:   0,
        }}
      />
    </span>
  );
}

export function PageSpinner({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-label={label}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            14,
        minHeight:      '40vh',
        color:          'var(--color-muted)',
        fontSize:       13,
      }}
    >
      <Spinner size="lg" />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({
  width   = '100%',
  height  = '16px',
  radius  = 'var(--radius-sm)',
  lines   = 1,
  gap     = 8,
  style   = {},
}) {
  const bar = (key) => (
    <span
      key={key}
      aria-hidden="true"
      style={{
        display:    'block',
        width:      typeof width === 'number' ? `${width}px` : width,
        height:     typeof height === 'number' ? `${height}px` : height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-bg) 50%, var(--color-border) 75%)',
        backgroundSize: '400% 100%',
        animation:  'ts-shimmer 1.4s infinite',
        ...style,
      }}
    />
  );

  if (lines === 1) return bar('single');

  return (
    <span role="status" aria-label="Loading…" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) =>
        // Last line is shorter to look natural
        <span key={i} aria-hidden="true" style={{
          display:    'block',
          width:      i === lines - 1 ? '65%' : (typeof width === 'number' ? `${width}px` : width),
          height:     typeof height === 'number' ? `${height}px` : height,
          borderRadius: radius,
          background: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-bg) 50%, var(--color-border) 75%)',
          backgroundSize: '400% 100%',
          animation:  'ts-shimmer 1.4s infinite',
        }} />
      )}
    </span>
  );
}

// Keyframe injected by Card.jsx shimmer — shared
