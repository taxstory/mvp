// netlify/functions/_storage.js
// Private-bucket access helpers. The `audio` bucket (voiceovers AND client PDF summaries) is PRIVATE: nothing is
// ever stored as a public URL. Rows hold storage PATHS; callers receive short-lived signed URLs only after they have
// been authorized (owner JWT, or a valid share token checked in video-viewer).
//
// Legacy rows may still hold old public URLs; toStoragePath() converts them so they keep working once signed.

const DEFAULT_BUCKET = 'audio';

/** Normalise a stored value (path, or legacy public/signed URL) to a bucket-relative path; null if unusable. */
function toStoragePath(value, bucket = DEFAULT_BUCKET) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/([^?#]+)`));
  if (m) return decodeURIComponent(m[1]);
  if (/^https?:\/\//i.test(value)) return null;           // some other host — never sign arbitrary URLs
  const p = value.replace(/^\/+/, '');
  return p.includes('..') ? null : p;
}

/**
 * Create a short-lived signed URL for a stored value. Returns null on any failure (callers must handle).
 * opts.ownerId: when given, the path MUST sit in that user's folder. The public viewer signs whatever path a row holds, so a
 * row pointing at another tenant's file (however it got there) must never be signed. Always pass it.
 */
async function signedUrl(supabase, value, ttlSeconds = 3600, opts = {}) {
  const bucket = opts.bucket || DEFAULT_BUCKET;
  const path = toStoragePath(value, bucket);
  if (!path) return null;
  if (opts.ownerId && !path.startsWith(`${opts.ownerId}/`)) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/** Remove any URL/path fields from segment objects before they leave the server for an untrusted viewer. */
function publicSegment(seg) {
  if (!seg || typeof seg !== 'object') return seg;
  const { audio_url, audio_path, ...safe } = seg;       // eslint-disable-line no-unused-vars
  return safe;
}

/**
 * Delete every file directly under `prefix` (e.g. "<userId>/<returnId>"). Returns how many were removed. Throws if listing or removal
 * fails — callers must NOT go on to delete the database rows in that case. Pass the CALLER-scoped client where possible: the
 * storage policies then restrict it to the caller's own folder.
 */
async function removeFolder(storageClient, prefix, bucket = DEFAULT_BUCKET) {
  let removed = 0;
  for (let guard = 0; guard < 50; guard++) {                      // bounded: at most ~5,000 files per folder
    const { data, error } = await storageClient.storage.from(bucket).list(prefix, { limit: 100 });
    if (error) throw new Error(`Could not list files: ${error.message}`);
    const files = (data || []).filter(e => e.id).map(e => `${prefix}/${e.name}`);
    if (!files.length) break;
    const { error: rmErr } = await storageClient.storage.from(bucket).remove(files);
    if (rmErr) throw new Error(`Could not remove files: ${rmErr.message}`);
    removed += files.length;
  }
  return removed;
}

module.exports = { toStoragePath, signedUrl, publicSegment, removeFolder, DEFAULT_BUCKET };
