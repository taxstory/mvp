// netlify/functions/parse-return.js
// PII-free tax return parser.
// Uses Anthropic Claude to extract financial data from PDF text.
// No pdf-parse dependency — uses built-in Node.js Buffer + Claude API.

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY);

const ALLOWED_KEYS = new Set([
  'taxYear','filingStatus',
  'wages','taxableInterest','qualifiedDividends','ordinaryDividends',
  'iraDistributions','taxableIRA','pensionsAnnuities','taxablePensions',
  'socialSecurityBenefits','taxableSocialSecurity','capitalGainLoss',
  'scheduleC_netProfit','scheduleE_netIncome','otherIncome',
  'totalIncome','adjustmentsToIncome','agi',
  'standardDeduction','itemizedDeductions','qbiDeduction',
  'taxableIncome','regularTax','alternativeMinTax',
  'selfEmploymentTax','totalTax','totalPayments',
  'federalWithheld','estimatedTaxPayments','refund','amountOwed',
  'effectiveRate','marginalRate','numberOfDependents',
]);

const SYSTEM_PROMPT = `You are a tax data extraction assistant. Extract ONLY financial figures from this tax return PDF.

CRITICAL SECURITY RULES — follow exactly:
1. NEVER extract: names, SSNs, EINs, addresses, phone numbers, email addresses, dates of birth
2. ONLY extract: dollar amounts and the specific fields listed below
3. If a field is blank or not present, omit it entirely — do not return null or 0
4. Return ONLY a valid JSON object, no other text

Extract these fields (camelCase keys only, values must be numbers):
- taxYear (integer, e.g. 2025)
- filingStatus (string: "Single", "Married filing jointly", "Married filing separately", "Head of household", "Qualifying surviving spouse")
- wages (Line 1z total W-2 wages)
- taxableInterest (Line 2b)
- ordinaryDividends (Line 3b)
- qualifiedDividends (Line 3a)
- taxableIRA (Line 4b taxable IRA distributions)
- taxablePensions (Line 5b taxable pensions/annuities)
- taxableSocialSecurity (Line 6b taxable social security)
- capitalGainLoss (Line 7a)
- scheduleC_netProfit (Schedule C net profit)
- otherIncome (Line 8 additional income from Schedule 1)
- totalIncome (Line 9 total income)
- adjustmentsToIncome (Line 10)
- agi (Line 11a adjusted gross income)
- standardDeduction (Line 12e standard or itemized deduction)
- itemizedDeductions (Schedule A total if itemized)
- qbiDeduction (Line 13a qualified business income deduction)
- taxableIncome (Line 15)
- regularTax (Line 16)
- alternativeMinTax (Line 17 AMT)
- selfEmploymentTax (Schedule SE tax)
- totalTax (Line 24)
- federalWithheld (Line 25d federal income tax withheld)
- estimatedTaxPayments (Line 26)
- refund (Line 35a refund amount)
- amountOwed (Line 37 amount owed)
- numberOfDependents (count of dependents claimed)

Return only the JSON object. Example: {"taxYear":2025,"filingStatus":"Single","wages":95000,"totalIncome":95000}`;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Config checks
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables' }) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Missing Supabase env vars. SUPABASE_URL: ${!!SUPABASE_URL}, SUPABASE_SERVICE_ROLE_KEY: ${!!SUPABASE_KEY}` }) };
  }

  // Auth
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let taxReturnId, storagePath;
  try {
    ({ taxReturnId, storagePath } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!taxReturnId || !storagePath) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing taxReturnId or storagePath' }) };
  }

  try {
    // Download PDF from Supabase storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('tax-returns').download(storagePath);
    if (dlErr) throw new Error(`Storage download failed: ${dlErr.message}`);

    // Convert to base64 for Claude's document API
    const arrayBuffer = await fileData.arrayBuffer();
    const base64PDF   = Buffer.from(arrayBuffer).toString('base64');

    // Send to Claude for extraction
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64PDF,
            },
          },
          {
            type: 'text',
            text: 'Extract the financial data from this tax return. Return only the JSON object as instructed.',
          },
        ],
      }],
    });

    // Parse Claude's response
    const rawText = message.content[0]?.text || '{}';
    let parsedData;
    try {
      // Strip any markdown code fences if present
      const clean = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsedData  = JSON.parse(clean);
    } catch {
      throw new Error(`Failed to parse extraction result: ${rawText.slice(0, 200)}`);
    }

    // Strip any non-allowlisted keys (security enforcement)
    for (const k of Object.keys(parsedData)) {
      if (!ALLOWED_KEYS.has(k)) delete parsedData[k];
    }

    // Compute effective rate if not returned
    if (!parsedData.effectiveRate && parsedData.totalTax && parsedData.agi && parsedData.agi > 0) {
      parsedData.effectiveRate = parseFloat((parsedData.totalTax / parsedData.agi * 100).toFixed(1));
    }

    // Check if meaningful data was extracted
    const financialKeys = ['wages','totalIncome','agi','taxableIncome','totalTax','federalWithheld','refund','amountOwed'];
    const hasData = financialKeys.some(k => parsedData[k] != null && parsedData[k] > 0);

    // Save to Supabase
    await supabase.from('tax_returns').update({
      status:      'parsed',
      parsed_data: parsedData,
      tax_year:    parsedData.taxYear || null,
    }).eq('id', taxReturnId);

    // Audit log
    await supabase.from('audit_log').insert({
      user_id:     user.id,
      action:      'parse_success',
      description: `Parsed ${taxReturnId} via Claude — ${Object.keys(parsedData).length} fields extracted`,
    }).catch(() => {});

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: parsedData,
        warning: hasData ? null
          : 'Limited data extracted. This may be a blank template or scanned image. Try a completed, digitally-generated tax return.',
      }),
    };

  } catch (err) {
    await supabase.from('tax_returns').update({ status: 'error' }).eq('id', taxReturnId).catch(() => {});
    await supabase.from('audit_log').insert({
      user_id:     user?.id,
      action:      'parse_error',
      description: `Parse error for ${taxReturnId}: ${err.message}`,
    }).catch(() => {});

    console.error('parse-return error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
