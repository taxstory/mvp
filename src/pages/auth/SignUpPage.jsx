import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icon, IconLabel } from '../../components/Icon';
import { signUpOutcome } from '../../lib/authMessages';
import { Captcha, captchaEnabled } from '../../components/Captcha';

export default function SignUpPage() {
  const { signUp }  = useAuth();
  const navigate    = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', firmName: '', role: 'cpa' });   // no role picker: every account gets the same app; the plan (Billing) decides the tools
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);
  const [success,  setSuccess] = useState(false);
  const [captcha,  setCaptcha] = useState('');
  const [attempt,  setAttempt] = useState(0);

  const update = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signUp({ email: form.email, password: form.password, role: form.role, firmName: form.firmName, captchaToken: captcha });
    // An email that already has an account gets the same "check your email" screen as a new one (no account enumeration).
    const out = signUpOutcome(error);
    if (out.ok) setSuccess(true);
    else { setError(out.error); setAttempt(a => a + 1); setLoading(false); }
  }

  if (success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 16 }}><Icon name="mail" size={24} /></div>
        <h2 className="font-serif text-2xl font-bold text-brand-dark mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm">We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account and start your 14-day free trial. Already have an account with this email? <Link to="/login" className="text-brand-purple hover:underline">Sign in</Link> instead.</p>
        <Link to="/login" className="block mt-6 text-sm text-brand-purple hover:underline">Back to sign in</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="p-6">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <img src="/brand/taxstory-lockup-horizontal-primary-on-light.svg" alt="TaxStory" style={{ height: 32, width: 'auto', display: 'block' }} />
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-sm">
          <div className="bg-brand-purple/10 text-brand-purple text-xs font-semibold px-3 py-1.5 rounded-full w-fit mb-4">
            <Icon name="star" size={13} /> 14-Day Free Trial · No Credit Card Required
          </div>
          <h1 className="font-serif text-3xl font-bold text-brand-dark mb-2">Create your account</h1>
          <p className="text-gray-500 text-sm mb-8">Start your free trial and join founding members who locked in early pricing.</p>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="su-firm" className="block text-sm font-medium text-gray-700 mb-1">Firm Name</label>
              <input id="su-firm" type="text" autoComplete="organization" required value={form.firmName} onChange={update('firmName')}
                className="input" placeholder="Your firm name" />
            </div>
            <div>
              <label htmlFor="su-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="su-email" type="email" autoComplete="email" required value={form.email} onChange={update('email')}
                className="input" placeholder="you@yourfirm.com" />
            </div>
            <div>
              <label htmlFor="su-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="su-password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={update('password')}
                className="input" placeholder="At least 8 characters" />
            </div>
            <Captcha onToken={setCaptcha} resetKey={attempt} />
            <button type="submit" disabled={loading || (captchaEnabled && !captcha)} aria-busy={loading}
              className="w-full bg-brand-purple hover:bg-brand-purple-hover text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
              {loading ? 'Creating account…' : 'Start Free Trial'}
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-4">
            By signing up you agree to our{' '}
            <Link to="/terms" className="underline">Terms of Service</Link> and{' '}
            <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-purple font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
