// netlify/functions/_site.js — the site's own origin, from SITE_URL, with NO DEFAULT.
// Every link we mint (share links, portal links, email buttons, Stripe return URLs) and the CORS allow-list are built from it. A hard-coded production hostname used to be the fallback in nine files,
// so a staging site that forgot SITE_URL minted share links and Stripe redirects pointing at PRODUCTION. Now a missing or malformed value fails loudly where a link or redirect is needed,
// and closed (no origin allowed) for CORS.
function normalize(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let v = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;            // tolerate a bare host
  let u; try { u = new URL(v); } catch { return null; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;   // https only (plain http only for local development)
  if (u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) return null;   // an origin, nothing else
  return u.origin;
}
/** The site origin (e.g. https://app.example.com) or null if SITE_URL is missing or malformed. */
function siteOrigin() { return normalize(process.env.SITE_URL); }
/** The site origin, or a 500 that says the server is misconfigured. Call BEFORE any side effect. */
function requireSiteOrigin() {
  const o = siteOrigin();
  if (!o) { console.error('SITE_URL is missing or invalid: set it to this deployment\'s own https origin.'); throw Object.assign(new Error('The server is not configured (site address). Please contact support.'), { statusCode: 500 }); }
  return o;
}
module.exports = { siteOrigin, requireSiteOrigin, normalizeSiteUrl: normalize };
