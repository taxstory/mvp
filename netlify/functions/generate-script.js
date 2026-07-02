// netlify/functions/generate-script.js
// Generates a warm, plain-English client video script from parsed tax data.
// Uses raw fetch to the Anthropic API — matches the SES-sandbox-safe pattern
// already established in parse-return.js. Does NOT use @anthropic-ai/sdk.

const { createClient } = require('@supabase/supabase-js');

exports.config = { timeout: 26 };

const SUPABASE_URL  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: h, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' }) };
  if (!ANTHROPIC_KEY)                 return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY env var' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Auth
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, headers: h, body: JSON.stringify({ error: 'Unauthorized' }) };

  // Body
  let taxReturnId;
  try { ({ taxReturnId } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }
  if (!taxReturnId) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Missing taxReturnId' }) };

  try {
    // Verify ownership and fetch parsed data
    const { data: taxReturn, error: fetchErr } = await supabase
      .from('tax_returns')
      .select('id, user_id, parsed_data, clients(name)')
      .eq('id', taxReturnId)
      .single();

    if (fetchErr || !taxReturn) return { statusCode: 404, headers: h, body: JSON.stringify({ error: 'Tax return not found' }) };
    if (taxReturn.user_id !== user.id) return { statusCode: 403, headers: h, body: JSON.stringify({ error: 'Forbidden — not your return' }) };
    if (!taxReturn.parsed_data) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Return has not been parsed yet' }) };

    const pd = taxReturn.parsed_data;
    const clientName = taxReturn.clients?.name || 'your client';

    const prompt = `Write a warm, plain-English 2-3 minute video script walking ${clientName} through their tax return. This is spoken narration for a voiceover — write it as natural speech, not a written document.

Tax data (already PII-free — no names, SSNs, or personal identifiers were extracted):
${JSON.stringify(pd, null, 2)}

Structure the script with these sections, flowing naturally without explicit headers:
1. Warm greeting and overview of how their year went
2. Income sources explained simply
3. How their taxes were calculated (deductions, bracket, effective rate)
4. The bottom line — refund or amount owed, explained clearly
5. One or two practical planning tips for next year
6. Warm closing inviting questions

Rules:
- No tax jargon without immediate plain-English explanation
- Second person ("you", "your") throughout
- Conversational tone, as if explaining to a friend
- 300-450 words total
- Do not include any names, SSNs, or addresses — speak generically ("you" not a specific name) since none were provided in the data
- Return ONLY the script text, no headers, no markdown, no preamble`;

    // Raw fetch to Anthropic API — no SDK, avoids Netlify SES sandbox issues
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':          ANTHROPIC_KEY,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-opus-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: `Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 300)}` }) };
    }

    const anthropicData = await anthropicRes.json();
    const script = anthropicData.content?.[0]?.text?.trim();

    if (!script) return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Claude returned an empty script' }) };

    // Save script and advance status
    const { error: updateErr } = await supabase.from('tax_returns').update({
      script,
      status: 'script_ready',
    }).eq('id', taxReturnId);

    if (updateErr) console.error('generate-script DB update warning:', updateErr.message);

    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'script_generated',
      description: `Script generated for return ${taxReturnId} (${script.split(' ').length} words)`,
    }).catch(() => {});

    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, script }) };

  } catch (err) {
    console.error('generate-script error:', err.message);
    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: 'script_error',
      description: `Script generation failed for ${taxReturnId}: ${err.message}`,
    }).catch(() => {});
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) };
  }
};
