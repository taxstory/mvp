import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';

const STATS = [
  { value: '60%',    label: 'Fewer client calls after tax season' },
  { value: '90 sec', label: 'To generate a personalized client video' },
  { value: '40 hrs', label: 'Saved per CPA per tax season' },
];

const CPA_FEATURES = [
  { icon: '📄', title: 'Upload Any Tax Return',       desc: 'Drag and drop a completed PDF. TaxStory extracts the financial data that matters — and nothing else.' },
  { icon: '🤖', title: 'AI Generates the Script',     desc: "Claude writes a warm, plain-English walkthrough of the return in your client's voice — not tax-speak." },
  { icon: '🎬', title: 'Video Ready in 90 Seconds',   desc: 'A personalized 2–3 minute video your client can watch on their phone, at their own pace.' },
];

const RIA_FEATURES = [
  { icon: '📊', title: 'Multi-Year Projections',    desc: 'Model 5–20 years of federal tax liability with 2024 brackets, LTCG rates, NIIT, and RMD logic built in.' },
  { icon: '⚡️', title: 'Scenario Comparisons',      desc: 'Run Roth conversions, tax-loss harvesting, municipal bond shifts, and RMD strategies side by side.' },
  { icon: '📈', title: 'Client-Ready Charts',        desc: 'Export projection charts your clients can understand — no spreadsheets, no tax jargon.' },
];

const TRUST_SIGNALS = [
  { icon: '🔒', label: 'PII-Free by Design',        desc: 'Personal identifiers are never extracted from tax returns — not scrubbed, never collected.' },
  { icon: '✅', label: 'SOC 2 Compliance',           desc: 'Active SOC 2 Type I compliance process underway. Policy library and controls fully documented.' },
  { icon: '🛠️', label: 'Built for Professionals',   desc: 'Designed from the ground up around real CPA and RIA workflows — not adapted from a generic tool.' },
];

const s = {
  heroBg:      { background: '#1A1230', color: 'white', padding: '96px 24px' },
  heroInner:   { maxWidth: '896px', margin: '0 auto', textAlign: 'center' },
  badge:       { display: 'inline-block', background: 'rgba(107,92,231,0.3)', color: '#d8b4fe', fontSize: '11px', fontWeight: 700, padding: '6px 16px', borderRadius: '999px', marginBottom: '24px', letterSpacing: '0.06em', textTransform: 'uppercase' },
  h1:          { fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px,6vw,60px)', fontWeight: 900, lineHeight: 1.1, marginBottom: '24px' },
  heroSub:     { fontSize: '18px', color: '#d1d5db', maxWidth: '640px', margin: '0 auto 12px' },
  heroSub2:    { fontSize: '14px', color: '#9ca3af', maxWidth: '520px', margin: '0 auto 40px' },
  btnRow:      { display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' },
  btnPrimary:  { background: '#6B5CE7', color: 'white', fontWeight: 700, fontSize: '14px', padding: '14px 32px', borderRadius: '12px', textDecoration: 'none', display: 'inline-block', transition: 'opacity 0.15s' },
  btnOutline:  { border: '1.5px solid rgba(255,255,255,0.3)', color: 'white', fontWeight: 700, fontSize: '14px', padding: '14px 32px', borderRadius: '12px', textDecoration: 'none', display: 'inline-block' },
  microText:   { fontSize: '12px', color: '#6b7280', marginTop: '16px' },
  statsBg:     { background: '#6B5CE7', padding: '48px 24px' },
  statsGrid:   { maxWidth: '896px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '32px' },
  statVal:     { fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 700, color: 'white', lineHeight: 1, marginBottom: '6px' },
  statLabel:   { fontSize: '13px', color: '#ddd6fe' },
  sectionWhite:{ padding: '80px 24px', background: 'white' },
  sectionGray: { padding: '80px 24px', background: '#F4F2FF' },
  sectionDark: { padding: '80px 24px', background: '#1A1230', color: 'white' },
  inner:       { maxWidth: '1024px', margin: '0 auto' },
  eyebrow:     { fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' },
  h2:          { fontFamily: "'Playfair Display', serif", fontSize: 'clamp(26px,4vw,36px)', fontWeight: 700, color: '#1A1230', marginBottom: '16px' },
  h2white:     { fontFamily: "'Playfair Display', serif", fontSize: 'clamp(26px,4vw,36px)', fontWeight: 700, color: 'white', marginBottom: '16px' },
  sectionSub:  { fontSize: '14px', color: '#6B698A', maxWidth: '560px', margin: '0 auto 56px', lineHeight: 1.7 },
  sectionSubW: { fontSize: '14px', color: '#d1d5db', maxWidth: '560px', margin: '0 auto 48px', lineHeight: 1.7 },
  cardGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '24px' },
  cardLight:   { background: '#F4F2FF', borderRadius: '16px', padding: '32px' },
  cardWhite:   { background: 'white', borderRadius: '16px', padding: '32px', border: '1.5px solid #E2DFF8' },
  cardCenter:  { textAlign: 'center' },
  cardIcon:    { fontSize: '36px', marginBottom: '16px' },
  cardTitle:   { fontSize: '15px', fontWeight: 700, color: '#1A1230', marginBottom: '8px' },
  cardDesc:    { fontSize: '13px', color: '#6B698A', lineHeight: 1.7 },
  ctaBadge:    { display: 'inline-block', background: 'rgba(251,191,36,0.2)', color: '#fde68a', fontSize: '11px', fontWeight: 700, padding: '6px 16px', borderRadius: '999px', marginBottom: '24px', letterSpacing: '0.06em', textTransform: 'uppercase' },
};

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <MarketingNav />

      {/* Hero */}
      <section style={s.heroBg}>
        <div style={s.heroInner}>
          <div style={s.badge}>🎬 The First AI-Powered Video Platform for Tax Professionals</div>
          <h1 style={s.h1}>Stop Explaining<br />Tax Returns.</h1>
          <p style={s.heroSub}>Let AI do it for you. Automatically turn completed returns into personalized client videos in 90 seconds.</p>
          <p style={s.heroSub2}>Plus: year-round multi-year tax projections and scenario modeling built for RIAs.</p>
          <div style={s.btnRow}>
            <Link to="/signup" style={s.btnPrimary}>Start Your Free 14-Day Trial</Link>
            <Link to="/how-it-works" style={s.btnOutline}>See How It Works</Link>
          </div>
          <p style={s.microText}>No credit card required. Full access for 14 days.</p>
        </div>
      </section>

      {/* Stats */}
      <section style={s.statsBg}>
        <div style={s.statsGrid}>
          {STATS.map(s2 => (
            <div key={s2.value} style={{ textAlign: 'center' }}>
              <div style={s.statVal}>{s2.value}</div>
              <div style={s.statLabel}>{s2.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CPA Features */}
      <section style={s.sectionWhite}>
        <div style={{ ...s.inner, textAlign: 'center' }}>
          <div style={{ ...s.eyebrow, color: '#6B5CE7' }}>For CPAs</div>
          <h2 style={s.h2}>Your clients finally understand their return</h2>
          <p style={s.sectionSub}>Upload a completed tax return PDF and TaxStory generates a personalized video walkthrough — explained in plain English, delivered in 90 seconds.</p>
        </div>
        <div style={{ ...s.inner, ...s.cardGrid }}>
          {CPA_FEATURES.map(f => (
            <div key={f.title} style={s.cardLight}>
              <div style={s.cardIcon}>{f.icon}</div>
              <div style={s.cardTitle}>{f.title}</div>
              <div style={s.cardDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* RIA Features */}
      <section style={s.sectionGray}>
        <div style={{ ...s.inner, textAlign: 'center' }}>
          <div style={{ ...s.eyebrow, color: '#0D7A7A' }}>For RIAs</div>
          <h2 style={s.h2}>Multi-year tax projections that actually land</h2>
          <p style={s.sectionSub}>Model Roth conversions, RMDs, tax-loss harvesting, and income scenarios — with real federal brackets and side-by-side comparisons your clients can follow.</p>
        </div>
        <div style={{ ...s.inner, ...s.cardGrid }}>
          {RIA_FEATURES.map(f => (
            <div key={f.title} style={s.cardWhite}>
              <div style={s.cardIcon}>{f.icon}</div>
              <div style={s.cardTitle}>{f.title}</div>
              <div style={s.cardDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust Signals */}
      <section style={s.sectionWhite}>
        <div style={{ ...s.inner, textAlign: 'center' }}>
          <h2 style={s.h2}>Built for professionals who can't afford a security gap</h2>
          <p style={s.sectionSub}>TaxStory handles client-adjacent financial data. Security isn't a feature — it's the foundation.</p>
        </div>
        <div style={{ ...s.inner, ...s.cardGrid }}>
          {TRUST_SIGNALS.map(t => (
            <div key={t.label} style={{ ...s.cardCenter }}>
              <div style={s.cardIcon}>{t.icon}</div>
              <div style={s.cardTitle}>{t.label}</div>
              <div style={s.cardDesc}>{t.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Founding Member CTA */}
      <section style={s.sectionDark}>
        <div style={{ ...s.inner, textAlign: 'center' }}>
          <div style={s.ctaBadge}>⭐ Founding Member Program</div>
          <h2 style={s.h2white}>Join before the public launch</h2>
          <p style={{ fontSize: '15px', color: '#d1d5db', marginBottom: '8px', lineHeight: 1.7 }}>Founding members get locked-in pricing, direct access to the product roadmap, and priority onboarding.</p>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '40px' }}>SOC 2 Type I compliance in progress. Your clients' data is handled the right way from day one.</p>
          <div style={s.btnRow}>
            <Link to="/signup" style={s.btnPrimary}>Claim Founding Member Access</Link>
            <Link to="/pricing" style={s.btnOutline}>View Pricing</Link>
          </div>
          <p style={s.microText}>14-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
