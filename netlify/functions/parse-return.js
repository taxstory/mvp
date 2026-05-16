// netlify/functions/parse-return.js
// Uses raw fetch to Anthropic API — avoids SDK sandbox issues

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const ALLOWED = new Set([
  'taxYear','filingStatus','wages','taxableInterest','qualifiedDividends','ordinaryDividends',
  'iraDistributions','taxableIRA','pensionsAnnuities','taxablePensions','socialSecurityBenefits',
  'taxableSocialSecurity','capitalGainLoss','scheduleC_netProfit','scheduleE_netIncome','otherIncome',
  'totalIncome','adjustmentsToIncome','agi','standardDeduction','itemizedDeductions','qbiDeduction',
  'taxableIncome','regularTax','alternativeMinTax','selfEmploymentTax','totalTax','totalPayments',
  'federalWithheld','estimatedTaxPayments','refund','amountOwed','effectiveRate','marginalRate',
  'numberOfDependents',
]);

exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: h, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Config checks
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' }) };
  if (!ANTHROPIC_KEY)                 return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY env var' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Auth
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, headers: h, body: JSON.stringify({ error: 'Unauthorized' }) };

  // Body
  let taxReturnId, storagePath;
  try { ({ taxReturnId, storagePath } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }
  if (!taxReturnId || !storagePath) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Missing taxReturnId or storagePath' }) };

  try {
    // Download PDF from Supabase storage
    const { data: fileData, error: dlErr } = await supabase.storage.from('tax-returns').download(storagePath);
    if (dlErr) return { statusCode: 500, headers: h, body: JSON.stringify({ error: `Storage download failed: ${dlErr.message}` }) };

    const base64PDF = Buffer.from(await fileData.arrayBuffer()).toString('base64');

    // Call Anthropic API directly via fetch (no SDK)
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            ANTHROPIC_KEY,
        'anthropic-version':    '2023-06-01',
        'anthropic-beta':       'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model:      'claude-opus-4-20250514',
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
              text: `Extract ONLY financial figures from this Form 1040 tax return. Return a JSON object only — no explanation, no markdown.

Keys to extract (omit any that are blank or zero):
taxYear (integer e.g. 2025), filingStatus (string), wages (Line 1z), taxableInterest (Line 2b),
ordinaryDividends (Line 3b), qualifiedDividends (Line 3a), taxableIRA (Line 4b),
taxablePensions (Line 5b), taxableSocialSecurity (Line 6b), capitalGainLoss (Line 7a),
scheduleC_netProfit, otherIncome (Line 8), totalIncome (Line 9), adjustmentsToIncome (Line 10),
agi (Line 11a), standardDeduction (Line 12e), itemizedDeductions, qbiDeduction (Line 13a),
taxableIncome (Line 15), regularTax (Line 16), alternativeMinTax, selfEmploymentTax,
totalTax (Line 24), federalWithheld (Line 25d), estimatedTaxPayments (Line 26),
refund (Line 35a), amountOwed (Line 37), numberOfDependents.

DO NOT include: names, SSNs, EINs, addresses, dates of birth, or any personal identifiers.
Return ONLY the JSON object.`,
            },
          ],
        }),
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: `Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 300)}` }) };
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text || '{}';

    let parsedData;
    try {
      const clean = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(clean);
    } catch {
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: `Could not parse Claude response: ${rawText.slice(0, 200)}` }) };
    }

    // Strip non-allowlisted keys
    for (const k of Object.keys(parsedData)) { if (!ALLOWED.has(k)) delete parsedData[k]; }

    // Derive effective rate
    if (!parsedData.effectiveRate && parsedData.totalTax > 0 && parsedData.agi > 0) {
      parsedData.effectiveRate = parseFloat((parsedData.totalTax / parsedData.agi * 100).toFixed(1));
    }

    // Save to DB
    await supabase.from('tax_returns').update({
      status: 'parsed',
      parsed_data: parsedData,
      tax_year: parsedData.taxYear || null,
    }).eq('id', taxReturnId);

    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'parse_success',
      description: `Parsed ${taxReturnId} — ${Object.keys(parsedData).length} fields`,
    }).catch(() => {});

    const hasData = ['wages','totalIncome','agi','taxableIncome','totalTax'].some(k => (parsedData[k] || 0) > 0);

    return {
      statusCode: 200,
      headers: h,
      body: JSON.stringify({
        success: true,
        data: parsedData,
        warning: hasData ? null : 'Limited data extracted. This PDF may be a blank template or scanned image. Please use a completed, digitally-generated tax return.',
      }),
    };

  } catch (err) {
    await supabase.from('tax_returns').update({ status: 'error' }).eq('id', taxReturnId).catch(() => {});
    console.error('parse-return error:', err.message);
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) };
  }
};
