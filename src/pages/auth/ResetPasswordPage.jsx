import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase, openedFromRecoveryLink, authLinkFailed } from '../../lib/supabase';
import { resetOutcome } from '../../lib/authMessages';
import { Captcha, captchaEnabled } from '../../components/Captcha';
import { Icon } from '../../components/Icon';

// Two steps on one page:
//   1. "Reset your password": ask for the email. The answer is the same whether or not the email has an account.
//   2. Arriving from the emailed link (signed in for recovery): "Choose a new password". Before this, the link landed back on step 1
//      and there was no way to actually set a new password.
export default function ResetPasswordPage() {
  const { user, loading: authLoading, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [recovering, setRecovering] = useState(openedFromRecoveryLink);

  // Also catch the recovery event itself (covers a link format that did not carry type=recovery in the URL).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(evt => { if (evt === 'PASSWORD_RECOVERY') setRecovering(true); });
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  const shell = (children) => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="p-6">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <img src="/brand/taxstory-lockup-horizontal-primary-on-light.svg" alt="TaxStory" style={{ height: 32, width: 'auto', display: 'block' }} />
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );

  if (recovering && authLoading) return shell(<p className="text-gray-500 text-sm text-center">Checking your link…</p>);
  if (recovering && user) return shell(<NewPasswordForm onDone={() => navigate('/dashboard', { replace: true })} />);
  return shell(<RequestForm resetPassword={resetPassword} linkProblem={authLinkFailed || (recovering && !user)} />);
}

function RequestForm({ resetPassword, linkProblem }) {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [attempt, setAttempt] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await resetPassword(email, captcha);
    const out = resetOutcome(err);
    setAttempt(a => a + 1);                  // a security-check token works once
    if (out.ok) setSent(true); else setError(out.error);
    setLoading(false);
  }

  if (sent) return (
    <div className="text-center">
      <div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 16 }}><Icon name="mail" size={24} /></div>
      <h2 className="font-serif text-2xl font-bold text-brand-dark mb-2">Check your email</h2>
      <p className="text-gray-500 text-sm">If there's a TaxStory account for <strong>{email}</strong>, a reset link is on its way. It can take a few minutes. Nothing after five minutes? Check spam, then try again.</p>
      <Link to="/login" className="block mt-6 text-sm text-brand-purple hover:underline">Back to sign in</Link>
    </div>
  );

  return (
    <>
      <h1 className="font-serif text-3xl font-bold text-brand-dark mb-2">Reset your password</h1>
      <p className="text-gray-500 text-sm mb-8">Enter your email and we'll send you a reset link.</p>
      {linkProblem && !error && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg mb-6">That reset link has expired or was already used. Request a new one below.</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="rp-email" className="sr-only">Email</label>
        <input id="rp-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="input" placeholder="you@yourfirm.com" />
        <Captcha onToken={setCaptcha} resetKey={attempt} />
        <button type="submit" disabled={loading || (captchaEnabled && !captcha)} aria-busy={loading}
          className="w-full bg-brand-purple hover:bg-brand-purple-hover text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>
      <Link to="/login" className="block text-center mt-4 text-sm text-brand-purple hover:underline">Back to sign in</Link>
    </>
  );
}

function NewPasswordForm({ onDone }) {
  const [pw,      setPw]      = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (pw.length < 8)    { setError('Password must be at least 8 characters.'); return; }
    if (pw !== confirm)   { setError('Passwords do not match.'); return; }
    setSaving(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (!err) { onDone(); return; }
    // Password rules (length, reuse, known-leaked) are safe and useful to show; anything else gets a plain message.
    setError(/password/i.test(err.message || '') ? err.message : "We couldn't update your password. Request a new reset link and try again.");
  }

  return (
    <>
      <h1 className="font-serif text-3xl font-bold text-brand-dark mb-2">Choose a new password</h1>
      <p className="text-gray-500 text-sm mb-8">You'll stay signed in on this device.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="np-pw" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input id="np-pw" type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={e => setPw(e.target.value)}
            className="input" placeholder="At least 8 characters" />
        </div>
        <div>
          <label htmlFor="np-confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input id="np-confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}
            className="input" />
        </div>
        <button type="submit" disabled={saving} aria-busy={saving}
          className="w-full bg-brand-purple hover:bg-brand-purple-hover text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </>
  );
}
