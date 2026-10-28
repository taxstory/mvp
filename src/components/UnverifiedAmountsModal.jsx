// src/components/UnverifiedAmountsModal.jsx — the advisor's recorded approval for narration that mentions amounts NOT on the return.
// Shows exactly which amounts, asks what kind they are and why, and returns { kind, note } (or null if cancelled). The server stores the approval with the
// exact narration (hash + snapshot), versioned per return, and requires a new approval whenever the amounts or the narration change.
import { useState } from 'react';
import { Modal }  from './ui/Modal';
import { Button } from './ui/Button';

const KINDS = [
  ['estimate_or_projection', 'An estimate or projection (e.g. next year, or a what-if)'],
  ['correction',             'A correction to a figure on the return'],
  ['other',                  'Something else'],
];

export default function UnverifiedAmountsModal({ amounts, onResolve }) {
  const [kind, setKind] = useState('estimate_or_projection');
  const [note, setNote] = useState('');
  const valid = note.trim().length >= 3;
  return (
    <Modal open onClose={() => onResolve(null)} title="Amounts that are not on this return" size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => onResolve(null)}>Go back and edit</Button>
        <Button variant="primary" disabled={!valid} onClick={() => onResolve({ kind, note: note.trim() })}>Approve and narrate</Button>
      </>}>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-dark)' }}>
        <p style={{ margin: '0 0 8px' }}>The narration mentions <strong>{amounts.join(', ')}</strong>, which {amounts.length === 1 ? 'does' : 'do'} not match any figure on this return.</p>
        <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 13 }}>If you approve, TaxStory records which amounts, what kind, your reason, who approved and when, together with the exact narration. Changing the narration later will need a new approval.</p>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>What are these amounts?</label>
        {KINDS.map(([v, label]) => (
          <label key={v} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4, cursor: 'pointer' }}>
            <input type="radio" name="unverified-kind" checked={kind === v} onChange={() => setKind(v)} /> {label}
          </label>
        ))}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, margin: '12px 0 4px' }}>Where do they come from? <span style={{ fontWeight: 400, color: 'var(--color-muted)' }}>(required — no client names, SSNs or account numbers)</span></label>
        <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={3} placeholder="e.g. My projection of next year's savings if the Roth conversion goes ahead"
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }} />
      </div>
    </Modal>
  );
}
