// STAND-IN (scaffold) — NOT your real file. It exists only so this snapshot can build and run. In your real repository keep YOUR version; the merge script never copies this one.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const recovering = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function request(e) {
    e.preventDefault(); setError(''); setNotice('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (err) setError(err.message); else setNotice('If that address has an account, a reset link is on its way.');
  }
  async function update(e) {
    e.preventDefault(); setError(''); setNotice('');
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(err.message); else setNotice('Password updated. You can sign in now.');
  }
  return (
    <main style={{ maxWidth: 380, margin: '10vh auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>{recovering ? 'Choose a new password' : 'Reset your password'}</h1>
      <form onSubmit={recovering ? update : request} style={{ display: 'grid', gap: 10 }}>
        {recovering
          ? <input type="password" placeholder="New password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          : <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />}
        {error && <div role="alert" style={{ color: '#b00020', fontSize: 13 }}>{error}</div>}
        {notice && <div role="status" style={{ fontSize: 13 }}>{notice}</div>}
        <button className="ts-btn ts-btn-primary">{recovering ? 'Update password' : 'Send reset link'}</button>
      </form>
      <p style={{ fontSize: 13, marginTop: 16 }}><Link to="/login">Back to sign in</Link></p>
    </main>
  );
}
