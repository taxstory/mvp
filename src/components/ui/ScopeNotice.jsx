// Shows what the tax engine says about its OWN limits for the figure on screen (computed from the return itself, not boilerplate).
// A "warn" means the return touches an area the engine only approximates: verify the figure independently before relying on it.
export default function ScopeNotice({ scope, dark = false }) {
  if (!scope || !Array.isArray(scope.reasons) || scope.reasons.length === 0) return null;
  const warns = scope.reasons.filter(r => r.level === 'warn');
  const infos = scope.reasons.filter(r => r.level !== 'warn');
  const fg = dark ? 'rgba(255,255,255,.88)' : 'var(--dark)';
  const box = warns.length
    ? { background: dark ? 'rgba(245,158,11,.16)' : 'var(--amber-bg)', border: '1px solid var(--color-amber-border, #F59E0B)' }
    : { background: dark ? 'rgba(255,255,255,.06)' : 'var(--border)', border: '1px solid transparent' };
  return (
    <div data-testid="scope-notice" role={warns.length ? 'alert' : 'note'} style={{ ...box, borderRadius: 8, padding: '10px 12px', margin: '12px 0', fontSize: 12, lineHeight: 1.5, color: fg }}>
      {warns.length > 0 && <div style={{ fontWeight: 700, marginBottom: 4 }}>Outside the engine’s validated scope — verify this figure independently before relying on it.</div>}
      {warns.map(r => <div key={r.code} style={{ marginTop: 3 }}>• {r.text}</div>)}
      {infos.length > 0 && (
        <details style={{ marginTop: warns.length ? 6 : 0 }}>
          <summary style={{ cursor: 'pointer' }}>Assumptions ({infos.length})</summary>
          {infos.map(r => <div key={r.code} style={{ marginTop: 3 }}>• {r.text}</div>)}
        </details>
      )}
    </div>
  );
}
