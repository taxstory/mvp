// netlify/functions/generate-audio.js
// Converts Claude-generated script to voiceover using OpenAI TTS.
// Saves MP3 to Supabase Storage.

const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { taxReturnId, userId } = JSON.parse(event.body);

    const { data: record } = await supabase
      .from('tax_returns')
      .select('id, user_id, script_text, status')
      .eq('id', taxReturnId)
      .single();

    if (!record || record.user_id !== userId) return { statusCode: 403, body: 'Forbidden' };
    if (record.status !== 'script_ready')      return { statusCode: 400, body: 'Script not ready' };
    if (!record.script_text)                   return { statusCode: 400, body: 'No script found' };

    // Generate TTS audio
    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: 'nova',          // Professional, warm female voice
      input: record.script_text,
      speed: 0.95,            // Slightly slower for clarity
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    const audioPath   = `${userId}/${taxReturnId}/voiceover.mp3`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(audioPath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) throw new Error(`Audio upload failed: ${uploadError.message}`);

    // Get signed URL (1 year expiry — users can download)
    const { data: urlData } = await supabase.storage
      .from('audio')
      .createSignedUrl(audioPath, 60 * 60 * 24 * 365);

    // Update record
    await supabase.from('tax_returns').update({
      audio_url:  urlData.signedUrl,
      status:     'audio_ready',
      updated_at: new Date().toISOString(),
    }).eq('id', taxReturnId);

    // Deduct one video credit from usage counter
    await supabase.rpc('increment_credits_used', { p_user_id: userId });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id:  userId,
      action:   'audio_generated',
      resource: taxReturnId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, audioUrl: urlData.signedUrl }),
    };

  } catch (err) {
    console.error('[generate-audio] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
