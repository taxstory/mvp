// netlify/functions/_logError.js
// Shared error reporting helper — imported by every Netlify function.
// Posts a structured alert to Slack on any unhandled error.
//
// Setup:
//   1. Create a Slack workspace (free tier is fine)
//   2. api.slack.com/apps → Create App → Incoming Webhooks → Add to #errors channel
//   3. Add SLACK_ERROR_WEBHOOK to Netlify env vars
//
// If SLACK_ERROR_WEBHOOK is not set, errors are logged to console only
// (safe for local dev — won't break anything).

const WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK;
const SITE        = require('./_site').siteOrigin() || '(SITE_URL not set)';   // a label only: it names the deployment in the alert

/**
 * logError(context, err, meta)
 * @param {string} context   - Human-readable description: 'generate-audio: TTS call failed'
 * @param {Error|string} err - The error object or message string
 * @param {object} meta      - Optional extra fields: { taxReturnId, userId, tier, ... }
 */
// What reaches the logs and Slack is REDACTED: error text can echo user-entered values (a mail provider quoting the recipient, a database quoting a malformed id), and the logs are third-party stores.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function redactForLog(value, max = 300) {
  let s = typeof value === 'string' ? value : value instanceof Error ? value.message : (() => { try { return JSON.stringify(value); } catch { return String(value); } })();
  s = String(s ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]').replace(/\b\d{2}-\d{7}\b/g, '[ein]').replace(/\b\d{9}\b/g, '[id]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*)?/g, '[jwt]')                  // a whole JWT, dots included
    .replace(/[A-Za-z0-9_-]{32,}/g, m => (UUID_RE.test(m) ? m : '[token]'))      // bearer-looking strings (share/portal tokens, JWTs) — UUIDs are kept: they are our own ids
    .replace(/`/g, "'");                                                          // cannot break out of the Slack code block
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// At most 20 alerts a minute per instance, and an identical alert (same context + message) is sent once a minute: an outage or a hostile client cannot flood the ops channel.
const _recent = new Map(); let _windowStart = 0, _count = 0;
function shouldPostToSlack(key, now = Date.now()) {
  if (now - _windowStart > 60000) { _windowStart = now; _count = 0; _recent.clear(); }
  if (_recent.has(key) || _count >= 20) return false;
  _recent.set(key, now); _count++; return true;
}

function buildSlackPayload(context, message, stack, meta, site, timestamp = new Date().toISOString()) {
  const metaLines = Object.entries(meta).map(([k, v]) => `• *${k}:* \`${v}\``).join('\n');
  return {
    text: `TaxStory Error — ${context}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'TaxStory Error', emoji: false } },
      { type: 'section', fields: [{ type: 'mrkdwn', text: `*Context:*\n${redactForLog(context, 80)}` }, { type: 'mrkdwn', text: `*Time:*\n${timestamp}` }] },
      { type: 'section', text: { type: 'mrkdwn', text: `*Error:*\n\`\`\`${message}\`\`\`` } },
      ...(metaLines ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Details:*\n${metaLines}` } }] : []),
      ...(stack ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Stack:*\n\`\`\`${stack}\`\`\`` } }] : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Site: ${site}` }] },
    ],
  };
}

async function logError(context, err, meta = {}) {
  const message = redactForLog(err instanceof Error ? err.message : String(err));
  const stack   = err instanceof Error ? redactForLog((err.stack || '').split('\n').slice(0, 4).join('\n'), 600) : '';
  const safeMeta = Object.fromEntries(Object.entries(meta).filter(([, v]) => v != null).map(([k, v]) => [k, redactForLog(v, 80)]));

  // Always log to console (visible in Netlify function logs)
  console.error(`[TaxStory ERROR] ${context}:`, message, safeMeta);

  if (!WEBHOOK_URL || !shouldPostToSlack(`${context}|${message}`)) return;
  // Fire-and-forget — never let Slack failure cascade into the main error path
  fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildSlackPayload(context, message, stack, safeMeta, SITE)) })
    .catch(e => console.error('[logError] Slack delivery failed:', redactForLog(e.message)));
}

module.exports = { logError, redactForLog, shouldPostToSlack, buildSlackPayload };
