// src/components/FeedbackModal.jsx
// "Report a bug / Share feedback" overlay — accessible from the sidebar
// footer in AppLayout. Sends to report-bug.js which stores in DB + emails team.

import { useState } from 'react';
import { useAuth }  from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const TYPES = [
  { value: 'bug',     emoji: '🐛', label: 'Bug report'       },
  { value: 'ux',      emoji: '👁', label: 'UX issue'         },
  { value: 'feature', emoji: '💡', label: 'Feature request'  },
  { value: 'other',   emoji: '📝', label: 'Other feedback'   },
];

const SEVERITIES = [
  { value: 'low',    label: 'Low',    color: 'var(--color-muted)' },
  { value: 'medium', label: 'Medium', color: 'var(--color-amber)' },
  { value: 'high',   label: 'High',   color: 'var(--color-red)' },
];

export default function FeedbackModal({ onClose }) {
  const { user } = useAuth();
  const [type,        setType]        = useState('bug');
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [severity,    setSeverity]    = useState('medium');
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(false);
  const [error,       setError]       = useState('');

  async function handleSubmit() {
    if (!description.trim()) { setError('Please describe the issue.'); return; }
    setSending(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/report-bug', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({
          type, title: title.trim(), description: description.trim(),
          severity, pageUrl: window.location.pathname,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to submit');
      setSent(true);
    } catch(e) { setError(e.message); }
    setSending(false);
  }

  return (
    /* Backdrop */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:1000,
        display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>

      <div style={{ width:'100%', maxWidth:480, background:'#fff', borderRadius:18,
        boxShadow:'0 24px 80px rgba(0,0,0,.18)', overflow:'hidden', fontFamily:'Inter,system-ui,sans-serif' }}>

        {/* Header */}
        <div style={{ background:'var(--color-dark)', padding:'20px 24px', display:'flex',
          alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>
              Report a bug or share feedback
            </div>
            <div style={{ fontSize:11.5, color:'rgba(255,255,255,.5)', marginTop:3 }}>
              Goes directly to the TaxStory team — usually reviewed within 24 hours
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.5)',
              fontSize:22, cursor:'pointer', lineHeight:1, padding:0 }}>×</button>
        </div>

        <div style={{ padding:'24px' }}>
          {sent ? (
            /* Success state */
            <div style={{ textAlign:'center', padding:'24px 0' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--color-dark)', marginBottom:8 }}>
                Thanks — we got it!
              </div>
              <div style={{ fontSize:13, color:'var(--color-muted)', lineHeight:1.6, marginBottom:20 }}>
                Your feedback has been sent to the TaxStory team. We typically review
                within 24 hours and follow up by email if we need more detail.
              </div>
              <button onClick={onClose}
                style={{ padding:'10px 24px', background:'var(--color-purple)', color:'#fff',
                  border:'none', borderRadius:10, fontSize:14, fontWeight:600,
                  cursor:'pointer', fontFamily:'inherit' }}>
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Type selector */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--color-muted)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                  Type
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {TYPES.map(t => (
                    <button key={t.value} onClick={() => setType(t.value)}
                      style={{ padding:'7px 14px', borderRadius:9, fontSize:12.5,
                        fontWeight:600, fontFamily:'inherit', cursor:'pointer',
                        border:`1.5px solid ${type === t.value ? 'var(--color-purple)' : 'var(--color-border)'}`,
                        background: type === t.value ? 'var(--color-purple-3)' : '#fff',
                        color: type === t.value ? 'var(--color-purple)' : 'var(--color-muted)',
                        transition:'all .12s' }}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--color-muted)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                  Short title <span style={{ fontWeight:400 }}>(optional)</span>
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. SALT flag shows wrong message for standard deduction"
                  style={{ width:'100%', padding:'10px 12px', border:'1px solid var(--color-border)',
                    borderRadius:9, fontSize:13, fontFamily:'inherit', color:'var(--color-dark)',
                    outline:'none', boxSizing:'border-box' }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--color-muted)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                  Description <span style={{ color:'var(--color-red)' }}>*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => { setDescription(e.target.value); setError(''); }}
                  placeholder="What happened? What did you expect to happen? Include any client scenario details that are relevant."
                  style={{ width:'100%', minHeight:100, padding:'10px 12px',
                    border:`1.5px solid ${error ? 'var(--color-red)' : 'var(--color-border)'}`,
                    borderRadius:9, fontSize:13, fontFamily:'inherit', color:'var(--color-dark)',
                    resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box' }}
                />
                {error && <div style={{ fontSize:11.5, color:'var(--color-red)', marginTop:4 }}>{error}</div>}
              </div>

              {/* Severity — only for bugs */}
              {type === 'bug' && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--color-muted)',
                    textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>
                    Severity
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    {SEVERITIES.map(s => (
                      <button key={s.value} onClick={() => setSeverity(s.value)}
                        style={{ flex:1, padding:'7px 0', borderRadius:9, fontSize:12.5,
                          fontWeight:600, fontFamily:'inherit', cursor:'pointer',
                          border:`1.5px solid ${severity === s.value ? s.color : 'var(--color-border)'}`,
                          background: severity === s.value ? s.color + '18' : '#fff',
                          color: severity === s.value ? s.color : 'var(--color-muted)',
                          transition:'all .12s' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Context note */}
              <div style={{ fontSize:11, color:'var(--color-muted-light)', marginBottom:16, lineHeight:1.5 }}>
                Your email ({user?.email}) and current page will be included automatically.
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={sending || !description.trim()}
                style={{ width:'100%', padding:'12px', background:'var(--color-purple)', color:'#fff',
                  border:'none', borderRadius:10, fontSize:14, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit',
                  opacity: sending || !description.trim() ? 0.65 : 1,
                  transition:'opacity .15s' }}>
                {sending ? 'Sending…' : 'Send feedback'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
