// netlify/functions/_html.js — output-encoding helpers for the HTML emails the platform sends.
// Every value that originates from a user, a client, or a database row must pass through one of these
// before it is placed into an HTML body, an attribute, a URL, or a mail header.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Encode for an HTML text node or a quoted attribute value. */
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);

/** Truncate before escaping so limits are in characters of user input, not entities. */
const clip = (v, max) => String(v ?? '').slice(0, max);

/** Only a plain hex colour may reach a style attribute. */
const safeColor = (v, fallback = '#6B5CE7') => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v ?? '')) ? v : fallback);

/** https URLs only (no javascript:, data:, http:). Returns null when unusable. */
const safeHttpsUrl = (v) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; } };

/** Plain text safe for a mail header or subject: no CR/LF, no angle brackets or quotes (header/From-name injection). */
const headerText = (v, max = 80) => String(v ?? '').replace(/[\r\n\t<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(v);

module.exports = { escapeHtml, clip, safeColor, safeHttpsUrl, headerText, isEmail };
