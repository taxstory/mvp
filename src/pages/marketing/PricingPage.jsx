// src/pages/marketing/PricingPage.jsx
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import { FEATURES } from '../../config/features';

// Plans, prices and allowances MUST match BillingSettings.jsx and TIER_LIMITS in netlify/functions/_handler.js (what is actually charged and enforced).
// Monthly billing only: there are no annual prices in Stripe/create-checkout, so no annual toggle is offered.
const TAX_PLANS = [
  {
    name: 'Tax Basic', price: 79,
    description: 'Next-year projections from your clients\' completed returns.',
    projections: 100, credits: 0,
    features: [
      '100 return projections per year',
      'Return PDFs read in your browser — never uploaded',
      'Plain-language client scripts',
      '2024–2026 federal tax law, including the 2025 tax law changes',
      'Unlimited clients',
      'Email support',
    ],
    highlight: false,
  },
  {
    name: 'Tax Pro', price: 149,
    description: 'Everything in Basic, plus narrated client video walkthroughs.',
    projections: 300, credits: 100,
    features: [
      '300 return projections per year',
      '100 walkthrough credits per year',
      'Narrated, branded client video walkthroughs',
      'Secure share links and a client portal',
      'A communication record for every walkthrough',
      'Unlimited clients',
      'Priority support',
    ],
    highlight: true, badge: 'Most Popular',
  },
];
const PLANNING_PLANS = [
  {
    name: 'Investment Basic', price: 149,
    description: 'Multi-year tax projections and scenario comparisons for planning clients.',
    projections: 100, credits: 0,
    features: [
      '100 projections per year',
      'Scenario comparisons side by side',
      'Retirement income, RMDs, Social Security and Medicare (IRMAA)',
      'Roth conversion analysis',
      'Unlimited clients',
      'Email support',
    ],
    highlight: false,
  },
  {
    name: 'Investment Pro', price: 249,
    description: 'Everything in Investment Basic, plus narrated walkthroughs of returns and planning options.',
    projections: 200, credits: 50,
    features: [
      '200 projections per year',
      '50 walkthrough credits per year',
      'Narrated walkthroughs of returns and scenario comparisons',
      'Secure share links and a client portal',
      'A communication record for every walkthrough',
      'Unlimited clients',
      'Priority support',
    ],
    highlight: true, badge: 'Full featured',
  },
];

function PlanCard({ plan }) {
  const price = plan.price;
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
      </div>

      <div className={`text-xs font-semibold uppercase tracking-widest mb-3 ${plan.highlight ? 'text-purple-300' : 'text-gray-400'}`}>
        {plan.projections} projections/yr · {plan.credits > 0 ? `${plan.credits} walkthrough credits/yr` : 'No video walkthroughs'}
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

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />

      {/* Header */}
      <section className="bg-brand-dark text-white py-20 px-6 text-center">
        <h1 className="font-serif text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-gray-300 text-lg max-w-xl mx-auto">No client caps. No hidden fees. No setup costs. Start your 14-day free trial — no credit card required.</p>
      </section>

      {/* Plans */}
      <section className="py-16 px-6 bg-gray-50 flex-1">
        <h2 className="max-w-4xl mx-auto font-serif text-2xl font-bold text-brand-dark mb-6">Tax return projections and walkthroughs</h2>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          {TAX_PLANS.map(plan => <PlanCard key={plan.name} plan={plan} />)}
        </div>
        {/* Planning plans are sold only once the planning tools are switched on (VITE_ENABLE_PLANNING) — never advertise hidden features. */}
        {FEATURES.planningModules && (
          <>
            <h2 className="max-w-4xl mx-auto font-serif text-2xl font-bold text-brand-dark mt-14 mb-6">Tax planning for financial advisors</h2>
            <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
              {PLANNING_PLANS.map(plan => <PlanCard key={plan.name} plan={plan} />)}
            </div>
          </>
        )}

        {/* Credit model explainer */}
        <div className="max-w-4xl mx-auto mt-12 bg-white rounded-2xl p-8 border border-gray-200">
          <h3 className="font-semibold text-brand-dark text-lg mb-3">How credits and projections work</h3>
          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-brand-dark mb-1">Projections</p>
              <p>Each return you import or enter, and each multi-year projection you run, counts as one projection. Allowances reset each year on your subscription date — unused projections don't roll over.</p>
            </div>
            <div>
              <p className="font-semibold text-brand-dark mb-1">Walkthrough credits (Pro plans)</p>
              <p>Each narrated walkthrough uses one credit when its voiceover is made. Scripts are always free to generate and review. Plan credits reset yearly; extra credit packs never expire.</p>
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
