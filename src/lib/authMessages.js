// src/lib/authMessages.js
// What the sign-in, sign-up and reset screens say when something goes wrong. Two rules:
//   1. Never reveal whether an account exists for an email (sign-up with a taken email and a reset for an unknown email look exactly
//      like success; a failed sign-in never says which of email or password was wrong).
//   2. Never show the sign-in service's raw message; log it to the console instead.
// tests/security/auth_messages.test.mjs checks both.

export const SERVICE_DOWN = "We can't reach our sign-in service right now. Please try again in a few minutes.";

export const isServiceDown = (e) => /fetch|network/i.test(e?.message || '') || e?.name === 'AuthRetryableFetchError';
const isCaptcha   = (e) => /captcha/i.test(e?.message || '');
const isRateLimit = (e) => e?.status === 429 || /rate limit|too many|only request this after/i.test(e?.message || '');
const CAPTCHA_MSG = 'Please complete the security check and try again.';

/** Message for a failed sign-in. */
export function signInMessage(e) {
  if (isServiceDown(e)) return SERVICE_DOWN;
  if (isCaptcha(e))     return CAPTCHA_MSG;
  if (isRateLimit(e))   return 'Too many attempts. Please wait a few minutes and try again.';
  // Only returned once the password was right, so it reveals nothing to someone who does not know it.
  if (/not confirmed/i.test(e?.message || '')) return 'Please confirm your email first. Check your inbox for the link we sent.';
  if (e) console.warn('[auth] sign-in failed:', e.message);
  return 'Email or password is incorrect.';
}

/** Sign-up: returns { ok: true } when the "check your email" screen should show (including when the email already has an account). */
export function signUpOutcome(e) {
  if (!e) return { ok: true };
  if (isServiceDown(e)) return { error: SERVICE_DOWN };
  if (isCaptcha(e))     return { error: CAPTCHA_MSG };
  if (/already (been )?registered|already exists|user_already_exists/i.test(`${e.message} ${e.code || ''}`)) return { ok: true };
  if (isRateLimit(e))   return { error: 'Too many sign-ups from this network. Please wait a few minutes and try again.' };
  // Password rules (length, strength, known-leaked) are about the password typed, not the account, so they are safe and useful to show.
  if (/password/i.test(e.message || '') || e.code === 'weak_password') return { error: e.message };
  console.warn('[auth] sign-up failed:', e.message);
  return { error: "We couldn't create your account. Please try again." };
}

/** Reset request: returns { ok: true } for everything except an unreachable service or a failed security check. */
export function resetOutcome(e) {
  if (!e) return { ok: true };
  if (isServiceDown(e)) return { error: SERVICE_DOWN };
  if (isCaptcha(e))     return { error: CAPTCHA_MSG };
  // A per-email "wait N seconds" error only happens for emails that HAVE an account, so it is shown as success, like everything else.
  console.warn('[auth] reset request failed:', e.message);
  return { ok: true };
}
