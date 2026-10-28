// src/pages/viewer/VideoViewer.jsx
// PUBLIC page — no auth, no TaxStory account needed.
// Reached via: /view/:token
// Validates the share token, shows the walkthrough, records view events.

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const BASE = '/.netlify/functions/video-viewer';

export default function VideoViewer() {
  const { token } = useParams();
  const [state,  setState]  = useState('loading');  // loading|ready|expired|error
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState('');
  const audioRef      = useRef();
  const startedRef    = useRef(false);
  const [currentSceneIdx,   setCurrentSceneIdx]   = useState(0);
  const [segmentBoundaries, setSegmentBoundaries] = useState([]); // cumulative seconds per segment
  const [msgBody,   setMsgBody]   = useState('');
  const [msgSent,   setMsgSent]   = useState(false);
  const [msgSending,setMsgSending] = useState(false);
  const [msgError,  setMsgError]  = useState('');
  const [contact,  setContact]   = useState(null);   // advisor contact for dead-end pages
  const [speed,    setSpeed]     = useState(1);

  useEffect(() => { fetchViewer(); }, [token]);

  async function fetchViewer() {
    setState('loading');
    // Tokens go in the query string of a same-origin call; passcodes were never implemented server-side and were removed.
    const url = `${BASE}?token=${encodeURIComponent(token)}`;
    const res  = await fetch(url);
    const json = await res.json();

    if (res.status === 410) {
      setState('expired'); setError(json.error);
      setContact({ firmName: json.firmName, email: json.advisorEmail, phone: json.advisorPhone });
      return;
    }
    if (res.status === 429) { setState('error'); setError(json.error || 'Too many requests. Please try again in a few minutes.'); return; }
    if (!json.ok) { setState('error'); setError(json.error || 'Something went wrong.'); return; }

    // video-viewer returns the full record including pdf_summary_url
    setData(json);
    setState('ready');

    // Record link_opened
    recordEvent('link_opened');
  }

  function recordEvent(eventType, watchPct = null) {
    fetch(`${BASE}?token=${token}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventType, watchPct }),
    }).catch(() => {});
  }

  function handlePlay() {
    if (!startedRef.current) {
      recordEvent('view_start');
      startedRef.current = true;
    }
  }

  // Each milestone is sent ONCE. (It used to fire view_complete on every timeupdate tick past 90% — several requests a second, each one able to
  // notify the advisor — and view_progress only if a tick happened to land exactly on 50%.)
  const sentRef = useRef({ half: false, done: false });
  function handleTimeUpdate(e) {
    if (!e.target.duration) return;
    const pct = Math.round((e.target.currentTime / e.target.duration) * 100);
    if (pct >= 50 && !sentRef.current.half) { sentRef.current.half = true; recordEvent('view_progress', 50); }
    if (pct >= 90 && !sentRef.current.done) { sentRef.current.done = true; recordEvent('view_complete', pct); }
  }

  // ── Render states ──────────────────────────────────────────
  const brand = data?.brandColor || 'var(--color-purple)';

  if (state === 'loading') return (
    <ViewerShell brand={brand}>
      <div style={{ textAlign:'center', padding:48 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
        <div style={{ fontSize:15, color:'var(--color-muted)' }}>Loading your walkthrough…</div>
      </div>
    </ViewerShell>
  );

  if (state === 'expired') return (
    <ViewerShell brand={brand}>
      <div style={{ textAlign:'center', padding:48 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:'var(--color-dark)', marginBottom:8 }}>This link has expired</div>
        <div style={{ fontSize:14, color:'var(--color-muted)' }}>{error}</div>
        <div style={{ fontSize:14, color:'var(--color-muted)', marginTop:16 }}>
          {contact?.firmName ? `Contact ${contact.firmName} to request a new link.` : 'Contact your tax advisor to request a new link.'}
        </div>
        {(contact?.email || contact?.phone) && (
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', marginTop:16 }}>
            {contact.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent('New walkthrough link')}`}
              style={{ padding:'11px 18px', background:'var(--color-dark)', color:'#fff', borderRadius:10, textDecoration:'none', fontSize:14, fontWeight:600 }}>✉ Email {contact.firmName || 'your advisor'}</a>}
            {contact.phone && <a href={`tel:${contact.phone}`}
              style={{ padding:'11px 18px', background:'#fff', color:'var(--color-dark)', border:'1px solid var(--color-border)', borderRadius:10, textDecoration:'none', fontSize:14, fontWeight:600 }}>📞 {contact.phone}</a>}
          </div>
        )}
      </div>
    </ViewerShell>
  );

  if (state === 'error') return (
    <ViewerShell brand={brand}>
      <div style={{ textAlign:'center', padding:48 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>❌</div>
        <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:'var(--color-dark)', marginBottom:8 }}>Link not found</div>
        <div style={{ fontSize:14, color:'var(--color-muted)' }}>{error || 'This link may be incomplete or no longer valid.'}</div>
        <div style={{ fontSize:14, color:'var(--color-muted)', marginTop:12 }}>Try opening the link again from your email, making sure the whole address was copied. If it still doesn\'t work, contact your tax advisor.</div>
      </div>
    </ViewerShell>
  );

  // ── Ready — main viewer ────────────────────────────────────
  const segments  = data.segments || [];
  const hasVideo  = !!data.videoUrl;
  const hasAudio  = !!data.audioUrl;

  return (
    <ViewerShell brand={brand} firmName={data.firmName} logoUrl={data.logoUrl}>
      <div style={{ maxWidth:720, margin:'0 auto', padding:'24px 20px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom:24, textAlign:'center' }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:'var(--color-dark)', marginBottom:4 }}>
            Your {data.taxYear} Tax Return Walkthrough
          </div>
          <div style={{ fontSize:13, color:'var(--color-muted)' }}>
            Prepared by {data.firmName} · Watch at your own pace
          </div>
        </div>

        {/* Headline answer first: most clients open this to learn "refund or owe?" */}
        {data.refundOrOwed != null && (() => {
          const isRefund = data.refundOrOwed >= 0;
          return (
            <div style={{ marginBottom:20, textAlign:'center', padding:'18px 20px', borderRadius:14,
              background: isRefund ? 'var(--green-bg)' : 'var(--amber-bg)',
              border:`1px solid ${isRefund ? 'var(--color-green-check)' : 'var(--color-amber-border)'}` }}>
              <div style={{ fontSize:14, fontWeight:600, color: isRefund ? 'var(--green-dark)' : 'var(--color-amber-dark)' }}>
                {isRefund ? 'Your federal refund' : 'Federal balance due'}
              </div>
              <div style={{ fontFamily:'Georgia,serif', fontSize:36, fontWeight:700, color:'var(--color-dark)', margin:'4px 0' }}>
                ${Math.round(Math.abs(data.refundOrOwed)).toLocaleString('en-US')}
              </div>
              <div style={{ fontSize:14, color:'var(--color-dark)' }}>
                {isRefund ? 'The video below explains how we got there.' : 'The video below explains why, and what to do next.'}
              </div>
            </div>
          );
        })()}

        {/* Video player */}
        {hasVideo ? (
          <div style={{ background:'#000', borderRadius:14, overflow:'hidden', marginBottom:20, aspectRatio:'16/9', position:'relative' }}>
            <video
              style={{ width:'100%', height:'100%', display:'block' }}
              controls
              src={data.videoUrl}
              onPlay={handlePlay}
              onTimeUpdate={handleTimeUpdate}
            />
          </div>
        ) : hasAudio ? (
          <div style={{ background:'var(--color-dark)', borderRadius:14, padding:24, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:brand, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🎙️</div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Audio walkthrough</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>
                  {segments.length} scenes · ~{Math.round(segments.reduce((s,sg)=>s+(sg.duration_ms||4000),0)/1000/60)} min est.
                </div>
              </div>
            </div>
            <div role="group" aria-label="Playback speed" style={{ display:'flex', gap:6, marginBottom:10 }}>
              {[1, 1.25, 1.5].map(r => (
                <button key={r} aria-pressed={speed === r}
                  onClick={() => { if (audioRef.current) audioRef.current.playbackRate = r; setSpeed(r); }}
                  style={{ padding:'6px 14px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                    border:'1px solid rgba(255,255,255,.3)', background: speed === r ? '#fff' : 'transparent',
                    color: speed === r ? 'var(--color-dark)' : '#fff' }}>{r}×</button>
              ))}
            </div>
            <audio
              ref={audioRef}
              style={{ width:'100%' }}
              controls
              src={data.audioUrl}
              onLoadedMetadata={e => {
                // Compute accurate segment boundaries once we know the real total duration.
                // Use estimated duration_ms as relative weights, then scale to actual total.
                const totalSec = e.target.duration || 0;
                if (!totalSec || segments.length === 0) return;
                const weights  = segments.map(s => s.duration_ms || 4000);
                const totalW   = weights.reduce((a, b) => a + b, 0);
                let cum = 0;
                const boundaries = weights.map(w => {
                  cum += (w / totalW) * totalSec;
                  return cum;
                });
                setSegmentBoundaries(boundaries);
              }}
              onPlay={handlePlay}
              onTimeUpdate={e => {
                // Call global handler (tracks elapsed time for progress display)
                handleTimeUpdate(e);
                // Scene-sync: highlight transcript row matching current playback position
                if (segments.length === 0) return;
                const t = e.target.currentTime;
                const bounds = segmentBoundaries.length === segments.length
                  ? segmentBoundaries
                  : segments.reduce((acc, s) => {
                      acc.push((acc[acc.length - 1] || 0) + (s.duration_ms || 4000) / 1000);
                      return acc;
                    }, []);
                const idx = bounds.findIndex(b => t < b);
                setCurrentSceneIdx(idx === -1 ? segments.length - 1 : idx);
              }}
            />
          </div>
        ) : (
          <div style={{ background:'var(--color-bg)', borderRadius:14, padding:32, textAlign:'center', marginBottom:20, border:'1px solid var(--color-border)' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>⏳</div>
            <div style={{ fontSize:14, color:'var(--color-muted)' }}>Your walkthrough is still being generated. Check back in a few minutes.</div>
          </div>
        )}

        {/* Brief disclaimer above transcript */}
        <div style={{ marginTop:16, padding:'8px 14px', background:'var(--color-amber-pale)',
          border:'1px solid var(--color-amber-border)', borderRadius:8, fontSize:13, color:'var(--color-amber-dark)',
          display:'flex', alignItems:'center', gap:8 }}>
          <span>⚠️</span>
          <span>For informational purposes only — not tax advice. Consult your advisor before making financial decisions.</span>
        </div>

        {/* Segment list (transcript-style) */}
        {segments.length > 0 && (
          <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:14, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Scene-by-scene summary</div>
              <div style={{ fontSize:11, color:'var(--color-muted-light)' }}>{segments.length} sections</div>
            </div>
            {segments.map((seg, i) => (
              <div key={i} style={{ padding:'12px 18px', borderBottom:i<segments.length-1?'1px solid var(--color-gray-bg)':'none', display:'flex', gap:12, alignItems:'flex-start' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--color-purple-3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:brand, flexShrink:0, marginTop:2 }}>
                  {i+1}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:brand, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>
                    {(seg.section||seg.field_ref||'').replace(/_/g,' ')}
                  </div>
                  <div style={{ fontSize:15, color:'var(--color-dark)', lineHeight:1.65 }}>{seg.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA bar — PDF download + reply to advisor */}
        <div style={{ display:'flex', gap:10, marginTop:20, flexWrap:'wrap' }}>
          {data.pdfUrl && (
            <a href={data.pdfUrl} target="_blank" rel="noreferrer"
              style={{ flex:1, minWidth:180, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                padding:'11px 16px', background:'var(--color-dark)', color:'#fff', borderRadius:10,
                textDecoration:'none', fontSize:13, fontWeight:600, border:'1px solid rgba(255,255,255,.1)' }}>
              📄 Download PDF summary
            </a>
          )}
          {/* Inline reply form — uses client-message function, no email client needed */}
          {!msgSent ? (
            <div style={{ flex:1, minWidth:220 }}>
              <textarea
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                placeholder={`Send a message to ${data.firmName}…`}
                style={{ width:'100%', minHeight:72, padding:'10px 12px', border:'1px solid var(--color-border)',
                  borderRadius:10, fontSize:13, fontFamily:'inherit', lineHeight:1.6,
                  resize:'vertical', color:'var(--color-dark)', background:'#fff', boxSizing:'border-box' }}
              />
              {msgError && <div style={{ fontSize:11, color:'var(--color-red-dark)', marginTop:4 }}>{msgError}</div>}
              <button
                disabled={msgSending || !msgBody.trim()}
                onClick={async () => {
                  if (!msgBody.trim()) return;
                  setMsgSending(true); setMsgError('');
                  try {
                    const res = await fetch('/.netlify/functions/client-message', {
                      method:  'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body:    JSON.stringify({ token, messageBody: msgBody }),
                    });
                    const json = await res.json();
                    if (json.ok) { setMsgSent(true); }
                    else { setMsgError(json.error || 'Failed to send. Please try email instead.'); }
                  } catch { setMsgError('Network error — please try again.'); }
                  setMsgSending(false);
                }}
                style={{ marginTop:8, width:'100%', padding:'10px', background:brand, color:'#fff',
                  border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer',
                  fontFamily:'inherit', opacity:msgSending||!msgBody.trim()?0.6:1 }}>
                {msgSending ? 'Sending…' : `💬 Send message to ${data.firmName}`}
              </button>
            </div>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
              gap:8, padding:'14px 16px', background:'var(--color-green-light)', borderRadius:10, fontSize:13,
              fontWeight:600, color:'var(--color-green-dark)' }}>
              ✓ Message sent — {data.firmName} will be in touch
            </div>
          )}
        </div>

        {(data.advisorEmail || data.advisorPhone) && (
          <div style={{ marginTop:16, textAlign:'center', fontSize:14, color:'var(--color-muted)' }}>
            Prefer to talk it through?{' '}
            {data.advisorPhone && <a href={`tel:${data.advisorPhone}`} style={{ color:brand, fontWeight:700 }}>Call {data.firmName}</a>}
            {data.advisorPhone && data.advisorEmail && ' · '}
            {data.advisorEmail && <a href={`mailto:${data.advisorEmail}`} style={{ color:brand, fontWeight:700 }}>Email {data.advisorPhone ? '' : data.firmName}</a>}
          </div>
        )}

        {/* Disclaimer — moved up, more prominent */}
        <div style={{ marginTop:20, padding:'14px 18px', background:'var(--color-soft)', borderRadius:10, border:'1px solid var(--color-border)' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--color-dark)', marginBottom:4 }}>Important disclosure</div>
          <div style={{ fontSize:13, color:'var(--color-muted)', lineHeight:1.7 }}>
            This walkthrough is for informational purposes only and does not constitute tax advice.
            The figures shown are based on information provided to {data.firmName}.
            Please consult your tax professional with any questions before making financial decisions.
          </div>
        </div>
      </div>
    </ViewerShell>
  );
}

// ── Shell layout ───────────────────────────────────────────────
function ViewerShell({ children, brand = 'var(--color-purple)', firmName, logoUrl }) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)', fontFamily:'Inter,system-ui,sans-serif' }}>
      {/* Nav */}
      <div style={{ background:'var(--color-dark)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {logoUrl
            ? <img src={logoUrl} alt={firmName} style={{ height:28, objectFit:'contain' }} />
            : <img src="/brand/taxstory-lockup-horizontal-one-color-white.svg" alt="TaxStory" style={{ height:22, width:'auto' }} />
          }
          {firmName && !logoUrl && (
            <div style={{ fontFamily:'Georgia,serif', fontSize:16, fontWeight:700, color:'#fff' }}>
              {firmName}
            </div>
          )}
        </div>
        <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'.06em' }}>
          Private link · just for you
        </div>
      </div>

      {/* Content */}
      {children}

      {/* Footer */}
      <div style={{ textAlign:'center', padding:'20px 0 32px', fontSize:11, color:'var(--color-muted-border)' }}>
        Powered by <a href="https://tellmytaxstory.com" style={{ color:brand, textDecoration:'none' }}>TaxStory</a>
        {' '}
      </div>
    </div>
  );
}
