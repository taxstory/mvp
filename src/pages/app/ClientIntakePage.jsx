// src/pages/app/ClientIntakePage.jsx
export default function ClientIntakePage() {
  return (
    <div className="ts-page">
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700,
          color: 'var(--color-dark)', marginBottom: 10 }}>Client Intake</div>
        <div style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 24 }}>
          Send a branded intake form to new clients so they can securely submit their information before the first meeting. Responses will feed directly into a new client record and tax projection.
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', background: 'var(--color-purple-4)', borderRadius: 10,
          fontSize: 12, color: 'var(--color-purple)', fontWeight: 600 }}>
          🗓 Coming in v1.1 — pilot feedback shapes this first
        </div>
      </div>
    </div>
  );
}
