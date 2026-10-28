// src/pages/legal/DPA.jsx
import MarketingNav    from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';

export default function DPA() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <div className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-serif text-4xl font-bold text-brand-dark mb-2">Data Processing Agreement</h1>
        <p className="text-gray-400 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <div className="space-y-8 text-gray-700 text-sm leading-relaxed">
          <section><h2 className="font-semibold text-brand-dark text-xl mb-3">1. Scope</h2><p>This Data Processing Agreement ("DPA") governs the processing of personal data by Lakeside Advisory Group, LLC ("Processor") on behalf of TaxStory platform users ("Controller") in connection with the TaxStory service.</p></section>
          <section><h2 className="font-semibold text-brand-dark text-xl mb-3">2. PII-Free Architecture</h2><p>TaxStory's PDF parser is configured at the extraction layer to never process personally identifiable information from tax returns. Personal identifiers including but not limited to taxpayer names, Social Security numbers, Employer Identification Numbers, home addresses, and dates of birth are excluded from extraction by parser configuration. This is a technical control, not a policy-level control.</p></section>
          <section><h2 className="font-semibold text-brand-dark text-xl mb-3">3. Data processed</h2><p>TaxStory processes: account credentials (email, hashed password), firm identification (firm name), financial tax fields from uploaded returns (see PII-Free Architecture above), subscription and billing records, and system usage logs. No client personal information is processed by TaxStory.</p></section>
          <section><h2 className="font-semibold text-brand-dark text-xl mb-3">4. Security measures</h2><p>TaxStory implements: AES-256 encryption at rest (Supabase), TLS 1.2+ in transit, Row Level Security isolating all user data, API key rotation policies, audit logging for all data access events, and active SOC 2 Type I compliance preparation.</p></section>
          <section><h2 className="font-semibold text-brand-dark text-xl mb-3">5. Sub-processors</h2><p>TaxStory uses the following sub-processors: Supabase Inc. (database), Stripe Inc. (payments), Anthropic PBC (AI processing), OpenAI LLC (voice synthesis), Resend Inc. (email), Functional Software Inc. / Sentry (error monitoring), PostHog Inc. (analytics — PII-free). A complete and current sub-processor list is available upon written request.</p></section>
          <section><h2 className="font-semibold text-brand-dark text-xl mb-3">6. Data requests</h2><p>To request a copy, correction, or deletion of your data, contact: <a href="mailto:privacy@tellmytaxstory.com" className="text-brand-purple underline">privacy@tellmytaxstory.com</a>. We will respond within 30 days.</p></section>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}
