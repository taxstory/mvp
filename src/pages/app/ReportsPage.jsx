import { Icon, IconLabel } from '../../components/Icon';
// src/pages/app/ReportsPage.jsx
export default function ReportsPage() {
  return (
    <div className="ts-page">
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        <div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 16 }}><Icon name="file" size={24} /></div>
        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700,
          color: 'var(--color-dark)', marginBottom: 10 }}>Reports & Exports</div>
        <div style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.7, marginBottom: 24 }}>
          Aggregate reports across your client base — effective rate distribution, planning flag summary, video engagement rates, and credit usage by month. Export any view to CSV or PDF.
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', background: 'var(--color-purple-4)', borderRadius: 10,
          fontSize: 12, color: 'var(--color-purple)', fontWeight: 600 }}>
          <Icon name="calendar" /> Coming in v1.1 — pilot feedback shapes this first
        </div>
      </div>
    </div>
  );
}
