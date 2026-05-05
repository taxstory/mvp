// src/pages/legal/PrivacyPolicy.jsx
import { Link } from 'react-router-dom';
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <div className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-serif text-4xl font-bold text-brand-dark mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">1. Who we are</h2>
            <p>TaxStory is operated by Lakeside Advisory Group, LLC. We provide an AI-powered tax client communication platform for CPAs and Registered Investment Advisors. Our website is tellmytaxstory.com.</p>
          </section>
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">2. PII-Free by Design</h2>
            <p>TaxStory's core architecture is designed to never extract personally identifiable information (PII) from tax return documents. Our PDF parser is configured at the extraction layer to collect only financial fields (income, tax liability, deductions, refund amounts, filing status). Names, Social Security numbers, addresses, and dates of birth are never extracted, stored, or processed by TaxStory.</p>
          </section>
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">3. Information we collect</h2>
            <p>We collect: your email address and password (for account authentication), your firm name (for account setup), subscription and billing information processed by Stripe, financial fields extracted from tax return PDFs (never PII — see Section 2), and usage analytics collected by PostHog in PII-scrubbed form.</p>
          </section>
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">4. How we use your information</h2>
            <p>We use collected information to: operate and maintain your TaxStory account, process payments and manage subscriptions, generate AI-powered tax return scripts and videos, send transactional emails (account confirmation, trial reminders, billing notifications), and monitor service performance and errors.</p>
          </section>
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">5. Data security</h2>
            <p>TaxStory uses Supabase with Row Level Security (RLS) to isolate data between users. All data is encrypted at rest and in transit. We are actively pursuing SOC 2 Type I compliance. Our full security policy is available in our Data Processing Agreement.</p>
          </section>
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">6. Third-party services</h2>
            <p>We use the following third-party services: Supabase (database and auth), Stripe (payment processing), Anthropic (AI script generation), OpenAI (text-to-speech), Resend (transactional email), Sentry (error monitoring), and PostHog (analytics). Each service is governed by its own privacy policy.</p>
          </section>
          <section>
            <h2 className="font-semibold text-brand-dark text-xl mb-3">7. Contact</h2>
            <p>Privacy questions: <a href="mailto:privacy@tellmytaxstory.com" className="text-brand-purple underline">privacy@tellmytaxstory.com</a></p>
          </section>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
