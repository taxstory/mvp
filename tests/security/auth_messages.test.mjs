// The sign-in, sign-up and reset screens must not reveal whether an email has an account, and must not show the sign-in service's raw text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signInMessage, signUpOutcome, resetOutcome, SERVICE_DOWN } from '../../src/lib/authMessages.js';

const quiet = console.warn; console.warn = () => {};

test('sign-in: wrong password and unknown email read the same', () => {
  const wrongPw = signInMessage({ message: 'Invalid login credentials', status: 400 });
  const noUser  = signInMessage({ message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' });
  assert.equal(wrongPw, noUser);
  assert.equal(wrongPw, 'Email or password is incorrect.');
  assert.match(signInMessage({ message: 'Request rate limit reached', status: 429 }), /Too many attempts/);
  assert.equal(signInMessage({ message: 'Failed to fetch', name: 'AuthRetryableFetchError' }), SERVICE_DOWN);
  assert.equal(signInMessage({ message: 'Database error querying schema' }), 'Email or password is incorrect.');   // raw service text never shown
});

test('sign-up: an email that already has an account looks like a new sign-up', () => {
  assert.deepEqual(signUpOutcome(null), { ok: true });
  assert.deepEqual(signUpOutcome({ message: 'User already registered', status: 422, code: 'user_already_exists' }), { ok: true });
  assert.deepEqual(signUpOutcome({ message: 'A user with this email address has already been registered' }), { ok: true });
  assert.match(signUpOutcome({ message: 'Password should be at least 8 characters.', code: 'weak_password' }).error, /Password/);
  assert.equal(signUpOutcome({ message: 'Database error saving new user' }).error, "We couldn't create your account. Please try again.");
});

test('reset: unknown email, known email and per-email cool-down all read as sent', () => {
  assert.deepEqual(resetOutcome(null), { ok: true });
  assert.deepEqual(resetOutcome({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429 }), { ok: true });
  assert.deepEqual(resetOutcome({ message: 'User not found', status: 404 }), { ok: true });
  assert.equal(resetOutcome({ message: 'Failed to fetch' }).error, SERVICE_DOWN);
});

test('the auth pages use these helpers instead of showing error.message', () => {
  for (const f of ['src/pages/auth/LoginPage.jsx', 'src/pages/auth/SignUpPage.jsx', 'src/pages/auth/ResetPasswordPage.jsx']) {
    const s = readFileSync(f, 'utf8');
    assert.ok(/signInMessage|signUpOutcome|resetOutcome/.test(s), `${f} does not use the auth message helpers`);
    assert.ok(!/setError\(\s*error\.message|:\s*error\.message\)/.test(s), `${f} shows the raw auth error`);
  }
});

test.after(() => { console.warn = quiet; });
