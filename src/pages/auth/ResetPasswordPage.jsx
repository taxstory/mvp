// src/pages/auth/ResetPasswordPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(email);
    if (error) { setError(error.message); setLoading(false); }
    else setSent(true);
  }

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
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📬</div>
              <h2 className="font-serif text-2xl font-bold text-brand-dark mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm">We sent a reset link to <strong>{email}</strong>.</p>
              <Link to="/login" className="block mt-6 text-sm text-brand-purple hover:underline">Back to sign in</Link>
            </div>
          ) : (
            <>
              <h1 className="font-serif text-3xl font-bold text-brand-dark mb-2">Reset your password</h1>
              <p className="text-gray-500 text-sm mb-8">Enter your email and we'll send you a reset link.</p>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="input" placeholder="you@yourfirm.com" />
                <button type="submit" disabled={loading}
                  className="w-full bg-brand-purple hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
              <Link to="/login" className="block text-center mt-4 text-sm text-brand-purple hover:underline">Back to sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
