// src/pages/marketing/LandingPage.jsx
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import { FEATURES } from '../../config/features';

const STATS = [
  { value: '60%',     label: 'Fewer client calls after tax season' },
  { value: '90 sec',  label: 'To generate a personalized client video' },
  { value: '40 hrs',  label: 'Saved per firm per tax season' },
];

const RETURN_FEATURES = [
  {
    icon: '📄',
    title: 'Start From the Completed Return',
    desc: 'Drop in the client copy. It is read in your browser, never uploaded, and only the figures are kept — no names, no SSNs.',
  },
  {
    icon: '🤖',
    title: 'A Plain-English Script, Checked',
    desc: 'TaxStory writes a walkthrough of the return in plain English. Every amount comes from the return, and you review it before anything is sent.',
  },
  {
    icon: '🎬',
    title: 'A Narrated Video Your Client Can Rewatch',
    desc: 'A short, branded walkthrough your client watches on their phone, at their own pace — with a record of when it was viewed.',
  },
];

const PLANNING_FEATURES = [
  {
    icon: '📊',
    title: 'Multi-Year Projections',
    desc: 'Project federal tax years ahead from current law, with capital gains rates, NIIT, required distributions, Social Security and Medicare premiums built in.',
  },
  {
    icon: '⚡️',
    title: 'Scenario Comparisons',
    desc: 'Compare Roth conversions, retirement income and other what-ifs side by side, priced on the full return.',
  },
  {
    icon: '📈',
    title: 'Explained, Not Just Calculated',
    desc: 'Turn the option you recommend into a narrated walkthrough your client can follow — clearly labelled as an estimate.',
  },
];

// NYCPA & AICPA removed — replaced with "Built for Professionals"
const TRUST_SIGNALS = [
  { icon: '🔒', label: 'PII-Free by Design',  desc: 'Return PDFs are read in your browser and never uploaded. Names and SSNs are never collected.' },
  { icon: '✅', label: 'SOC 2 Compliance',     desc: 'Active SOC 2 Type I compliance process underway. Policy library and controls fully documented.' },
  { icon: '🛠️', label: 'Built for Professionals', desc: 'Designed around how tax and financial professionals actually work with clients — not adapted from a generic tool.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />

      {/* ── Hero ── */}
      <section className="bg-brand-dark text-white py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block bg-brand-purple/30 text-purple-200 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide uppercase">
            🎬 Client video walkthroughs for tax and financial professionals
          </span>
          <h1 className="font-serif text-5xl md:text-6xl font-bold leading-tight mb-6">
            Stop Explaining<br />Tax Returns.
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-4">
            Turn completed returns into personalized, narrated client walkthroughs — in minutes, not meetings.
          </p>
          <p className="text-base text-gray-400 max-w-xl mx-auto mb-10">
            Plus next-year projections, so the conversation keeps going after the return is filed.
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

      {/* ── Stats ── */}
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

      {/* ── Return walkthrough features ── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold text-brand-purple uppercase tracking-widest">After the return</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">Your clients finally understand their return</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">Start from the completed return and TaxStory builds a personalized walkthrough in plain English — reviewed by you, watched by your client on their own time.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {RETURN_FEATURES.map(f => (
              <div key={f.title} className="bg-brand-light rounded-2xl p-8">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-brand-dark text-lg mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planning features (shown only when the planning tools are on) ── */}
      {FEATURES.planningModules && (
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Year-round planning</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">Multi-year tax projections that actually land</h2>
            <p className="text-gray-500 mt-4 max-w-xl mx-auto">Model Roth conversions, required distributions and income scenarios under current federal law — side by side, in terms your clients can follow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {PLANNING_FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-brand-dark text-lg mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Trust Signals ── */}
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

      {/* ── Founding Member CTA ── */}
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
