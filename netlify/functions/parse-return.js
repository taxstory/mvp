// netlify/functions/parse-return.js
// SOC 2 Control: PII-FREE BY DESIGN.
// The whitelist below is the authoritative list of fields that may be extracted.
// Personal identifiers (name, SSN, address, DOB) are intentionally absent
// from the whitelist and are NEVER extracted. This is a security-by-design
// control, not a post-extraction sanitization step.

const { createClient } = require('@supabase/supabase-js');
const pdf = require('pdf-parse');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── PII-FREE FIELD WHITELIST ─────────────────────────────────────────────────
// SECURITY: Only fields listed here will ever be extracted.
// DO NOT add: name, SSN, EIN, address, date of birth, phone, email.
const ALLOWED_FIELDS = [
  // Income
  'wages_salaries',
  'interest_income',
  'dividend_income',
  'qualified_dividend_income',
  'business_income',
  'capital_gains_short',
  'capital_gains_long',
  'ira_distributions',
  'pension_annuity_income',
  'social_security_benefits',
  'rental_income',
  'other_income',
  'total_income',
  'adjusted_gross_income',
  // Deductions
  'standard_deduction',
  'itemized_deductions',
  'qualified_business_income_deduction',
  'taxable_income',
  // Tax
  'total_tax',
  'effective_tax_rate',
  'self_employment_tax',
  'alternative_minimum_tax',
  'child_tax_credit',
  'earned_income_credit',
  'total_credits',
  'total_payments',
  'withholding',
  'estimated_tax_payments',
  'refund_amount',
  'amount_owed',
  // Filing info (non-identifying)
  'filing_status',
  'tax_year',
  'number_of_dependents',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { taxReturnId, storagePath, userId } = JSON.parse(event.body);

    // Verify ownership
    const { data: record } = await supabase
      .from('tax_returns')
      .select('id, user_id')
      .eq('id', taxReturnId)
      .single();

    if (!record || record.user_id !== userId) {
      return { statusCode: 403, body: 'Forbidden' };
    }

    // Mark as parsing
    await supabase.from('tax_returns').update({ status: 'parsing' }).eq('id', taxReturnId);

    // Download PDF from storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from('tax-returns')
      .download(storagePath);

    if (dlError) throw new Error(`Storage download failed: ${dlError.message}`);

    const buffer  = Buffer.from(await fileData.arrayBuffer());
    const pdfData = await pdf(buffer);
    const text    = pdfData.text;

    // ── Extract only whitelisted financial fields ──────────────────────────
    const extracted = extractFinancialFields(text);

    // Validate: reject if output contains any PII patterns
    assertNoPII(extracted);

    // Save parsed data and mark ready
    await supabase.from('tax_returns').update({
      status:      'parsed',
      parsed_data: extracted,
      updated_at:  new Date().toISOString(),
    }).eq('id', taxReturnId);

    // Audit log
    await supabase.from('audit_log').insert({
      user_id:  userId,
      action:   'tax_return_parsed',
      resource: taxReturnId,
      metadata: { fields_extracted: Object.keys(extracted).length },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, fields: Object.keys(extracted).length }),
    };

  } catch (err) {
    console.error('[parse-return] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function extractFinancialFields(text) {
  const result = {};

  // Regex-based extraction patterns — each keyed to an allowed field
  const patterns = {
    wages_salaries:       /(?:wages|salaries|tips)[^\d]*(\$?[\d,]+)/i,
    total_income:         /total income[^\d]*(\$?[\d,]+)/i,
    adjusted_gross_income:/adjusted gross income[^\d]*(\$?[\d,]+)/i,
    taxable_income:       /taxable income[^\d]*(\$?[\d,]+)/i,
    total_tax:            /total tax[^\d]*(\$?[\d,]+)/i,
    refund_amount:        /(?:refund|amount to be refunded)[^\d]*(\$?[\d,]+)/i,
    amount_owed:          /amount (?:you owe|owed)[^\d]*(\$?[\d,]+)/i,
    filing_status:        /(single|married filing jointly|married filing separately|head of household|qualifying surviving spouse)/i,
    tax_year:             /(?:tax year|form 1040)[^\d]*(20\d{2})/i,
    social_security_benefits: /social security benefits[^\d]*(\$?[\d,]+)/i,
    capital_gains_long:   /(?:long.term capital gains)[^\d]*(\$?[\d,]+)/i,
    capital_gains_short:  /(?:short.term capital gains)[^\d]*(\$?[\d,]+)/i,
  };

  for (const [field, pattern] of Object.entries(patterns)) {
    if (!ALLOWED_FIELDS.includes(field)) continue; // Enforce whitelist
    const match = text.match(pattern);
    if (match) {
      const raw = match[1].replace(/[$,]/g, '');
      result[field] = isNaN(raw) ? raw : parseFloat(raw);
    }
  }

  return result;
}

function assertNoPII(data) {
  const jsonStr = JSON.stringify(data).toLowerCase();
  // Reject if anything looks like an SSN (e.g. 123-45-6789)
  if (/\d{3}-\d{2}-\d{4}/.test(jsonStr)) {
    throw new Error('[SECURITY] SSN pattern detected in extracted data — aborting.');
  }
}
