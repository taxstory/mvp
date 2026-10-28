// src/pages/app/CreditHistory.jsx
// Credit and billing event history shown on the billing page.
// Reads from audit_log for credit usage, pack purchases, and subscription events.

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth }  from '../../context/AuthContext';

const LABELS = {
  audio_generated:        { icon: '🎬', label: 'Walkthrough credit used'  },
  credit_purchased:       { icon: '💳', label: 'Credits purchased'  },
  subscription_activated: { icon: '✅', label: 'Subscription active'},
  subscription_canceled:  { icon: '❌', label: 'Subscription ended' },
};

export default function CreditHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('audit_log')
      .select('id, action, description, created_at')
      .eq('user_id', user.id)
      .in('action', Object.keys(LABELS))
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setHistory(data || []); setLoading(false); });
  }, [user?.id]);

  return (
    <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:13, padding:'18px 22px', marginTop:14 }}>
      <div style={{ fontSize:11, fontWeight:600, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:14 }}>
        Credit & billing history
      </div>
      {loading ? (
        <div style={{ fontSize:13, color:'var(--color-muted)' }}>Loading…</div>
      ) : history.length === 0 ? (
        <div style={{ fontSize:13, color:'var(--color-muted)', padding:'8px 0' }}>
          No activity yet — credits used and purchases will appear here.
        </div>
      ) : history.map((entry, i) => {
        const { icon, label } = LABELS[entry.action] || { icon:'📋', label: entry.action };
        return (
          <div key={entry.id} style={{ display:'flex', gap:12, padding:'10px 0',
            borderBottom: i < history.length-1 ? '1px solid var(--color-gray-bg)' : 'none' }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--color-purple-4)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>
              {icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12.5, fontWeight:600, color:'var(--color-dark)' }}>{label}</div>
              <div style={{ fontSize:11.5, color:'var(--color-muted)', marginTop:2, lineHeight:1.5 }}>{entry.description}</div>
            </div>
            <div style={{ fontSize:11, color:'var(--color-muted-light)', flexShrink:0, marginTop:2 }}>
              {new Date(entry.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
