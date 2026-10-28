// STAND-IN (scaffold) — NOT your real file. It exists only so this snapshot can build and run. In your real repository keep YOUR version; the merge script never copies this one.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function SignUpPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [firm, setFirm] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const nav = useNavigate();
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { firm_name: firm } } });
    setBusy(false);
    if (err) return setError(err.message);
    if (data.session) nav('/onboarding'); else setNotice('Check your email to confirm your address, then sign in.');
  }
  return (
    <main style={{ maxWidth: 380, margin: '10vh auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Create your account</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input placeholder="Firm name" value={firm} onChange={e => setFirm(e.target.value)} />
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        {error && <div role="alert" style={{ color: '#b00020', fontSize: 13 }}>{error}</div>}
        {notice && <div role="status" style={{ fontSize: 13 }}>{notice}</div>}
        <button className="ts-btn ts-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p style={{ fontSize: 13, marginTop: 16 }}>Already have an account? <Link to="/login">Sign in</Link></p>
    </main>
  );
}
