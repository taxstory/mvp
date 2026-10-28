// netlify/functions/save-video.js
// Records the walkthrough video the advisor rendered in the browser, so the share link delivers it to the client.
// The browser uploads the file to its OWN folder in the private `audio` bucket (storage policy: owner folder only), next to the voiceover, so
// delete-data and sweep-orphans remove it with everything else for that return. This function checks the return belongs to the caller and has
// audio, checks the file exists at the one allowed path, and only then sets video_url (a system-managed column) with the service role.
const { makeHandler, getTaxReturn, audit } = require('./_handler');
const { requireUuid, bad } = require('./_validate');
const { rateLimit } = require('./_ratelimit');

exports.config = { timeout: 26 };
const MAX_BYTES = 200 * 1024 * 1024;

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId, ext } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  if (!['mp4', 'webm'].includes(ext)) throw bad('Unsupported video format');
  await rateLimit(supabase, `save-video:${user.id}`, 60, 3600, 'Too many video uploads this hour. Please wait a few minutes.');

  const ret = await getTaxReturn(db, taxReturnId, user.id, 'id, user_id, audio_url');
  if (!ret.audio_url) throw Object.assign(new Error('Generate the voiceover before saving a video.'), { statusCode: 409 });

  const folder = `${user.id}/${taxReturnId}`, name = `walkthrough.${ext}`;
  const { data: files, error } = await db.storage.from('audio').list(folder, { search: name });       // caller-scoped: sees only the caller's folder
  if (error) throw new Error(`Could not check the upload: ${error.message}`);
  const file = (files || []).find(f => f.name === name);
  if (!file) throw Object.assign(new Error('The video upload was not found. Please render it again.'), { statusCode: 404 });
  if ((file.metadata?.size || 0) > MAX_BYTES) throw bad('The video is too large.');

  const other = `walkthrough.${ext === 'mp4' ? 'webm' : 'mp4'}`;
  await db.storage.from('audio').remove([`${folder}/${other}`]).catch(() => {});                     // a re-render in the other format replaces the old file

  const { error: upErr } = await supabase.from('tax_returns').update({ video_url: `${folder}/${name}` }).eq('id', taxReturnId).eq('user_id', user.id);
  if (upErr) throw new Error(`Could not save the video: ${upErr.message}`);
  await audit(supabase, user.id, 'video_saved', `Walkthrough video saved for ${taxReturnId} (${ext}).`);
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
