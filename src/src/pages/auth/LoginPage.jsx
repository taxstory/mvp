// STAND-IN (scaffold) — NOT your real file. It exists only so this snapshot can build and run. In your real repository keep YOUR version; the merge script never copies this one.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const nav = useNavigate();
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); if (err) setError(err.message); else nav('/dashboard');
  }
  return (
    <main style={{ maxWidth: 380, margin: '10vh auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Sign in</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <div role="alert" style={{ color: '#b00020', fontSize: 13 }}>{error}</div>}
        <button className="ts-btn ts-btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p style={{ fontSize: 13, marginTop: 16 }}><Link to="/signup">Create an account</Link> · <Link to="/reset-password">Forgot password?</Link></p>
    </main>
  );
}
