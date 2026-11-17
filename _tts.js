// netlify/functions/_tts.js — text-to-speech pipeline shared by the audio job.
// Narration text (figures only — never identifiers) → OpenAI TTS per scene → MP3 objects in the caller's private folder →
// one combined voiceover. Storage writes use whatever client is passed in: the audio job passes the CALLER-scoped client, so
// the database's storage policies (owner folder only) apply.
const { parseMp3, concatMp3 } = require('./_mp3');
const CONCURRENCY = 5;                       // OpenAI TTS allows ~50 requests/min on the paid tier
const TTS_TIMEOUT_MS = 60_000;
// Duration is MEASURED from the MP3 frames (see _mp3.js). It used to be bytes ÷ 3000, which assumes a constant ~24 kbps and drifts for any other bitrate.

async function ttsOnce(text, openaiKey) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TTS_TIMEOUT_MS);
  try {
    return await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: text }),
    });
  } finally { clearTimeout(timer); }
}

/** One scene: TTS (one retry on 429/5xx), then upload. Returns { enriched, buffer }. Vendor error text is never surfaced. */
async function processScene(seg, index, basePath, openaiKey, storageClient, onBilled) {
  const text = seg.text?.trim();
  if (!text) return null;
  let res = await ttsOnce(text, openaiKey);
  if (!res.ok && (res.status === 429 || res.status >= 500)) { await new Promise(r => setTimeout(r, 1500)); res = await ttsOnce(text, openaiKey); }
  if (!res.ok) throw Object.assign(new Error(`Text-to-speech failed on scene ${index + 1} (status ${res.status})`), { userMessage: 'The voice service is temporarily unavailable.' });
  onBilled(text.length);                                    // the vendor accepted and answered this request: its characters are billable from here on
  const buffer = Buffer.from(await res.arrayBuffer());
  const durationMs = Math.round(parseMp3(buffer).durationMs);
  const path = `${basePath}/segment_${String(index).padStart(2, '0')}.mp3`;
  const { error } = await storageClient.storage.from('audio').upload(path, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(`Upload failed for scene ${index + 1}: ${error.message}`);
  return { enriched: { ...seg, index, audio_path: path, duration_ms: durationMs, duration_s: +(durationMs / 1000).toFixed(2) }, buffer };
}

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length); let next = 0;
  const worker = async () => { while (next < tasks.length) { const i = next++; results[i] = await tasks[i](); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Generate all scenes + the combined voiceover.
 * @returns {{ audioPath: string, segments: object[], totalDurationMs: number }}
 */
async function runAudioPipeline({ storageClient, userId, taxReturnId, segments, openaiKey, onProgress = async () => {} }) {
  const basePath = `${userId}/${taxReturnId}`;
  let done = 0, ttsCharsBilled = 0;
  const onBilled = n => { ttsCharsBilled += n; };
  try {
  const tasks = segments.map((seg, i) => async () => {
    const r = await processScene(seg, i, basePath, openaiKey, storageClient, onBilled);
    done += 1; await onProgress(Math.min(90, Math.round((done / segments.length) * 90)));
    return r;
  });
  const results = (await runWithConcurrency(tasks, CONCURRENCY)).filter(Boolean);
  if (results.length === 0) throw Object.assign(new Error('No scene produced audio'), { userMessage: 'Every scene was empty. Add some narration text and try again.' });

  const fullPath = `${basePath}/voiceover.mp3`;
  const joined = concatMp3(results.map(r => r.buffer));     // frame-for-frame: part tags and Xing/Info frames removed, so the combined file reports and seeks correctly
  const { error } = await storageClient.storage.from('audio').upload(fullPath, joined.buffer, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(`Could not store the combined voiceover: ${error.message}`);
  const enriched = results.map(r => r.enriched);
  return { audioPath: fullPath, segments: enriched, totalDurationMs: Math.round(joined.durationMs), ttsCharsBilled };
  } catch (e) { e.ttsCharsBilled = ttsCharsBilled; throw e; }    // a failure part-way still tells the caller what was actually billed
}

module.exports = { runAudioPipeline, CONCURRENCY };
