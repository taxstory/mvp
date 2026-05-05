// src/pages/marketing/LandingPage.jsx
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';

const STATS = [
  { value: '60%',     label: 'Fewer client calls after tax season' },
  { value: '90 sec',  label: 'To generate a personalized client video' },
  { value: '40 hrs',  label: 'Saved per CPA per tax season' },
];

const CPA_FEATURES = [
  {
    icon: '📄',
    title: 'Upload Any Tax Return',
    desc: 'Drag and drop a completed PDF. TaxStory extracts the financial data that matters — and nothing else.',
  },
  {
    icon: '🤖',
    title: 'AI Generates the Script',
    desc: 'Claude writes a warm, plain-English walkthrough of the return in your client\'s voice — not tax-speak.',
  },
  {
    icon: '🎬',
    title: 'Video Ready in 90 Seconds',
    desc: 'A personalized 2–3 minute video your client can watch on their phone, at their own pace.',
  },
];

const RIA_FEATURES = [
  {
    icon: '📊',
    title: 'Multi-Year Projections',
    desc: 'Model 5–20 years of federal tax liability with 2024 brackets, LTCG rates, NIIT, and RMD logic built in.',
  },
  {
    icon: '⚖️',
    title: 'Scenario Comparisons',
    desc: 'Run Roth conversions, tax-loss harvesting, municipal bond shifts, and RMD strategies side by side.',
  },
  {
    icon: '📈',
    title: 'Client-Ready Charts',
    desc: 'Export projection charts your clients can understand — no spreadsheets, no tax jargon.',
  },
];

const TRUST_SIGNALS = [
  { icon: '🔒', label: 'PII-Free by Design', desc: 'Personal identifiers are never extracted from tax returns — not scrubbed, never collected.' },
  { icon: '✅', label: 'SOC 2 Compliance', desc: 'Active SOC 2 Type I compliance process underway. Policy library and controls fully documented.' },
  { icon: '🏛️', label: 'NYCPA & AICPA', desc: 'Active relationships with both associations. Built with CPA and RIA workflows at the center.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="bg-brand-dark text-white py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block bg-brand-purple/30 text-purple-200 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide uppercase">
            🎬 The First AI-Powered Video Platform for Tax Professionals
          </span>
          <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-6">
            Stop Explaining<br />Tax Returns.
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-4">
            Let AI do it for you. Automatically turn completed returns into personalized client videos in 90 seconds.
          </p>
          <p className="text-base text-gray-400 max-w-xl mx-auto mb-10">
            Plus: year-round multi-year tax projections and scenario modeling built for RIAs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="bg-brand-purple hover:bg-purple-600 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
              Start Your Free 14-Day Trial
            </Link>
            <Link to="/how-it-works" className="border border-white/30 hover:border-white text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
              See How It Works
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-4">No credit card required. Full access for 14 days.</p>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────── */}
      <section className="bg-brand-purple py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {STATS.map(s => (
            <div key={s.value} className="text-center text-white">
              <div className="font-serif text-4xl font-bold mb-1">{s.value}</div>
              <div className="text-sm text-purple-200">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CPA Features ─────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold text-brand-purple uppercase tracking-widest">For CPAs</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">Your clients finally understand their return</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">Upload a completed tax return PDF and TaxStory generates a personalized video walkthrough — explained in plain English, delivered in 90 seconds.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {CPA_FEATURES.map(f => (
              <div key={f.title} className="bg-brand-light rounded-2xl p-8">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-brand-dark text-lg mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RIA Features ─────────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">For RIAs</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">Multi-year tax projections that actually land</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">Model Roth conversions, RMDs, tax-loss harvesting, and income scenarios — with real federal brackets and side-by-side comparisons your clients can follow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {RIA_FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-brand-dark text-lg mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Signals ────────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-serif text-4xl font-bold text-brand-dark">Built for professionals who can't afford a security gap</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">TaxStory handles client-adjacent financial data. Security isn't a feature — it's the foundation.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {TRUST_SIGNALS.map(t => (
              <div key={t.label} className="text-center">
                <div className="text-4xl mb-4">{t.icon}</div>
                <h3 className="font-semibold text-brand-dark text-lg mb-2">{t.label}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founding Member CTA ──────────────────────────── */}
      <section className="py-20 px-6 bg-brand-dark text-white">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block bg-yellow-400/20 text-yellow-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide uppercase">
            ⭐ Founding Member Program
          </span>
          <h2 className="font-serif text-4xl font-bold mb-4">Join before the public launch</h2>
          <p className="text-gray-300 text-lg mb-2">Founding members get locked-in pricing, direct access to the product roadmap, and priority onboarding.</p>
          <p className="text-gray-400 text-sm mb-10">SOC 2 Type I compliance in progress. Your clients' data is handled the right way from day one.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup" className="bg-brand-purple hover:bg-purple-600 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
              Claim Founding Member Access
            </Link>
            <Link to="/pricing" className="border border-white/30 hover:border-white text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
              View Pricing
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-6">14-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
