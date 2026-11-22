// src/pages/viewer/ClientPortal.jsx
// Client-facing portal — no account required.
// Reached via: /portal/:clientToken
//
// Shows all walkthroughs the CPA has shared with this client.
// Each card links to the full viewer (/view/:token) for that walkthrough.
// Clients can also download PDF summaries from each card.

import { useState, useEffect } from 'react';
import { useParams, Link }     from 'react-router-dom';
import { Icon, IconLabel } from '../../components/Icon';

const BASE = '/.netlify/functions/client-portal';

export default function ClientPortal() {
  const { clientToken } = useParams();
  const [state,        setState]       = useState('loading');
  const [clientName,   setClientName]  = useState('');
  const [walkthroughs, setWalkthroughs] = useState([]);
  const [firmInfo,     setFirmInfo]     = useState(null);
  const [error,        setError]       = useState('');

  useEffect(() => {
    fetch(`${BASE}?clientToken=${clientToken}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) { setState('error'); setError(json.error || 'Portal not found'); return; }
        const cName = json.clientName;
        setClientName(cName);
        setWalkthroughs(json.walkthroughs || []);
        setFirmInfo({ name: json.firmName, phone: json.firmPhone, web: json.firmWeb, email: json.firmEmail });
        document.title = cName ? `${cName} — Tax Walkthroughs | TaxStory` : 'Tax Walkthroughs | TaxStory';
        setState('ready');
      })
      .catch(() => { setState('error'); setError('Could not load your portal.'); });
  }, [clientToken]);

  // ── Loading ──────────────────────────────────────────────────
  if (state === 'loading') return (
    <PortalShell>
      <div style={{ textAlign:'center', padding:64 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
        <div style={{ fontSize:14, color:'var(--color-muted)' }}>Loading your walkthroughs…</div>
      </div>
    </PortalShell>
  );

  if (state === 'error') return (
    <PortalShell>
      <div style={{ textAlign:'center', padding:64 }}>
        <div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 16 }}><Icon name="error" size={24} /></div>
        <div style={{ fontFamily:'Georgia,serif', fontSize:20, fontWeight:700, color:'var(--color-dark)', marginBottom:8 }}>
          Portal not found
        </div>
        <div style={{ fontSize:14, color:'var(--color-muted)' }}>{error}</div>
        <div style={{ fontSize:13, color:'var(--color-muted-light)', marginTop:12 }}>
          Contact your tax advisor for a new link.
        </div>
      </div>
    </PortalShell>
  );

  // ── Ready ────────────────────────────────────────────────────
  return (
    <PortalShell>
      <div style={{ maxWidth:680, margin:'0 auto', padding:'32px 20px 64px' }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:26, fontWeight:700,
            color:'var(--color-dark)', marginBottom:6 }}>
            {clientName ? `${clientName}'s walkthroughs` : 'Your walkthroughs'}
          </div>
          <div style={{ fontSize:13, color:'var(--color-muted)' }}>
            {walkthroughs.length} walkthrough{walkthroughs.length !== 1 ? 's' : ''} prepared by your advisor
          </div>
        </div>

        {walkthroughs.length === 0 ? (
          <div style={{ textAlign:'center', padding:'48px 0', color:'var(--color-muted)', fontSize:14 }}>
            <div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 12 }}><Icon name="inbox" size={24} /></div>
            No walkthroughs yet. Your advisor will share one here when it's ready.
          </div>
        ) : (
          <>
            <YearTimeline walkthroughs={walkthroughs} />
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {walkthroughs.map(w => (
                <WalkthroughCard key={w.id} walkthrough={w} />
              ))}
            </div>
          </>
        )}

        {/* Advisor contact card */}
        {firmInfo?.name && (
          <div style={{ marginTop:32, padding:'16px 20px', background:'#fff',
            border:'1px solid var(--color-border)', borderRadius:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--color-muted)',
              textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
              Questions about your return?
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--color-dark)', marginBottom:6 }}>
              {firmInfo.name}
            </div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
              {firmInfo.phone && (
                <a href={`tel:${firmInfo.phone}`}
                  style={{ fontSize:13, color:'var(--color-purple)', textDecoration:'none', fontWeight:500 }}>
                  <Icon name="phone" /> {firmInfo.phone}
                </a>
              )}
              {firmInfo.web && /^https:\/\//i.test(firmInfo.web) && (   // only ever link a validated https URL (a javascript: link would run on our origin)
                <a href={firmInfo.web} target="_blank" rel="noreferrer"
                  style={{ fontSize:13, color:'var(--color-purple)', textDecoration:'none', fontWeight:500 }}>
                  <Icon name="globe" /> {firmInfo.web.replace(/^https?:\/\//, '')}
                </a>
              )}
              {firmInfo.email && (
                <a href={`mailto:${firmInfo.email}`}
                  style={{ fontSize:13, color:'var(--color-purple, var(--color-purple))', textDecoration:'none', fontWeight:500 }}>
                  <Icon name="mail" /> {firmInfo.email}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Footer disclaimer */}
        <div style={{ marginTop:16, padding:'14px 18px', background:'var(--color-soft)',
          borderRadius:10, border:'1px solid var(--color-border)' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--color-dark)', marginBottom:4 }}>
            Important disclosure
          </div>
          <div style={{ fontSize:11, color:'var(--color-muted)', lineHeight:1.7 }}>
            These walkthroughs are for informational purposes only and do not constitute
            tax advice. Please consult your tax professional with any questions before
            making financial decisions.
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

// ── Your tax story, year by year ───────────────────────────────────────────────
// One row per filed return (newest first): the outcome, and how it compares with the year before. Shown only when there are 2+ years.
const usd = v => '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
function YearTimeline({ walkthroughs }) {
  const years = [];
  for (const w of walkthroughs) if (w.kind === 'return' && w.taxYear && !years.some(y => y.taxYear === w.taxYear)) years.push(w);
  years.sort((a, b) => b.taxYear - a.taxYear);
  if (years.length < 2) return null;
  const net = y => (y.refund != null ? y.refund : y.owed != null ? -y.owed : null);
  return (
    <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:16, padding:'18px 22px', marginBottom:16 }}>
      <div style={{ fontFamily:'Georgia,serif', fontSize:17, fontWeight:700, color:'var(--color-dark)', marginBottom:12 }}>Your tax story, year by year</div>
      {years.map((y, i) => {
        const prev = years[i + 1];
        const n = net(y), p = prev ? net(prev) : null;
        const change = n != null && p != null && Math.round(n - p) !== 0
          ? `${usd(n - p)} ${n > p ? 'more back' : 'less back'} than ${prev.taxYear}` : null;   // neutral wording: a bigger refund is not always better
        return (
          <div key={y.taxYear} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'10px 0', borderTop: i ? '1px solid var(--color-border)' : 'none', flexWrap:'wrap' }}>
            <div style={{ fontWeight:700, color:'var(--color-dark)', minWidth:48 }}>{y.taxYear}</div>
            <div style={{ flex:1, fontSize:13, color:'var(--color-dark)' }}>
              {y.refund != null ? `Refund ${usd(y.refund)}` : y.owed != null ? `Balance due ${usd(y.owed)}` : 'Filed'}
              {y.totalTax != null && <span style={{ color:'var(--color-muted)' }}> · total federal tax {usd(y.totalTax)}</span>}
            </div>
            {change && <div style={{ fontSize:12, color: n > p ? 'var(--color-green-dark)' : 'var(--color-amber-dark)', fontWeight:600 }}>{change}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Walkthrough card ──────────────────────────────────────────────────────────
function WalkthroughCard({ walkthrough: w }) {
  const hasViewer = w.viewerToken && w.hasVideo;
  const statusLabel = {
    audio_ready:  { icon:'video', text:'Ready to watch', color:'var(--color-green-dark)', bg:'var(--color-green-light)' },
    script_ready: { icon:'note', text:'In progress',    color:'var(--color-amber-dark)', bg:'var(--color-amber-light)' },
    parsed:       { icon:'projections', text:'Processing',     color:'var(--color-blue)', bg:'var(--color-blue-light)' },
  }[w.status] || { icon:'⏳', text:'Pending', color:'var(--color-muted)', bg:'var(--color-gray-light)' };

  return (
    <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:16,
      padding:'20px 24px', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
        gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontFamily:'Georgia,serif', fontSize:18, fontWeight:700,
            color:'var(--color-dark)', marginBottom:4 }}>
            {w.kind === 'scenario' ? `${w.taxYear || ''} Planning option`.trim() : w.taxYear ? `${w.taxYear} Tax Return` : 'Tax Return Walkthrough'}
          </div>
          <div style={{ fontSize:12, color:'var(--color-muted)' }}>
            Added {new Date(w.createdAt).toLocaleDateString('en-US',
              { month:'long', day:'numeric', year:'numeric' })}
          </div>
        </div>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5,
          padding:'4px 10px', borderRadius:20, fontSize:11.5, fontWeight:600,
          background:statusLabel.bg, color:statusLabel.color, flexShrink:0 }}>
          <Icon name={statusLabel.icon} size={13} /> {statusLabel.text}
        </span>
      </div>

      <div style={{ display:'flex', gap:9, flexWrap:'wrap' }}>
        {hasViewer ? (
          <Link to={`/view/${w.viewerToken}`}
            style={{ flex:1, minWidth:160, display:'flex', alignItems:'center',
              justifyContent:'center', gap:7, padding:'11px 16px',
              background:'var(--color-purple)', color:'#fff', borderRadius:10,
              textDecoration:'none', fontSize:13, fontWeight:600 }}>
            ▶ Watch walkthrough
          </Link>
        ) : (
          <div style={{ flex:1, minWidth:160, display:'flex', alignItems:'center',
            justifyContent:'center', padding:'11px 16px',
            background:'var(--color-bg)', color:'var(--color-muted-light)', borderRadius:10, fontSize:13 }}>
            Audio walkthrough only
          </div>
        )}

        {w.pdfUrl && (
          <a href={w.pdfUrl} target="_blank" rel="noreferrer"
            style={{ display:'flex', alignItems:'center', gap:6, padding:'11px 16px',
              background:'var(--color-dark)', color:'#fff', borderRadius:10,
              textDecoration:'none', fontSize:13, fontWeight:600 }}>
            <Icon name="file" /> Download PDF
          </a>
        )}
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function PortalShell({ children }) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)',
      fontFamily:'Inter,system-ui,sans-serif' }}>
      {/* Nav */}
      <div style={{ background:'var(--color-dark)', padding:'12px 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <img
          src="/brand/taxstory-lockup-horizontal-one-color-white.svg"
          alt="TaxStory"
          style={{ height: 22, width: 'auto' }}
        />
        <div style={{ fontSize:10, color:'rgba(255,255,255,.3)',
          textTransform:'uppercase', letterSpacing:'.06em' }}>
          Private link · just for you
        </div>
      </div>

      {children}

      {/* Footer */}
      <div style={{ textAlign:'center', padding:'20px 0 32px',
        fontSize:11, color:'var(--color-muted-border)' }}>
        Powered by{' '}
        <a href="https://tellmytaxstory.com" style={{ display:'inline-flex', alignItems:'center', verticalAlign:'middle' }}>
          <img src="/brand/taxstory-lockup-horizontal-one-color-midnight.svg" alt="TaxStory" style={{ height: 14, width: 'auto' }} />
        </a>
        {' '}· Private by design
      </div>
    </div>
  );
}
