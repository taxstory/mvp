// src/components/ui/LoadingScreen.jsx
//
// Full-screen branded loading state for route-level suspense and auth checks.
// Replaces the bare 'loading...' text currently in AuthContext render paths.
//
// Props:
//   label   string   (default: 'Loading…')
//   logo    boolean  — show the TaxStory wordmark  (default: true)

export function LoadingScreen({ label = 'Loading TaxStory…', logo = true }) {
  return (
    <div
      role="status"
      aria-label={label}
      style={{
        position:       'fixed',
        inset:          0,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            20,
        background:     'var(--color-bg)',
        fontFamily:     'var(--font-sans)',
      }}
    >
      {logo && (
        <img
          src="/brand/taxstory-lockup-horizontal-primary-on-light.svg"
          alt="TaxStory"
          style={{ height: 32, width: 'auto' }}
        />
      )}
      <div style={{
        width:        32,
        height:       32,
        border:       '3px solid var(--color-border)',
        borderTopColor:'var(--color-purple)',
        borderRadius: '50%',
        animation:    'ts-spin 0.7s linear infinite',
      }} aria-hidden="true" />
      <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>{label}</p>
    </div>
  );
}
