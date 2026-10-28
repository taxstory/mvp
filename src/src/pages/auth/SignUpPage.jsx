import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function SignUpPage() {
  const { signUp }  = useAuth();
  const navigate    = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', firmName: '', role: 'cpa' });
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);
  const [success,  setSuccess] = useState(false);

  const update = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signUp({ email: form.email, password: form.password, role: form.role, firmName: form.firmName });
    if (error) { setError(error.message); setLoading(false); }
    else setSuccess(true);
  }

  if (success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="text-5xl mb-4">📬</div>
        <h2 className="font-serif text-2xl font-bold text-brand-dark mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm">We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account and start your 14-day free trial.</p>
        <Link to="/login" className="block mt-6 text-sm text-brand-purple hover:underline">Back to sign in</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="p-6">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <div className="w-7 h-7 rounded-lg bg-brand-purple flex items-center justify-center">
            <span className="text-white font-bold text-xs">TS</span>
          </div>
          <span className="font-serif font-bold text-lg text-brand-dark">TaxStory</span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-sm">
          <div className="bg-brand-purple/10 text-brand-purple text-xs font-semibold px-3 py-1.5 rounded-full w-fit mb-4">
            ⭐ 14-Day Free Trial · No Credit Card Required
          </div>
          <h1 className="font-serif text-3xl font-bold text-brand-dark mb-2">Create your account</h1>
          <p className="text-gray-500 text-sm mb-8">Start your free trial and join founding members who locked in early pricing.</p>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">I am a…</label>
              <div className="grid grid-cols-2 gap-3">
                {[['cpa', 'CPA'], ['ria', 'RIA']].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setForm(f => ({ ...f, role: val }))}
                    className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      form.role === val
                        ? 'border-brand-purple bg-brand-light text-brand-purple'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firm Name</label>
              <input type="text" required value={form.firmName} onChange={update('firmName')}
                className="input" placeholder="Your firm name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required value={form.email} onChange={update('email')}
                className="input" placeholder="you@yourfirm.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required minLength={8} value={form.password} onChange={update('password')}
                className="input" placeholder="At least 8 characters" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-brand-purple hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
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
