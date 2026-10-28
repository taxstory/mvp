// src/pages/marketing/PricingPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';

const PLANS = {
  cpa: [
    {
      name: 'CPA Basic',
      monthlyPrice: 49,
      annualPrice:  39,
      description:  'For solo CPAs getting started with AI client communication.',
      projections:  100,
      credits:      0,
      features: [
        '100 tax return projections per year',
        'PII-free PDF parsing',
        'AI-generated client scripts',
        'Unlimited clients',
        'Email support',
        'SOC 2 compliant infrastructure',
      ],
      highlight: false,
    },
    {
      name: 'CPA Pro',
      monthlyPrice: 99,
      annualPrice:  79,
      description:  'For growing CPA firms that want the full video pipeline.',
      projections:  300,
      credits:      100,
      features: [
        '300 tax return projections per year',
        '100 AI video credits per year',
        'PII-free PDF parsing',
        'AI-generated scripts + voiceover',
        'Shareable client video links',
        'Unlimited clients',
        'Priority support',
        'SOC 2 compliant infrastructure',
      ],
      highlight: true,
      badge: 'Most Popular',
    },
  ],
  ria: [
    {
      name: 'RIA Basic',
      monthlyPrice: 79,
      annualPrice:  63,
      description:  'For RIAs who need reliable multi-year tax projection modeling.',
      projections:  50,
      credits:      0,
      features: [
        '50 multi-year projections per year',
        '2024 federal tax brackets',
        'LTCG, NIIT, RMD calculations',
        'Scenario comparisons',
        'Unlimited clients',
        'Email support',
        'SOC 2 compliant infrastructure',
      ],
      highlight: false,
    },
    {
      name: 'RIA Pro',
      monthlyPrice: 149,
      annualPrice:  119,
      description:  'For RIAs who need both projections and client-facing video.',
      projections:  150,
      credits:      25,
      features: [
        '150 multi-year projections per year',
        '25 AI video credits per year',
        '2024 federal tax brackets',
        'LTCG, NIIT, RMD, Social Security',
        'Full scenario modeling',
        'Shareable client video links',
        'Unlimited clients',
        'Priority support',
        'SOC 2 compliant infrastructure',
      ],
      highlight: true,
      badge: 'Most Popular',
    },
  ],
};

function PlanCard({ plan, annual }) {
  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  return (
    <div className={`rounded-2xl p-8 flex flex-col ${plan.highlight ? 'bg-brand-dark text-white ring-2 ring-brand-purple' : 'bg-white border border-gray-200'}`}>
      {plan.badge && (
        <span className="inline-block bg-brand-purple text-white text-xs font-semibold px-3 py-1 rounded-full mb-4 w-fit">
          {plan.badge}
        </span>
      )}
      <h3 className={`font-serif text-2xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-brand-dark'}`}>{plan.name}</h3>
      <p className={`text-sm mb-6 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>{plan.description}</p>

      <div className="mb-6">
        <span className={`text-5xl font-bold ${plan.highlight ? 'text-white' : 'text-brand-dark'}`}>${price}</span>
        <span className={`text-sm ml-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-500'}`}>/month</span>
        {annual && <div className={`text-xs mt-1 ${plan.highlight ? 'text-purple-300' : 'text-green-600'}`}>billed annually · save ~20%</div>}
      </div>

      <div className={`text-xs font-semibold uppercase tracking-widest mb-3 ${plan.highlight ? 'text-purple-300' : 'text-gray-400'}`}>
        {plan.projections} projections/yr · {plan.credits > 0 ? `${plan.credits} video credits/yr` : 'Script generation only'}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <span className={plan.highlight ? 'text-purple-400' : 'text-teal-600'}>✓</span>
            <span className={plan.highlight ? 'text-gray-300' : 'text-gray-600'}>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/signup"
        className={`text-center font-semibold px-6 py-3 rounded-xl text-sm transition-colors ${
          plan.highlight
            ? 'bg-brand-purple hover:bg-purple-600 text-white'
            : 'border border-brand-purple text-brand-purple hover:bg-brand-light'
        }`}
      >
        Start Free Trial
      </Link>
    </div>
  );
}

export default function PricingPage() {
  const [annual,   setAnnual]   = useState(false);
  const [userType, setUserType] = useState('cpa');

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />

      {/* Header */}
      <section className="bg-brand-dark text-white py-20 px-6 text-center">
        <h1 className="font-serif text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-gray-300 text-lg max-w-xl mx-auto">No client caps. No hidden fees. No setup costs. Start your 14-day free trial — no credit card required.</p>
      </section>

      {/* Controls */}
      <section className="bg-white py-10 px-6 border-b border-gray-100">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-6">
          {/* User type toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            {['cpa', 'ria'].map(t => (
              <button
                key={t}
                onClick={() => setUserType(t)}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                  userType === t ? 'bg-white text-brand-dark shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'cpa' ? 'For CPAs' : 'For RIAs'}
              </button>
            ))}
          </div>

          {/* Billing toggle */}
          <div className="flex items-center gap-3 text-sm">
            <span className={annual ? 'text-gray-400' : 'font-semibold text-brand-dark'}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-11 h-6 rounded-full transition-colors ${annual ? 'bg-brand-purple' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-5' : ''}`} />
            </button>
            <span className={annual ? 'font-semibold text-brand-dark' : 'text-gray-400'}>Annual <span className="text-green-600 font-semibold">Save ~20%</span></span>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 px-6 bg-gray-50 flex-1">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          {PLANS[userType].map(plan => (
            <PlanCard key={plan.name} plan={plan} annual={annual} />
          ))}
        </div>

        {/* Credit model explainer */}
        <div className="max-w-4xl mx-auto mt-12 bg-white rounded-2xl p-8 border border-gray-200">
          <h3 className="font-semibold text-brand-dark text-lg mb-3">How credits and projections work</h3>
          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-brand-dark mb-1">Projections</p>
              <p>Each tax return you parse and each multi-year RIA projection you run counts as one projection. Credits reset annually — unused projections don't roll over.</p>
            </div>
            <div>
              <p className="font-semibold text-brand-dark mb-1">Video Credits (Pro tiers only)</p>
              <p>Each AI-generated client video uses one credit. Credits are annual and don't roll over. You can always generate scripts without using a credit — video rendering uses the credit.</p>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <div className="max-w-4xl mx-auto mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <span>✓ No client caps</span>
          <span>✓ 14-day free trial</span>
          <span>✓ Cancel anytime</span>
          <span>✓ SOC 2 compliance in progress</span>
          <span>✓ PII-free by design</span>
        </div>
      </section>

      {/* Founding member banner */}
      <section className="py-14 px-6 bg-brand-purple text-white text-center">
        <h2 className="font-serif text-3xl font-bold mb-3">Founding Member Pricing</h2>
        <p className="text-purple-100 mb-6 max-w-lg mx-auto">Sign up now and lock in founding member rates permanently — even as we grow and adjust pricing for new users.</p>
        <Link to="/signup" className="bg-white text-brand-purple font-semibold px-8 py-3 rounded-xl text-sm hover:bg-gray-100 transition-colors">
          Claim Founding Member Access
        </Link>
      </section>

      <MarketingFooter />
    </div>
  );
}
