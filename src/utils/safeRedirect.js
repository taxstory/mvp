// Navigation targets that come from the network or from stored data are validated before the browser follows them.

const STRIPE_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);
/** A Stripe Checkout / Billing Portal address, or an error. The server supplies this URL; if that response were ever wrong or tampered with, we must not send the customer elsewhere. */
export function stripeUrlOrThrow(url) {
  let u; try { u = new URL(String(url)); } catch { throw new Error('Unexpected response from the billing service.'); }
  if (u.protocol !== 'https:' || u.username || u.password || !STRIPE_HOSTS.has(u.hostname)) throw new Error('Unexpected response from the billing service.');
  return u.toString();
}

/** A plain email address that is safe to put in a mailto: link (no query, fragment, separators, quotes or whitespace — those could add recipients, a subject or a body), or null. */
const MAILTO_SAFE = /^[^\s@?&#,;<>"'%\\]+@[^\s@?&#,;<>"'%\\]+\.[^\s@?&#,;<>"'%\\]+$/;
export function safeMailtoAddress(v) { return typeof v === 'string' && v.length <= 320 && MAILTO_SAFE.test(v) ? v : null; }
