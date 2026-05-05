// src/pages/marketing/HowItWorksPage.jsx
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';

const CPA_STEPS = [
  { step: '01', title: 'Upload a completed tax return', desc: 'Drag and drop any PDF tax return directly into TaxStory. We accept all major tax software output formats.' },
  { step: '02', title: 'TaxStory parses the financial data', desc: 'Our PII-free parser extracts only the financial fields that matter — wages, deductions, tax liability, refund — and nothing personal. No names, no SSNs, ever.' },
  { step: '03', title: 'AI generates a personalized script', desc: 'Claude writes a warm, plain-English walkthrough of the return in about 15 seconds. You can review and edit before generating the video.' },
  { step: '04', title: 'Send the video to your client', desc: 'A 2–3 minute narrated video is generated and ready to share via a secure link. Your client watches it on their phone, at their pace — before they call you.' },
];

const RIA_STEPS = [
  { step: '01', title: 'Enter client profile and income data', desc: 'Input your client\'s age, filing status, income sources, and account balances. No personal identifiers required — use a client code if preferred.' },
  { step: '02', title: 'Run a multi-year projection', desc: 'TaxStory applies 2024 federal brackets, LTCG rates, NIIT, RMD logic, and Social Security inclusion formulas across up to 20 years.' },
  { step: '03', title: 'Model your scenarios', desc: 'Add a Roth conversion, shift income, model tax-loss harvesting, or compare with vs. without municipal bonds — side by side in seconds.' },
  { step: '04', title: 'Export client-ready charts', desc: 'Generate clear, visual projections your client can understand without a tax background. Pro tier includes narrated video summaries.' },
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
        <p className="text-gray-300 text-lg max-w-xl mx-auto">Two distinct workflows — one for CPAs, one for RIAs — built around how professionals actually work.</p>
      </section>

      {/* CPA Workflow */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold text-brand-purple uppercase tracking-widest">For CPAs</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">From completed return to client video in 90 seconds</h2>
          </div>
          <WorkflowSection type="cpa" steps={CPA_STEPS} color="bg-brand-purple" />
        </div>
      </section>

      {/* Security callout */}
      <section className="py-12 px-6 bg-brand-light">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h3 className="font-semibold text-brand-dark text-xl mb-2">PII-Free by Design — not by policy</h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            Most tools parse everything and then try to remove sensitive data. TaxStory's parser is configured to never extract personal identifiers in the first place. Names, SSNs, addresses, and dates of birth don't exist in our database — because we never asked for them. This is a SOC 2 security control and a promise to your clients.
          </p>
        </div>
      </section>

      {/* RIA Workflow */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-widest">For RIAs</span>
            <h2 className="font-serif text-4xl font-bold text-brand-dark mt-2">Multi-year tax projections with scenario modeling</h2>
          </div>
          <WorkflowSection type="ria" steps={RIA_STEPS} color="bg-teal-600" />
        </div>
      </section>

      {/* What's included */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="font-serif text-4xl font-bold text-brand-dark mb-4">What's under the hood</h2>
          <p className="text-gray-500 mb-12 max-w-lg mx-auto">TaxStory is built on the infrastructure your clients expect from a professional-grade tool.</p>
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              { icon: '🤖', title: 'Anthropic Claude API', desc: 'Industry-leading AI generates scripts that sound human, warm, and professional.' },
              { icon: '🎙️', title: 'OpenAI TTS', desc: 'High-quality text-to-speech voice generation for natural-sounding video narration.' },
              { icon: '🧮', title: '2024 Federal Tax Engine', desc: 'All brackets, LTCG rates, NIIT, RMD tables, and Social Security inclusion built-in and current.' },
              { icon: '🔐', title: 'Supabase + Row Level Security', desc: 'Your data is isolated at the database level. No user can access another firm\'s data.' },
              { icon: '⚡', title: 'Netlify Serverless', desc: 'Functions run on-demand with 60-second timeouts — no cold starts for video generation.' },
              { icon: '📊', title: 'SOC 2 Controls', desc: 'Full policy library, audit logging, access controls, and compliance calendar in place.' },
            ].map(item => (
              <div key={item.title} className="bg-gray-50 rounded-xl p-6">
                <div className="text-3xl mb-3">{item.icon}</div>
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
          <Link to="/signup" className="bg-brand-purple hover:bg-purple-600 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors">
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
