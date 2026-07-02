// netlify/functions/generate-audio.js
// Converts a generated script to a voiceover MP3 via OpenAI TTS,
// stores it in Supabase Storage, and deducts one video credit.

const { createClient } = require('@supabase/supabase-js');

exports.config = { timeout: 26 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: h, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' }) };
  if (!OPENAI_KEY)                    return { statusCode: 500, headers: h, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY env var' }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, headers: h, body: JSON.stringify({ error: 'Unauthorized' }) };

  let taxReturnId, script;
  try { ({ taxReturnId, script } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }
  if (!taxReturnId || !script) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'Missing taxReturnId or script' }) };

  try {
    // Verify ownership
    const { data: taxReturn, error: fetchErr } = await supabase
      .from('tax_returns').select('id, user_id').eq('id', taxReturnId).single();
    if (fetchErr || !taxReturn) return { statusCode: 404, headers: h, body: JSON.stringify({ error: 'Tax return not found' }) };
    if (taxReturn.user_id !== user.id) return { statusCode: 403, headers: h, body: JSON.stringify({ error: 'Forbidden — not your return' }) };

    // Check credit balance before spending OpenAI cost
    const { data: usage } = await supabase.from('usage_counters').select('credits_used').eq('user_id', user.id).maybeSingle();
    const { data: sub }   = await supabase.from('subscriptions').select('tier,status').eq('user_id', user.id).maybeSingle();

    const TIER_CREDITS = { cpa_basic: 0, cpa_pro: 100, ria_basic: 0, ria_pro: 25, trial: 3 };
    const tier = sub?.status === 'active' ? (sub.tier || 'cpa_pro') : 'trial';
    const creditsTotal = TIER_CREDITS[tier] ?? 0;
    const creditsUsed  = usage?.credits_used || 0;
    const creditsRemaining = Math.max(0, creditsTotal - creditsUsed);

    if (creditsRemaining <= 0) {
      return { statusCode: 402, headers: h, body: JSON.stringify({ error: 'No video credits remaining. Purchase more credits or upgrade your plan.' }) };
    }

    // Call OpenAI TTS via raw fetch (consistent with the rest of the pipeline)
    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input: script,
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return { statusCode: 500, headers: h, body: JSON.stringify({ error: `OpenAI TTS error ${ttsRes.status}: ${errText.slice(0, 300)}` }) };
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    const path = `${user.id}/${taxReturnId}/voiceover.mp3`;

    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
    if (uploadErr) return { statusCode: 500, headers: h, body: JSON.stringify({ error: `Audio storage upload failed: ${uploadErr.message}` }) };

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(path);
    const audioUrl = urlData.publicUrl;

    // Save and deduct credit
    await supabase.from('tax_returns').update({
      audio_url: audioUrl,
      status:    'audio_ready',
    }).eq('id', taxReturnId);

    await supabase.from('usage_counters').delete().eq('user_id', user.id);
    await supabase.from('usage_counters').insert({
      user_id: user.id,
      credits_used: creditsUsed + 1,
      projections_used: usage?.projections_used || 0,
    });

    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'audio_generated',
      description: `Audio walkthrough generated for return ${taxReturnId}. Credit deducted (${creditsUsed + 1}/${creditsTotal} used).`,
    }).catch(() => {});

    return { statusCode: 200, headers: h, body: JSON.stringify({ success: true, audioUrl }) };

  } catch (err) {
    console.error('generate-audio error:', err.message);
    await supabase.from('audit_log').insert({
      user_id: user?.id,
      action: 'audio_error',
      description: `Audio generation failed for ${taxReturnId}: ${err.message}`,
    }).catch(() => {});
    return { statusCode: 500, headers: h, body: JSON.stringify({ error: err.message }) };
  }
};
