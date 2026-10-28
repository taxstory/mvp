// netlify/functions/_validate.js — request-shape validators. Every function that accepts a body should validate it here
// before touching a vendor API or the database. Throws 400 with a safe, developer-authored message.
const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });
const { looksLikeIdentifier } = require('./_pii');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
function requireUuid(v, name) { if (!isUuid(v)) throw bad(`Invalid ${name}`); return v; }

const LIMITS = { maxSegments: 20, maxSegmentChars: 1200, maxTotalChars: 9000, maxScriptChars: 20000 };

/** Validate narration input for text-to-speech (cost control). Returns { segments|null, script|null }. */
function validateNarration({ segments, script }) {
  if (segments !== undefined && segments !== null) {
    if (!Array.isArray(segments) || segments.length < 1) throw bad('segments must be a non-empty array');
    if (segments.length > LIMITS.maxSegments) throw bad(`Too many scenes (maximum ${LIMITS.maxSegments})`);
    let total = 0;
    segments.forEach((s, i) => {
      if (!s || typeof s !== 'object' || Array.isArray(s)) throw bad(`Scene ${i + 1} is invalid`);
      if (typeof s.text !== 'string') throw bad(`Scene ${i + 1} has no text`);
      const n = s.text.trim().length;
      if (n > LIMITS.maxSegmentChars) throw bad(`Scene ${i + 1} is too long (maximum ${LIMITS.maxSegmentChars} characters)`);
      total += n;
    });
    if (total > LIMITS.maxTotalChars) throw bad(`Narration is too long (maximum ${LIMITS.maxTotalChars} characters in total)`);
    // Narration is sent to the voice vendor. The advisor can edit it freely, so an SSN/EIN pasted into a scene is refused here.
    if (segments.some(x => looksLikeIdentifier(x.text))) throw bad('A scene contains something that looks like a Social Security or tax ID number. Please remove it — narration should only describe the figures.');
    // client-supplied storage fields must never survive into stored rows; the server writes them
    segments = segments.map(({ audio_url, audio_path, ...rest }) => rest);   // eslint-disable-line no-unused-vars
  } else segments = null;
  if (script !== undefined && script !== null) {
    if (typeof script !== 'string' || script.length > LIMITS.maxScriptChars) throw bad(`script must be text of at most ${LIMITS.maxScriptChars} characters`);
    if (looksLikeIdentifier(script)) throw bad('The script contains something that looks like a Social Security or tax ID number. Please remove it.');
  } else script = null;
  if (!segments && !script) throw bad('Missing segments or script');
  return { segments, script };
}

/** A website safe to render as a link on a client-facing page: a plain https URL, or null. (Mirrors profiles_website_https and src/utils/inputs.js.) */
const WEB = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(\/[^\s<>"'\\]*)?$/i;
const safeWebUrl = v => (typeof v === 'string' && v.length <= 200 && WEB.test(v.trim()) ? v.trim() : null);

module.exports = { bad, isUuid, requireUuid, validateNarration, safeWebUrl, LIMITS };
