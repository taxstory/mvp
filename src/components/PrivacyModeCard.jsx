// src/components/PrivacyModeCard.jsx — Settings card for labels-only vs standard mode.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from './ui/ConfirmProvider';
import { usePrivacyMode } from '../hooks/usePrivacyMode';

const card = { background: '#fff', border: '1.5px solid var(--color-border)', borderRadius: 14, padding: 20, marginBottom: 16 };

export default function PrivacyModeCard() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { mode, loading, refresh } = usePrivacyMode();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ttl, setTtl] = useState(90);                       // how long a client PORTAL link stays valid
  useEffect(() => { if (user) supabase.from('profiles').select('portal_ttl_days').eq('id', user.id).maybeSingle().then(({ data }) => { if (data?.portal_ttl_days) setTtl(data.portal_ttl_days); }); }, [user]);
  async function changeTtl(days) {
    setTtl(days); setErr('');
    const { error } = await supabase.from('profiles').update({ portal_ttl_days: days }).eq('id', user.id);
    if (error) setErr('Could not change the setting. Please try again.');
  }

  async function change(next) {
    if (next === mode || busy) return;
    const ok = next === 'labels_only'
      ? await confirm({ title: 'Switch to labels-only mode?', confirmLabel: 'Erase and switch',
          message: 'Every client email address and phone number already saved — and every saved recipient address on share links and client replies — will be permanently erased. Client labels, projections and walkthroughs are not affected.' })
      : await confirm({ title: 'Switch to standard mode?', confirmLabel: 'Switch to standard', danger: false,
          message: 'TaxStory will be able to store client emails and phone numbers, the recipient address of share-link emails, and the sender address on client replies. Your clients become personal data TaxStory holds. You can switch back at any time; switching back erases it.' });
    if (!ok) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('profiles').update({ privacy_mode: next }).eq('id', user.id);
    if (error) setErr('Could not change the setting. Please try again.');
    await refresh(); setBusy(false);
  }

  const opt = (value, title, body) => (
    <label style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer', marginBottom: 8,
      border: `1.5px solid ${mode === value ? 'var(--color-purple)' : 'var(--color-border)'}`, background: mode === value ? 'var(--color-purple-4)' : '#fff' }}>
      <input type="radio" name="privacy-mode" checked={mode === value} disabled={busy || loading} onChange={() => change(value)} style={{ marginTop: 3 }} />
      <span><span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--color-dark)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6, marginTop: 2 }}>{body}</span></span>
    </label>
  );

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 4 }}>Client privacy</div>
      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        Return PDFs are always read on your device and never uploaded. This setting controls whether TaxStory also keeps client contact details.
      </div>
      {opt('labels_only', 'Labels only (recommended)', 'Clients are nicknames or initials. No client emails or phone numbers are stored. To email a walkthrough you type the address when you send it — it is used once and not saved. Or copy the link and send it yourself.')}
      {opt('standard', 'Standard', 'You can save client emails and phone numbers, and TaxStory remembers who a link was sent to and who replied.')}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--color-dark)', marginBottom: 4 }}>Client portal links expire after</label>
        <select aria-label="Client portal link expiry" value={ttl} onChange={e => changeTtl(Number(e.target.value))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13 }}>
          {[[30, '30 days'], [90, '90 days (default)'], [180, '180 days'], [365, '1 year']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.6 }}>Applies to links you create or refresh from now on. You can see when each client last opened theirs, and refresh or revoke it at any time.</div>
      </div>
      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--color-red-dark)', marginTop: 6 }}>{err}</div>}
    </div>
  );
}
