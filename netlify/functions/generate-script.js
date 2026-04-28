// netlify/functions/generate-script.js
// Uses Anthropic Claude API to generate a personalized tax return walkthrough script.
// Input: PII-free parsed tax data. Output: 2–3 minute conversational video script.

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { taxReturnId, userId } = JSON.parse(event.body);

    // Verify ownership and fetch parsed data
    const { data: record, error } = await supabase
      .from('tax_returns')
      .select('id, user_id, parsed_data, status')
      .eq('id', taxReturnId)
      .single();

    if (error || !record) return { statusCode: 404, body: 'Not found' };
    if (record.user_id !== userId) return { statusCode: 403, body: 'Forbidden' };
    if (record.status !== 'parsed') return { statusCode: 400, body: 'Return not yet parsed' };

    const data = record.parsed_data;

    // ── Claude script generation prompt ──────────────────────────────
    const prompt = `You are a friendly, knowledgeable CPA creating a personalized video walkthrough for a client's tax return. Write a warm, clear, conversational script that a client can easily understand. Avoid jargon. The script should run approximately 2–3 minutes when read aloud at a comfortable pace.

Here is the client's tax return data (all PII has been removed):
${JSON.stringify(data, null, 2)}

Write the script in sections:
1. Brief friendly greeting (15 seconds)
2. Overview of their tax situation (20 seconds)  
3. Key income sources (30 seconds)
4. How they were taxed — effective rate, key deductions (40 seconds)
5. Their refund or amount owed, and why (30 seconds)
6. 2–3 personalized planning tips for next year based on their situation (30 seconds)
7. Warm close with CTA to schedule a follow-up (15 seconds)

IMPORTANT:
- Never reference any personal identifiers — no names, SSNs, addresses
- Speak as if talking directly to the client ("you" and "your")
- Use plain language: "you earned" not "gross wages were"
- Format numbers as dollars with commas (e.g., $42,500)
- Keep it warm, professional, and reassuring`;

    const response = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const script = response.content[0].text;

    // Save script and update status
    await supabase.from('tax_returns').update({
      script_text: script,
      status:      'script_ready',
      updated_at:  new Date().toISOString(),
    }).eq('id', taxReturnId);

    // Audit log
    await supabase.from('audit_log').insert({
      user_id:  userId,
      action:   'script_generated',
      resource: taxReturnId,
      metadata: { model: 'claude-opus-4-5', tokens: response.usage?.output_tokens },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, script }),
    };

  } catch (err) {
    console.error('[generate-script] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
