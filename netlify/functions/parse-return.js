// netlify/functions/parse-return.js
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // ── Env var diagnostics ──────────────────────────────────────────
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SUPABASE_URL) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing env: SUPABASE_URL (also tried VITE_SUPABASE_URL). Add SUPABASE_URL to Netlify env vars.' }) };
  if (!SUPABASE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing env: SUPABASE_SERVICE_ROLE_KEY' }) };
  if (!ANTHROPIC_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing env: ANTHROPIC_API_KEY' }) };

  // ── Auth ─────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Supabase init failed: ${e.message}` }) };
  }

  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  // ── Parse request ─────────────────────────────────────────────────
  let taxReturnId, storagePath;
  try {
    ({ taxReturnId, storagePath } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  if (!taxReturnId || !storagePath) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing taxReturnId or storagePath' }) };

  try {
    // ── Download PDF ───────────────────────────────────────────────
    const { data: fileData, error: dlErr } = await supabase.storage.from('tax-returns').download(storagePath);
    if (dlErr) return { statusCode: 500, headers, body: JSON.stringify({ error: `Storage download failed: ${dlErr.message}. Check that the tax-returns bucket exists and RLS allows service role access.` }) };

    const base64PDF = Buffer.from(await fileData.arrayBuffer()).toString('base64');

    // ── Claude extraction ──────────────────────────────────────────
    let anthropic;
    try {
      anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Anthropic init failed: ${e.message}` }) };
    }

    let message;
    try {
      message = await anthropic.messages.create({
        model: 'claude-opus-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64PDF },
            },
            {
              type: 'text',
              text: `Extract ONLY financial figures from this tax return. Return a JSON object with these keys (omit any that are blank):
taxYear (integer), filingStatus (string), wages, taxableInterest, ordinaryDividends, qualifiedDividends,
taxableIRA, taxablePensions, taxableSocialSecurity, capitalGainLoss, scheduleC_netProfit, otherIncome,
totalIncome, adjustmentsToIncome, agi, standardDeduction, itemizedDeductions, qbiDeduction,
taxableIncome, regularTax, alternativeMinTax, selfEmploymentTax, totalTax, federalWithheld,
estimatedTaxPayments, refund, amountOwed, numberOfDependents.
DO NOT include names, SSNs, addresses, or any personal identifiers.
Return ONLY the JSON object, no explanation.`,
            },
          ],
        }],
      });
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Claude API call failed: ${e.message}` }) };
    }

    // ── Parse response ─────────────────────────────────────────────
    const rawText = message.content[0]?.text || '{}';
    let parsedData;
    try {
      const clean = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(clean);
    } catch {
      return { statusCode: 500, headers, body: JSON.stringify({ error: `Could not parse Claude response: ${rawText.slice(0, 300)}` }) };
    }

    // ── Security: strip non-allowlisted keys ───────────────────────
    const ALLOWED = new Set(['taxYear','filingStatus','wages','taxableInterest','qualifiedDividends',
      'ordinaryDividends','iraDistributions','taxableIRA','pensionsAnnuities','taxablePensions',
      'socialSecurityBenefits','taxableSocialSecurity','capitalGainLoss','scheduleC_netProfit',
      'scheduleE_netIncome','otherIncome','totalIncome','adjustmentsToIncome','agi',
      'standardDeduction','itemizedDeductions','qbiDeduction','taxableIncome','regularTax',
      'alternativeMinTax','selfEmploymentTax','totalTax','totalPayments','federalWithheld',
      'estimatedTaxPayments','refund','amountOwed','effectiveRate','marginalRate','numberOfDependents']);
    for (const k of Object.keys(parsedData)) { if (!ALLOWED.has(k)) delete parsedData[k]; }

    // Compute effective rate
    if (!parsedData.effectiveRate && parsedData.totalTax && parsedData.agi > 0) {
      parsedData.effectiveRate = parseFloat((parsedData.totalTax / parsedData.agi * 100).toFixed(1));
    }

    // ── Save to DB ────────────────────────────────────────────────
    const { error: updateErr } = await supabase.from('tax_returns').update({
      status: 'parsed',
      parsed_data: parsedData,
      tax_year: parsedData.taxYear || null,
    }).eq('id', taxReturnId);
    if (updateErr) console.warn('DB update warning:', updateErr.message);

    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'parse_success',
      description: `Parsed ${taxReturnId} — ${Object.keys(parsedData).length} fields`,
    }).catch(() => {});

    const hasData = ['wages','totalIncome','agi','taxableIncome','totalTax'].some(k => parsedData[k] > 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: parsedData,
        warning: hasData ? null : 'Limited data extracted. This may be a blank template or scanned/image-based PDF.',
      }),
    };

  } catch(err) {
    await supabase?.from('tax_returns').update({ status: 'error' }).eq('id', taxReturnId).catch(() => {});
    console.error('parse-return unhandled error:', err.message, err.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Unhandled error: ${err.message}` }) };
  }
};
