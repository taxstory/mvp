// src/pages/marketing/HowItWorksPage.jsx
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import { FEATURES } from '../../config/features';
import { Icon, IconLabel } from '../../components/Icon';

const RETURN_STEPS = [
  { step: '01', title: 'Start from the completed return', desc: 'Drop in the client copy exported from your tax software, or enter the figures yourself. The PDF is read in your browser and never uploaded.' },
  { step: '02', title: 'Review the figures', desc: 'TaxStory reads only the financial lines that matter — income, deductions, tax, credits, refund — and checks that they add up. No names, no SSNs, ever.' },
  { step: '03', title: 'Approve a plain-English script', desc: 'TaxStory writes the walkthrough from the return\'s own figures. You review and edit it, and approve any amount that is not on the return, before the voiceover is made.' },
  { step: '04', title: 'Send it to your client', desc: 'A short narrated video, shared by secure link. Your client watches on their phone, at their own pace — and you can see when they did.' },
];

const PLANNING_STEPS = [
  { step: '01', title: 'Enter the client\'s situation', desc: 'Age, filing status, income sources and account balances. No personal identifiers needed — use a nickname or client code.' },
  { step: '02', title: 'Run a multi-year projection', desc: 'TaxStory applies current federal law — brackets, capital gains rates, NIIT, required distributions, Social Security and Medicare premiums — across the years you choose.' },
  { step: '03', title: 'Compare options', desc: 'Add a Roth conversion, shift income between years, or change retirement income, and compare the results side by side.' },
  { step: '04', title: 'Explain the option you recommend', desc: 'Pro plans turn a comparison into a narrated walkthrough, clearly labelled as an estimate, that your client can follow without a tax background.' },
];

function WorkflowSection({ type, steps, color }) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="relative">
        {steps.map((s, i) => (
          <div key={s.step} className="flex gap-8 mb-12 last:mb-0">
            <div className="flex flex-col items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${color}`}>
                {s.step}
              </div>
              {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-3" />}
            </div>
            <div className="pb-12 last:pb-0">
              <h3 className="font-semibold text-brand-dark text-xl mb-2">{s.title}</h3>
              <p className="text-gray-600 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />

      {/* Header */}
      <section className="bg-brand-dark text-white py-20 px-6 text-center">
        <h1 className="font-serif text-5xl font-bold mb-4">How TaxStory works</h1>
        <p className="text-gray-300 text-lg max-w-xl mx-auto">Explain the return after it is filed, and plan the year ahead — built around how tax and financial professionals actually work.</p>
      </section>

      {/* Return walkthrough workflow */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold text-brand-purple uppercase tracking-widest">After the return</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">From completed return to client walkthrough</h2>
          </div>
          <WorkflowSection type="cpa" steps={RETURN_STEPS} color="bg-brand-purple" />
        </div>
      </section>

      {/* Security callout */}
      <section className="py-12 px-6 bg-brand-light">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-3xl mb-3"><Icon name="lock" /> </div>
          <h3 className="font-semibold text-brand-dark text-xl mb-2">PII-Free by Design — not by policy</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Most tools parse everything and then try to remove sensitive data. TaxStory reads the return in your browser and keeps only the financial figures. Names, SSNs, addresses and dates of birth never reach our servers — because we never ask for them.
          </p>
        </div>
      </section>

      {/* Planning workflow (shown only when the planning tools are on) */}
      {FEATURES.planningModules && (
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">Year-round planning</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">Multi-year tax projections with scenario modeling</h2>
          </div>
          <WorkflowSection type="ria" steps={PLANNING_STEPS} color="bg-teal-600" />
        </div>
      </section>
      )}

      {/* What's included */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="font-serif text-4xl font-bold text-brand-dark mb-4">What's under the hood</h2>
          <p className="text-gray-500 mb-12 max-w-lg mx-auto">TaxStory is built on the infrastructure your clients expect from a professional-grade tool.</p>
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              { icon: 'note', title: 'Reviewed, fixed wording', desc: 'Scripts are built from the return\'s own figures in fixed, reviewed sentences — every amount is checked before it is narrated.' },
              { icon: 'mic', title: 'Natural narration', desc: 'High-quality text-to-speech voiceover. Only the narration text is sent — never a name or ID number.' },
              { icon: 'calculator', title: 'Federal tax engine, 2024–2026', desc: 'Brackets, capital gains, NIIT, credits, required distributions and Social Security, updated for the 2025 tax law changes and tested case by case.' },
              { icon: 'shield', title: 'Supabase + Row Level Security', desc: 'Your data is isolated at the database level. No user can access another firm\'s data.' },
              { icon: 'zap', title: 'Built for tax season', desc: 'Voiceovers are made in the background, so you can keep working while a walkthrough is prepared.' },
              { icon: 'projections', title: 'SOC 2 in progress', desc: 'Policy library, audit logging and access controls in place; SOC 2 Type I audit underway.' },
            ].map(item => (
              <div key={item.title} className="bg-gray-50 rounded-xl p-6">
                <div className="ts-ico-tile mb-3"><Icon name={item.icon} size={20} /></div>
                <h3 className="font-semibold text-brand-dark mb-1">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 bg-brand-dark text-white text-center">
        <h2 className="font-serif text-4xl font-bold mb-4">Ready to see it for yourself?</h2>
        <p className="text-gray-300 mb-8 max-w-md mx-auto">Start your free 14-day trial. No credit card required. Full access from day one.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/signup" className="bg-brand-purple hover:bg-brand-purple-hover text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
            Start Free Trial
          </Link>
          <Link to="/pricing" className="border border-white/30 hover:border-white text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
            View Pricing
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
