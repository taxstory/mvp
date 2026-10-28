// src/utils/inputs.js — validation of values that end up as LINKS or FILES on the client-facing pages. The firm "website" is rendered as an <a href> on the client
// portal, so a scheme such as javascript: would run on our origin when a client clicks it; it must be a plain https URL. Mirrors the CHECK constraint in
// 18_security_audit_fixes.sql (the database is the backstop; tests assert the two agree).
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** @returns {{ value: string|null, error?: string }} value is the https URL to store (null when blank). */
export function normalizeWebsite(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { value: null };
  const bad = { value: null, error: 'Enter a website address such as yourfirm.com' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return bad;       // javascript:, data:, mailto:, ftp: … are never accepted
  let s = raw.replace(/^http:\/\//i, 'https://'); if (!/^https:\/\//i.test(s)) s = 'https://' + s;
  if (s.length > 200 || /[\s<>"'\\]/.test(s) || !/^https:\/\/[a-z0-9]/i.test(s)) return bad;   // after the scheme a host must START ("//evil.example" would otherwise normalise to https:////evil.example)
  // Validate the host AS WRITTEN with the same grammar the database uses (never the URL parser's normalised host: it turns "https://0" into 0.0.0.0 and would let the UI
  // store a value the database rejects). After the host only :port and /path are allowed; a bare IP address is never a firm website.
  const m = s.match(/^https:\/\/([a-z0-9.-]+)(?::(\d{1,5}))?(\/.*)?$/i);
  if (!m || !HOST.test(m[1]) || /^[0-9.]+$/.test(m[1])) return bad;
  try { new URL(s); } catch { return bad; }
  return { value: s };
}

/** Logos are images only (no SVG: it can carry script and would be served from the storage domain). */
export const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export function logoUploadInfo(file) {
  if (!file) return { error: 'Choose an image.' };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: 'Logo must be a PNG, JPG, WebP or GIF image.' };
  if (file.size > 2 * 1024 * 1024) return { error: 'Logo must be under 2 MB.' };
  return { ext, contentType: file.type };
}
