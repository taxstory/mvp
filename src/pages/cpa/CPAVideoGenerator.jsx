import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';

const STEPS = [
  { id:'fetch',  icon:'📄', label:'Loading return data' },
  { id:'script', icon:'✍️', label:'Writing client script' },
  { id:'audio',  icon:'🎙️', label:'Generating voiceover' },
  { id:'done',   icon:'✅', label:'Video ready' },
];

export default function CPAVideoGenerator() {
  const { user } = useAuth();
  const { creditsRemaining, creditsTotal } = useSubscription();
  const [searchParams] = useSearchParams();
  const [returns, setReturns]         = useState([]);
  const [videos, setVideos]           = useState([]);
  const [selectedId, setSelectedId]   = useState(searchParams.get('returnId') || '');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [view, setView]               = useState('list'); // list | generate | detail
  const [currentStep, setCurrentStep] = useState(null);
  const [error, setError]             = useState('');
  const [script, setScript]           = useState('');
  const [audioUrl, setAudioUrl]       = useState('');
  const [editingScript, setEditingScript] = useState(false);
  const [editedScript, setEditedScript]   = useState('');
  const [loading, setLoading]         = useState(true);

  const hasReturns  = returns.length > 0;
  const hasVideos   = videos.length > 0;
  const credits     = creditsRemaining ?? 0;
  const creditTotal = creditsTotal ?? 3;
  const creditPct   = creditTotal > 0 ? Math.min(100, Math.round((credits / creditTotal) * 100)) : 0;
  const isGenerating = ['fetch','script','audio'].includes(currentStep);

  useEffect(() => {
    if (!user) return;
    fetchAll();
    if (searchParams.get('returnId')) {
      setSelectedId(searchParams.get('returnId'));
      setView('generate');
    }
  }, [user]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: parsedReturns }, { data: audioReady }] = await Promise.all([
      supabase.from('tax_returns')
        .select('id,file_name,tax_year,status,created_at,clients(name)')
        .eq('user_id', user.id)
        .in('status', ['parsed','script_ready','audio_ready'])
        .order('created_at', { ascending: false }),
      supabase.from('tax_returns')
        .select('id,file_name,tax_year,status,created_at,audio_url,clients(name)')
        .eq('user_id', user.id).eq('status', 'audio_ready')
        .order('created_at', { ascending: false }),
    ]);
    setReturns(parsedReturns || []);
    setVideos(audioReady || []);
    setLoading(false);
  }

  async function handleGenerate() {
    if (!selectedId || !user) return;
    setError(''); setScript(''); setAudioUrl(''); setCurrentStep('fetch');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` };
      setCurrentStep('script');
      const sr = await fetch('/.netlify/functions/generate-script', {
        method: 'POST', headers,
        body: JSON.stringify({ taxReturnId: selectedId, userId: user.id }),
      });
      if (!sr.ok) { const e = await sr.json(); throw new Error(e.error || 'Script generation failed'); }
      const { script: gs } = await sr.json();
      setScript(gs); setEditedScript(gs);
      setCurrentStep('audio');
      const ar = await fetch('/.netlify/functions/generate-audio', {
        method: 'POST', headers,
        body: JSON.stringify({ taxReturnId: selectedId, userId: user.id, script: gs }),
      });
      if (!ar.ok) { const e = await ar.json(); throw new Error(e.error || 'Audio generation failed'); }
      const { audioUrl: url } = await ar.json();
      setAudioUrl(url);
      setCurrentStep('done');
      await fetchAll();
    } catch(e) { setError(e.message); setCurrentStep(null); }
  }

  function resetGenerate() {
    setCurrentStep(null); setScript(''); setAudioUrl('');
    setSelectedId(''); setError(''); setView('list');
  }

  // ── LIST view ────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Video Generator</div>
          <div className="ts-page-sub">AI-powered client walkthrough videos</div>
        </div>
        {/* Context-aware primary CTA */}
        {loading ? null : hasReturns ? (
          <button className="ts-btn ts-btn-primary" onClick={() => setView('generate')}>
            🎬 Generate video
          </button>
        ) : (
          <Link to="/cpa/projections" className="ts-btn ts-btn-primary">
            📄 Upload a tax return first
          </Link>
        )}
      </div>

      {/* Credit bar */}
      <div className="ts-hero-banner" style={{ marginBottom: '16px' }}>
        <span style={{ fontSize: '20px' }}>🎬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>
            Video credits — {credits} of {creditTotal} remaining
          </div>
          <div className="ts-progress-track">
            <div className="ts-progress-fill" style={{ width: `${creditPct}%` }} />
          </div>
        </div>
        <Link to="/billing" className="ts-btn ts-btn-secondary ts-btn-sm">Buy credits</Link>
      </div>

      {/* Main content — state-aware */}
      {loading ? (
        <div className="ts-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : !hasReturns ? (
        /* ── Empty state: no returns at all ── */
        <div className="ts-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', marginBottom: '8px' }}>
            Upload a tax return to get started
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '380px', margin: '0 auto 24px', lineHeight: 1.7 }}>
            TaxStory generates personalized video walkthroughs from completed tax return PDFs. Upload one first, then come back here to generate a video.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link to="/cpa/projections" className="ts-btn ts-btn-primary">📄 Upload a tax return</Link>
            <Link to="/cpa/projections" className="ts-btn ts-btn-ghost">or enter data manually</Link>
          </div>
        </div>
      ) : (
        /* ── Has returns — show returns ready for video + completed videos ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Returns available for video */}
          <div className="ts-card">
            <div className="ts-card-title">
              Returns ready for video
              <span className="ts-card-sub">{returns.filter(r => r.status !== 'audio_ready').length} available</span>
            </div>
            {returns.filter(r => r.status !== 'audio_ready').length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: '13px' }}>
                All parsed returns already have videos. <Link to="/cpa/projections" style={{ color: 'var(--purple)', fontWeight: 600 }}>Upload another return →</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {returns.filter(r => r.status !== 'audio_ready').map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: '10px',
                    border: '1.5px solid var(--border)', background: 'white',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                        {r.clients?.name || r.file_name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        {r.file_name}{r.tax_year ? ` · Tax Year ${r.tax_year}` : ''}
                      </div>
                    </div>
                    <button
                      className="ts-btn ts-btn-primary ts-btn-sm"
                      disabled={credits === 0}
                      onClick={() => { setSelectedId(r.id); setView('generate'); }}
                    >
                      {credits === 0 ? 'No credits' : '🎬 Generate video'}
                    </button>
                  </div>
                ))}
                {credits === 0 && (
                  <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 500 }}>
                    ⚠️ No credits remaining. <Link to="/billing" style={{ color: '#92400E', fontWeight: 700 }}>Buy credits →</Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Completed videos */}
          {hasVideos && (
            <div className="ts-card">
              <div className="ts-card-title">
                Generated videos
                <span className="ts-card-sub">{videos.length} total</span>
              </div>
              <table className="ts-tbl">
                <thead>
                  <tr><th>Client / return</th><th>Tax year</th><th>Status</th><th>Created</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {videos.map(v => (
                    <tr key={v.id}>
                      <td>
                        <div className="ts-rn">{v.clients?.name || v.file_name || '—'}</div>
                        <div className="ts-rm">{v.file_name}</div>
                      </td>
                      <td>{v.tax_year || '—'}</td>
                      <td><span className="ts-pill ts-p-green">✓ Ready</span></td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {new Date(v.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button className="ts-btn ts-btn-ghost ts-btn-sm"
                          onClick={() => { setSelectedVideo(v); setView('detail'); }}>
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* If has returns but no videos yet */}
          {!hasVideos && (
            <div className="ts-card" style={{ textAlign: 'center', padding: '30px 20px', background: 'var(--purple3)', border: '1.5px solid #AFA9EC' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px' }}>
                🎬 Ready to generate your first video
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
                Select a return above to create a personalized 2–3 min client walkthrough
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── GENERATE view ─────────────────────────────────────────────────
  if (view === 'generate') return (
    <div className="ts-page">
      <button className="ts-back" onClick={resetGenerate}>← Back to videos</button>
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Generate Video</div>
          <div className="ts-page-sub">Create a personalized AI walkthrough for your client</div>
        </div>
      </div>

      <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Return selector — only shown before generation starts */}
        {!currentStep && (
          <div className="ts-card">
            <div className="ts-card-title">
              Select a return
              <span className="ts-card-sub">{credits} credit{credits !== 1 ? 's' : ''} remaining</span>
            </div>

            {credits === 0 && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' }}>
                ⚠️ No credits remaining. <Link to="/billing" style={{ color: '#92400E', fontWeight: 700 }}>Buy more →</Link>
              </div>
            )}

            {returns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>No parsed returns yet.</p>
                <Link to="/cpa/projections" className="ts-btn ts-btn-primary ts-btn-sm">→ Upload a tax return</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {returns.map(r => (
                  <label key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                    borderRadius: '10px', cursor: 'pointer',
                    border: `1.5px solid ${selectedId === r.id ? 'var(--purple)' : 'var(--border)'}`,
                    background: selectedId === r.id ? 'var(--purple3)' : 'white',
                  }}>
                    <input type="radio" name="return" checked={selectedId === r.id}
                      onChange={() => setSelectedId(r.id)}
                      style={{ accentColor: 'var(--purple)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                        {r.clients?.name || r.file_name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        {r.file_name}{r.tax_year ? ` · Tax Year ${r.tax_year}` : ''} · {new Date(r.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`ts-pill ${r.status === 'audio_ready' ? 'ts-p-green' : 'ts-p-purple'}`}>
                      {r.status === 'audio_ready' ? '✓ Has video' : r.status === 'parsed' ? 'Ready' : 'Script done'}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {selectedId && credits > 0 && (
              <button className="ts-btn ts-btn-primary" style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }}
                onClick={handleGenerate} disabled={isGenerating}>
                🎬 Generate Video — uses 1 credit
              </button>
            )}
            {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
          </div>
        )}

        {/* Generation progress */}
        {currentStep && (
          <div className="ts-card">
            <div className="ts-card-title">Generating your video</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {STEPS.map((step, i) => {
                const stepIdx  = STEPS.findIndex(s => s.id === currentStep);
                const isDone   = currentStep === 'done' || i < stepIdx;
                const isActive = step.id === currentStep && currentStep !== 'done';
                return (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                    borderRadius: '10px',
                    background: isActive ? 'var(--purple3)' : isDone ? '#F0FDF4' : '#F9F8FF',
                    border: `1px solid ${isActive ? 'var(--purple)' : isDone ? '#BBF7D0' : 'var(--border)'}`,
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '12px',
                      background: isDone ? 'var(--green)' : isActive ? 'var(--purple)' : '#E8E6F8',
                      color: isDone || isActive ? 'white' : 'var(--muted)',
                    }}>
                      {isDone ? '✓' : isActive
                        ? <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
                        : i + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: isActive ? 'var(--purple)' : isDone ? '#065F46' : 'var(--muted)' }}>
                        {step.icon} {step.label}
                      </div>
                      {isActive && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                          {step.id === 'script' ? 'Claude is writing a personalized script…' : 'Converting script to natural-sounding voiceover…'}
                        </div>
                      )}
                      {isDone && <div style={{ fontSize: '11px', color: '#065F46' }}>Complete</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Audio player */}
        {currentStep === 'done' && audioUrl && (
          <div className="ts-card">
            <div className="ts-card-title">🎙️ Client voiceover</div>
            <audio controls style={{ width: '100%' }} src={audioUrl} />
            <a href={audioUrl} download style={{ fontSize: '12px', color: 'var(--purple)', display: 'inline-block', marginTop: '10px', fontWeight: 600 }}>
              ↓ Download audio
            </a>
          </div>
        )}

        {/* Script viewer */}
        {currentStep === 'done' && script && (
          <div className="ts-card">
            <div className="ts-card-title">
              📝 Generated script
              <button onClick={() => { setEditingScript(!editingScript); setEditedScript(script); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--purple)', fontWeight: 600 }}>
                {editingScript ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingScript ? (
              <>
                <textarea value={editedScript} onChange={e => setEditedScript(e.target.value)} rows={16} style={{ resize: 'vertical' }} />
                <button className="ts-btn ts-btn-primary ts-btn-sm" style={{ marginTop: '10px' }}
                  onClick={() => { setScript(editedScript); setEditingScript(false); }}>
                  Save edits
                </button>
              </>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.8, maxHeight: '200px', overflow: 'hidden', position: 'relative' }}>
                {script.split('\n').map((l, i) => <p key={i}>{l}</p>)}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, white)' }} />
              </div>
            )}
          </div>
        )}

        {currentStep === 'done' && (
          <button onClick={resetGenerate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--purple)', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}>
            ← Generate another video
          </button>
        )}

        {error && !currentStep && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '13px' }}>{error}</div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── DETAIL view ───────────────────────────────────────────────────
  const v = selectedVideo || {};
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={() => setView('list')}>← Back to videos</button>
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">{v.clients?.name || v.file_name || 'Video walkthrough'}</div>
          <div className="ts-page-sub">Tax year {v.tax_year || '—'} · {new Date(v.created_at).toLocaleDateString()}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {v.audio_url && <a href={v.audio_url} download className="ts-btn ts-btn-secondary">↓ Download</a>}
          <button className="ts-btn ts-btn-primary">📧 Send to client</button>
        </div>
      </div>
      <div className="ts-split-wide">
        <div className="ts-card">
          <div className="ts-card-title">Audio walkthrough</div>
          {v.audio_url
            ? <audio controls style={{ width: '100%' }} src={v.audio_url} />
            : <div style={{ background: 'var(--bg)', borderRadius: '10px', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>Audio not available</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="ts-card">
            <div className="ts-card-title">Return details</div>
            {[['File', v.file_name], ['Tax year', v.tax_year], ['Status', 'Ready'], ['Created', new Date(v.created_at).toLocaleDateString()]].map(([k, val]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F0EEF8', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 500, color: 'var(--dark)' }}>{val || '—'}</span>
              </div>
            ))}
            <Link to="/cpa/projections" className="ts-btn ts-btn-ghost ts-btn-sm" style={{ marginTop: '10px' }}>View full projection →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
