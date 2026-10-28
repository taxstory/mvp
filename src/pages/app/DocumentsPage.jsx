// src/pages/app/DocumentsPage.jsx
export default function DocumentsPage() {
  return (
    <div className="ts-page">
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗂</div>
        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700,
          color: 'var(--color-dark)', marginBottom: 10 }}>Documents</div>
        <div style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 24 }}>
          A central library for all client PDFs, generated summaries, and uploaded files. This will let you attach supporting documents to any client record and share them through the portal.
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
