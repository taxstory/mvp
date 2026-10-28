// src/pages/cpa/CPAVideoGenerator.jsx
// Option A video pipeline: structured script → per-segment TTS → Remotion composition
// Supports both Lambda render (if configured) and client-side preview

import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';
import VideoRenderer from '../../components/VideoRenderer';
import { SignedAudio, SignedLink, signAudio } from '../../components/SignedMedia';
import { usePrivacyMode } from '../../hooks/usePrivacyMode';
import UnverifiedAmountsModal from '../../components/UnverifiedAmountsModal';

// ── Module-level style constants ─────────────────────────────────────────────
// Defined outside the component so they're created once, not on every render.
// Style objects inside render functions are allocated and GC'd on every paint.
const S = {
  card:    { background: '#fff', border: '1px solid var(--color-border)', borderRadius: 13, padding: '18px 20px', marginBottom: 12 },
  cardSm:  { background: '#fff', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 },
  label:   { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 },
  input:   { width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8,
             fontSize: 13, fontFamily: 'inherit', color: 'var(--dark)', background: 'var(--color-soft-white)' },
  btnPri:  { padding: '9px 18px', background: 'var(--purple)', color: '#fff', border: 'none',
             borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSec:  { padding: '9px 18px', background: 'var(--purple3)', color: 'var(--purple)', border: 'none',
             borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  muted:   { fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 },
  pill:    { display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
             borderRadius: 20, fontSize: 10.5, fontWeight: 600 },
  pillPurple: { background: 'var(--purple3)', color: 'var(--purple)' },
  pillGreen:  { background: 'var(--green-bg)', color: 'var(--green-dark)' },
  pillAmber:  { background: 'var(--amber-bg)', color: 'var(--color-amber-dark)' },
  row:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
             padding: '8px 0', borderBottom: '1px solid var(--color-gray-bg)' },
};


function cleanFilename(name) {
  if (!name) return '';
  return name.replace(/\s*\(\d+\)/g, '').replace(/\.pdf$/i, '');
}

const STEPS = [
  { id: 'script', icon: '✍️', label: 'Writing personalized script',     sub: 'Claude is writing narration from your approved figures. No names or identifiers are sent.' },
  { id: 'audio',  icon: '🎙️', label: 'Generating voiceover audio',       sub: 'Converting each scene to natural speech. This runs in the background, so long narrations are fine.' },
  { id: 'video',  icon: '🎬', label: 'Assembling video walkthrough',     sub: 'Syncing audio with Form 1040 highlights...' },
  { id: 'done',   icon: '✅', label: 'Walkthrough ready',                sub: '' },
];

export default function CPAVideoGenerator() {
  const { user } = useAuth();
  const { creditsRemaining, creditsTotal, creditsUsed } = useSubscription();
  const [searchParams] = useSearchParams();

  const [returns, setReturns]   = useState([]);
  const [videos, setVideos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState('list');   // list | generate | detail
  const [selectedId, setSelectedId]     = useState(searchParams.get('returnId') || '');
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Generation state
  const [currentStep, setCurrentStep] = useState(null);
  const [error, setError]             = useState('');
  const [segments, setSegments]       = useState([]);
  const [script, setScript]           = useState('');
  const [audioUrl, setAudioUrl]       = useState('');
  const [audioProgress, setAudioProgress] = useState(0);
  const [videoProps, setVideoProps]   = useState(null);
  const [editingScript, setEditingScript]   = useState(false);
  const [editedScript, setEditedScript]     = useState('');

  // Video composition metadata (fetched after audio generates)
  const [selectedReturnData, setSelectedReturnData]   = useState(null);
  const [selectedReturnYear, setSelectedReturnYear]   = useState(2025);
  const [firmNameForVideo, setFirmNameForVideo]       = useState('TaxStory');
  const [firmColorForVideo, setFirmColorForVideo]     = useState('var(--purple)');

  // Video player state
  const videoRef = useRef();
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState(0);
  const [isPlaying, setIsPlaying]                 = useState(false);
  const [elapsed, setElapsed]                     = useState(0);

  // Script-review gate (credit is only spent after the CPA confirms the script)
  const [awaitingScriptConfirm, setAwaitingScriptConfirm] = useState(false);
  const [pendingSegs, setPendingSegs]                     = useState([]);
  const [renderProgress, setRenderProgress]               = useState(0);
  const [videoSave, setVideoSave]                         = useState({ state: 'idle', error: '' });   // idle | saving | saved | error

  // Share panel
  const [shareUrl, setShareUrl]         = useState('');
  const [shareResult, setShareResult]   = useState(null);
  const { labelsOnly } = usePrivacyMode();
  const [approvalAsk, setApprovalAsk] = useState(null);   // { amounts, resolve } while the advisor is deciding on unverified amounts
  const askApproval = amounts => new Promise(resolve => setApprovalAsk({ amounts, resolve: v => { setApprovalAsk(null); resolve(v); } }));
  const [shareEmail, setShareEmail]     = useState('');
  const [shareLabel, setShareLabel]     = useState('');
  const [shareSending, setShareSending] = useState(false);
  const [shareCopied, setShareCopied]   = useState(false);

  const credits     = creditsRemaining ?? 0;
  const creditTotal = creditsTotal ?? 3;
  const creditPct   = creditTotal > 0 ? Math.min(100, Math.round((credits / creditTotal) * 100)) : 0;
  const hasReturns  = returns.length > 0;
  const hasVideos   = videos.length > 0;
  const isGenerating = currentStep && currentStep !== 'done';

  useEffect(() => {
    if (!user) return;
    fetchAll();
    if (searchParams.get('returnId')) setView('generate');
  }, [user]);

  // Track current segment during playback
  useEffect(() => {
    if (!isPlaying || !segments.length || !audioUrl) return;
    const interval = setInterval(() => {
      setElapsed(e => {
        const newElapsed = e + 100;
        let cumulative = 0;
        for (let i = 0; i < segments.length; i++) {
          cumulative += segments[i].duration_ms || 4000;
          if (newElapsed < cumulative) { setCurrentSegmentIdx(i); break; }
        }
        return newElapsed;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, segments, audioUrl]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: parsed }, { data: ready }] = await Promise.all([
      supabase.from('tax_returns')
        .select('id,file_name,tax_year,status,created_at,clients(name)')
        .eq('user_id', user.id)
        .in('status', ['parsed','script_ready','audio_ready'])
        .order('created_at', { ascending: false }),
      supabase.from('tax_returns')
        .select('id,file_name,tax_year,status,created_at,audio_url,audio_segments,parsed_data,clients(name)')
        .eq('user_id', user.id)
        .eq('status', 'audio_ready')
        .order('created_at', { ascending: false }),
    ]);
    setReturns(parsed || []);
    setVideos(ready  || []);
    setLoading(false);
  }

  async function handleGenerate() {
    if (!selectedId || !user) return;
    setError(''); setScript(''); setAudioUrl(''); setSegments([]);
    setVideoProps(null); setCurrentSegmentIdx(0); setElapsed(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      // Step 1: Generate structured script
      setCurrentStep('script');
      const sr = await fetch('/.netlify/functions/generate-script', {
        method: 'POST', headers,
        body: JSON.stringify({ taxReturnId: selectedId }),
      });
      if (!sr.ok) { const e = await sr.json(); throw new Error(e.error || 'Script generation failed'); }
      const { script: gs, segments: segs } = await sr.json();
      setScript(gs); setEditedScript(gs); setSegments(segs || []);

      // Pause here — show the script preview and wait for CPA confirmation
      // before spending a credit on audio generation.
      // setAwaitingScriptConfirm(true) triggers the inline preview UI.
      setAwaitingScriptConfirm(true);
      setPendingSegs(segs);
      return; // handleGenerate will be called again from "Looks good, generate audio →"
    } catch(e) { setError(e.message || 'Generation failed'); setCurrentStep(null); }
  }

  // Polls the job until it finishes. Throws a user-safe Error if it fails (the credit is returned automatically).
  // If the worker has not picked the job up after ~15 s it is nudged once more (starting is atomic, so this is safe).
  async function waitForAudioJob(jobId, kick) {
    const started = Date.now(); let nudged = false;
    for (;;) {
      await new Promise(r => setTimeout(r, 2000));
      const { data: job } = await supabase.from('jobs').select('status, progress, error').eq('id', jobId).maybeSingle();
      if (job) setAudioProgress(job.progress || 0);
      if (job?.status === 'succeeded') return job;
      if (job?.status === 'failed') throw new Error(job.error || 'Audio generation failed. Your credit has been returned — please try again.');
      if (!nudged && job?.status === 'queued' && Date.now() - started > 15000) { nudged = true; kick(); }
      if (Date.now() - started > 16 * 60 * 1000) throw new Error('This is taking longer than expected. If it does not finish, your credit is returned automatically — please check again in a few minutes.');
    }
  }

  async function handleGenerateAudio() {
    if (!pendingSegs?.length) return;
    // Validate no empty segments — empty text causes silent audio gaps
    const emptyIdx = pendingSegs.findIndex(s => !s.text?.trim());
    if (emptyIdx > -1) {
      setError(`Scene ${emptyIdx + 1} has no text. Please add narration or remove the empty scene before generating.`);
      return;
    }
    setAwaitingScriptConfirm(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` };
      // Step 2: Generate per-segment audio
      setCurrentStep('audio'); setAudioProgress(0);
      const segs = pendingSegs;
      // (a) queue the job: validates, charges one credit, and returns immediately
      const requestKey = crypto.randomUUID();   // one key per click: a retried request returns the same job instead of charging twice
      const post = (extra = {}) => fetch('/.netlify/functions/start-audio-job', {
        method: 'POST', headers,
        body: JSON.stringify({ taxReturnId: selectedId, segments: segs, script, requestKey, ...extra }),
      });
      let sr = await post();
      if (!sr.ok) {
        const e = await sr.json().catch(() => ({}));
        if (e.code === 'unverified_amounts' && e.details?.amounts?.length) {   // an amount in the (edited) narration is not on the return: a RECORDED approval is required
          const decision = await askApproval(e.details.amounts);
          if (!decision) throw new Error('Nothing was generated. Edit the script and try again.');
          sr = await post({ approval: { amounts: e.details.amounts, kind: decision.kind, note: decision.note } });
          if (!sr.ok) { const e2 = await sr.json().catch(() => ({})); throw new Error(e2.error || 'Could not start audio generation'); }
        } else throw new Error(e.error || 'Could not start audio generation');
      }
      const { jobId } = await sr.json();
      // (b) start the background worker (answers 202 at once; the work continues server-side for up to 15 minutes)
      const kick = () => fetch('/.netlify/functions/generate-audio-background', { method: 'POST', headers, body: JSON.stringify({ jobId }), keepalive: true }).catch(() => {});
      kick();
      // (c) wait for it by polling the job row (row-level security: only our own jobs are visible)
      await waitForAudioJob(jobId, kick);
      const { data: done } = await supabase.from('tax_returns').select('audio_url, audio_segments').eq('id', selectedId).single();
      setAudioUrl(await signAudio(done?.audio_url));
      if (done?.audio_segments) setSegments(done.audio_segments);

      // Fetch return data + firm profile for the video renderer
      const [{ data: returnData }, { data: firmProfile }] = await Promise.all([
        supabase.from('tax_returns').select('parsed_data, tax_year').eq('id', selectedId).single(),
        supabase.from('profiles').select('firm_name, brand_color').eq('id', user.id).maybeSingle(),
      ]);
      if (returnData) {
        setSelectedReturnData(returnData.parsed_data || {});
        setSelectedReturnYear(returnData.tax_year || 2025);
      }
      if (firmProfile) {
        setFirmNameForVideo(firmProfile.firm_name || 'TaxStory');
        setFirmColorForVideo(firmProfile.brand_color || '#6B5CE7');
      }

      // Step 3: Trigger video assembly (Lambda or client-side)
      setCurrentStep('video');
      const vr = await fetch('/.netlify/functions/generate-video', {
        method: 'POST', headers,
        body: JSON.stringify({ taxReturnId: selectedId }),
      });
      if (!vr.ok) { const e = await vr.json(); throw new Error(e.error || 'Video assembly failed'); }
      const videoResult = await vr.json();
      setVideoProps(videoResult);

      setCurrentStep('done');
      await fetchAll();

    } catch(e) { setError(e.message); setCurrentStep(null); }
  }

  // Upload the rendered walkthrough to the advisor's private folder and record it, so the share link plays the VIDEO (not just the audio).
  async function saveRenderedVideo(blob, { mime, ext }) {
    setVideoSave({ state: 'saving', error: '' });
    try {
      const path = `${user.id}/${selectedId}/walkthrough.${ext}`;
      const { error: upErr } = await supabase.storage.from('audio').upload(path, blob, { contentType: mime, upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/save-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ taxReturnId: selectedId, ext }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save the video');
      setVideoSave({ state: 'saved', error: '' });
    } catch (e) {
      setVideoSave({ state: 'error', error: `The video rendered but could not be saved (${e.message}). Share links will deliver the audio walkthrough until it is saved — try Re-render.` });
    }
  }

  function resetGenerate() {
    setCurrentStep(null); setScript(''); setAudioUrl('');
    setSegments([]); setVideoProps(null); setSelectedId('');
    setError(''); setView('list'); setRenderProgress(0);
    setShareUrl(''); setShareResult(null); setShareEmail(''); setShareLabel('');
    setVideoSave({ state: 'idle', error: '' });
  }

  async function handleShare(e) {
    e.preventDefault();
    if (!selectedId) return;
    setShareSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/create-share-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body:    JSON.stringify({
          taxReturnId:    selectedId,
          label:          shareLabel || `Shared ${new Date().toLocaleDateString()}`,
          sendEmail:      !!shareEmail.trim(),
          sendTo:         shareEmail.trim() || null,
          deliveryMethod: shareEmail.trim() ? 'email' : 'copied',
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to create share link');
      setShareResult({ viewerUrl: json.viewerUrl, emailSent: json.emailSent });
      setShareUrl(json.viewerUrl);
    } catch(err) { setError(err.message); }
    setShareSending(false);
  }

  function copyShareLink() {
    if (!shareResult?.viewerUrl) return;
    navigator.clipboard.writeText(shareResult.viewerUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Video Generator</div>
          <div className="ts-page-sub">AI-generated walkthroughs — Form 1040 with highlighted fields, synced voiceover, and branded presentation</div>
        </div>
        {!loading && (hasReturns
          ? <button className="ts-btn ts-btn-primary" onClick={() => setView('generate')}>🎬 Generate walkthrough</button>
          : <Link to="/cpa/projections" className="ts-btn ts-btn-primary">📄 Upload a return first</Link>
        )}
      </div>

      {/* Credit bar */}
      <div className="ts-hero-banner" style={{ marginBottom: '16px' }}>
        <span style={{ fontSize: '20px' }}>🎬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>
            Walkthrough credits — {credits} of {creditTotal} remaining
          </div>
          <div className="ts-progress-track">
            <div className="ts-progress-fill" style={{ width: `${creditPct}%` }} />
          </div>
        </div>
        <Link to="/billing" className="ts-btn ts-btn-secondary ts-btn-sm">Buy credits</Link>
      </div>

      {loading ? (
        <div className="ts-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : !hasReturns ? (
        <div className="ts-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: '18px', fontWeight: 700, color: 'var(--dark)', marginBottom: '8px' }}>
            Upload a tax return to get started
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '380px', margin: '0 auto 24px', lineHeight: 1.7 }}>
            TaxStory generates personalized video walkthroughs from completed tax returns — the Form 1040 layout with highlighted fields synced to narration.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link to="/cpa/projections" className="ts-btn ts-btn-primary">📄 Upload a tax return</Link>
            <Link to="/cpa/projections" className="ts-btn ts-btn-ghost">or enter data manually</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Returns ready for video */}
          <div className="ts-card">
            <div className="ts-card-title">
              Returns ready for video
              <span className="ts-card-sub">{returns.filter(r => r.status !== 'audio_ready').length} available</span>
            </div>
            {returns.filter(r => r.status !== 'audio_ready').length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: '13px' }}>
                All returns have walkthroughs. <Link to="/cpa/projections" style={{ color: 'var(--purple)', fontWeight: 600 }}>Upload another →</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {returns.filter(r => r.status !== 'audio_ready').map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'white' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dark)' }}>
                        {r.clients?.name
                          ? <>{r.clients.name}{r.tax_year ? <span style={{fontWeight:400,color:'var(--muted)',marginLeft:6}}>{r.tax_year}</span> : null}</>
                          : cleanFilename(r.file_name)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        {r.clients?.name ? r.file_name : r.tax_year ? `Tax Year ${r.tax_year}` : 'No year'}
                      </div>
                    </div>
                    <button
                      className="ts-btn ts-btn-primary ts-btn-sm"
                      disabled={credits === 0}
                      onClick={() => { setSelectedId(r.id); setView('generate'); }}>
                      {credits === 0 ? 'No credits' : '🎬 Generate walkthrough'}
                    </button>
                  </div>
                ))}
                {credits === 0 && (
                  <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--color-amber-border)', color: 'var(--color-amber-dark)', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 500 }}>
                    ⚠️ No credits remaining. <Link to="/billing" style={{ color: 'var(--color-amber-dark)', fontWeight: 700 }}>Buy credits →</Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Completed walkthroughs */}
          {hasVideos && (
            <div className="ts-card">
              <div className="ts-card-title">Generated walkthroughs <span className="ts-card-sub">{videos.length} total</span></div>
              <table className="ts-tbl">
                <thead><tr><th>Client / return</th><th>Tax year</th><th>Segments</th><th>Duration</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {videos.map(v => {
                    const segs = v.audio_segments || [];
                    const totalSec = segs.reduce((s, seg) => s + (seg.duration_s || 0), 0);
                    return (
                      <tr key={v.id}>
                        <td>
                          <div className="ts-rn">{v.clients?.name || cleanFilename(v.file_name) || '—'}</div>
                          <div className="ts-rm">{v.file_name}</div>
                        </td>
                        <td>{v.tax_year || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{segs.length > 0 ? `${segs.length} scenes` : '—'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {totalSec > 0 ? `${Math.round(totalSec)}s` : '—'}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{new Date(v.created_at).toLocaleDateString()}</td>
                        <td>
                          <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={() => { setSelectedVideo(v); setView('detail'); }}>
                            View →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── GENERATE VIEW ─────────────────────────────────────────────────
  if (view === 'generate') return (
    <div className="ts-page">
      {approvalAsk && <UnverifiedAmountsModal amounts={approvalAsk.amounts} onResolve={approvalAsk.resolve} />}
      <button className="ts-back" onClick={resetGenerate}>← Back to walkthroughs</button>
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">Generate Walkthrough</div>
          <div className="ts-page-sub">Form 1040 with highlighted fields, synced narration, and firm branding</div>
        </div>
      </div>

      <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Return selector — shown before generation */}
        {!currentStep && (
          <div className="ts-card">
            <div className="ts-card-title">
              Select a return
              <span className="ts-card-sub">{credits} credit{credits !== 1 ? 's' : ''} remaining</span>
            </div>

            {credits === 0 && (
              <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--color-amber-border)', color: 'var(--color-amber-dark)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' }}>
                ⚠️ No credits remaining. <Link to="/billing" style={{ color: 'var(--color-amber-dark)', fontWeight: 700 }}>Buy more →</Link>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {returns.map(r => (
                <label key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                  borderRadius: '10px', cursor: 'pointer',
                  border: `1.5px solid ${selectedId === r.id ? 'var(--purple)' : 'var(--border)'}`,
                  background: selectedId === r.id ? 'var(--purple3)' : 'white',
                }}>
                  <input type="radio" name="return" checked={selectedId === r.id}
                    onChange={() => setSelectedId(r.id)} style={{ accentColor: 'var(--purple)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                      {r.clients?.name || cleanFilename(r.file_name)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      {r.file_name}{r.tax_year ? ` · Tax Year ${r.tax_year}` : ''}
                    </div>
                  </div>
                  <span className={`ts-pill ${r.status === 'audio_ready' ? 'ts-p-green' : 'ts-p-purple'}`}>
                    {r.status === 'audio_ready' ? '✓ Has walkthrough' : r.status === 'parsed' ? 'Ready' : 'Script done'}
                  </span>
                </label>
              ))}
            </div>

            {/* What the video includes */}
            <div style={{ background: 'var(--bg)', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: '6px' }}>What's included in the walkthrough:</div>
              {['Branded intro/outro with your firm name', 'Form 1040 layout with each field highlighted as it\'s discussed', 'Natural voiceover narration (OpenAI TTS)', 'Animated subtitles per segment', 'Planning tips for next year'].map(item => (
                <div key={item} style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓</span> {item}
                </div>
              ))}
            </div>

            {awaitingScriptConfirm && segments.length > 0 && (
              <div style={{background:'var(--bg)',border:'1.5px solid var(--purple)',borderRadius:12,padding:'16px 18px',marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--dark)',marginBottom:8}}>📝 Review script before generating audio</div>
                {(() => {
                  // Rough audio duration estimate: ~130 words/minute for TTS narration
                  const wordCount = segments.reduce((s, sg) => s + (sg.text||'').split(/\s+/).length, 0);
                  const estSec    = Math.round(wordCount / 130 * 60);
                  const estMin    = Math.floor(estSec / 60);
                  const estRemSec = estSec % 60;
                  const estStr    = estMin > 0 ? `~${estMin}m ${estRemSec}s` : `~${estSec}s`;
                  return (
                    <div style={{display:'flex',gap:12,marginBottom:12}}>
                      <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.6,flex:1}}>
                        This is what Claude will narrate. Edit any segment, then click "Generate audio" — this will use 1 credit.
                      </div>
                      <div style={{flexShrink:0,background:'var(--bg)',borderRadius:9,padding:'8px 12px',textAlign:'center'}}>
                        <div style={{fontSize:18,fontWeight:700,color:'var(--purple)'}}>{estStr}</div>
                        <div style={{fontSize:10,color:'var(--muted)'}}>est. audio</div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:260,overflowY:'auto',marginBottom:14}}>
                  {segments.map((seg,i) => (
                    <div key={i} style={{background:'#fff',border:'1px solid var(--border)',borderRadius:9,padding:'10px 12px'}}>
                      <div style={{fontSize:9.5,fontWeight:700,color:'var(--purple)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5}}>
                        Scene {i+1} — {(seg.field_ref||seg.section||'').replace(/_/g,' ')}
                      </div>
                      <textarea
                        value={seg.text}
                        onChange={e => {
                          const updated = [...segments];
                          updated[i] = {...updated[i], text: e.target.value};
                          setSegments(updated); setPendingSegs(updated);
                        }}
                        style={{width:'100%',border:'none',background:'transparent',fontSize:12.5,
                          color:'var(--dark)',resize:'none',fontFamily:'inherit',lineHeight:1.6,
                          outline:'none',padding:0}}
                        rows={Math.max(2, Math.ceil(seg.text.length / 60))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="ts-btn ts-btn-secondary" style={{flex:1}}
                    onClick={() => { setAwaitingScriptConfirm(false); setPendingSegs([]); setCurrentStep(null); }}>
                    ← Discard
                  </button>
                  <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={handleGenerateAudio}>
                    ✓ Generate audio — 1 credit →
                  </button>
                </div>
              </div>
            )}
            {selectedId && credits > 0 && !awaitingScriptConfirm && (
              <button className="ts-btn ts-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleGenerate} disabled={isGenerating}>
                🎬 Generate walkthrough — uses 1 credit
              </button>
            )}
            {error && <div style={{ background: 'var(--color-red-light)', color: 'var(--color-red-dark)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
          </div>
        )}

        {/* Generation progress */}
        {currentStep && (
          <div className="ts-card">
            <div className="ts-card-title">Generating your walkthrough</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {STEPS.map((step, i) => {
                const stepIdx  = STEPS.findIndex(s => s.id === currentStep);
                const isDone   = currentStep === 'done' || i < stepIdx;
                const isActive = step.id === currentStep && currentStep !== 'done';
                return (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px',
                    borderRadius: '10px',
                    background: isActive ? 'var(--purple3)' : isDone ? 'var(--color-green-light)' : 'var(--color-soft)',
                    border: `1px solid ${isActive ? 'var(--purple)' : isDone ? 'var(--color-green-pale)' : 'var(--border)'}`,
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? 'var(--green)' : isActive ? 'var(--purple)' : 'var(--color-purple-tint)',
                      color: isDone || isActive ? 'white' : 'var(--muted)',
                      fontWeight: 700, fontSize: '12px',
                    }}>
                      {isDone ? '✓' : isActive
                        ? <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid white', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
                        : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: isActive ? 'var(--purple)' : isDone ? 'var(--green-dark)' : 'var(--muted)' }}>
                        {step.icon} {step.label}
                      </div>
                      {isActive && step.sub && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                          {step.sub}{step.id === 'audio' && audioProgress > 0 ? ` (${audioProgress}%)` : ''}
                        </div>
                      )}
                      {isDone && <div style={{ fontSize: '11px', color: 'var(--green-dark)', marginTop: '2px' }}>Complete</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Segment preview — shown during/after audio generation */}
        {segments.length > 0 && (
          <div className="ts-card">
            <div className="ts-card-title">Script segments — {segments.length} scenes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
              {segments.map((seg, i) => (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: '8px',
                  background: currentStep === 'done' && currentSegmentIdx === i && isPlaying ? 'var(--purple3)' : 'var(--bg)',
                  border: `1px solid ${currentStep === 'done' && currentSegmentIdx === i && isPlaying ? 'var(--purple)' : 'var(--border)'}`,
                  fontSize: '12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {seg.field_ref?.replace(/_/g, ' ')}
                    </span>
                    {seg.duration_s && (
                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{seg.duration_s}s</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--dark)', lineHeight: 1.5 }}>{seg.text}</div>
                </div>
              ))}
            </div>

            {/* Edit script */}
            <div style={{ marginTop: '10px' }}>
              <button onClick={() => setEditingScript(!editingScript)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--purple)', fontWeight: 600 }}>
                {editingScript ? 'Cancel editing' : '✏️ Edit script text'}
              </button>
              {editingScript && (
                <>
                  <textarea value={editedScript} onChange={e => setEditedScript(e.target.value)}
                    rows={14} style={{ width: '100%', marginTop: '8px', resize: 'vertical', fontSize: '12px', lineHeight: 1.7 }} />
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                    Note: Editing the text here updates the script display. To re-generate audio with edits, regenerate the walkthrough.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Audio player — appears when audio is ready */}
        {currentStep === 'done' && audioUrl && (
          <div className="ts-card">
            <div className="ts-card-title">🎙️ Voiceover audio</div>
            <audio controls style={{ width: '100%' }} src={audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => { setIsPlaying(false); setCurrentSegmentIdx(0); setElapsed(0); }} />
            {segments.length > 0 && isPlaying && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--purple)', fontWeight: 600 }}>
                Scene {currentSegmentIdx + 1} of {segments.length}: {segments[currentSegmentIdx]?.field_ref?.replace(/_/g, ' ')}
              </div>
            )}
            <a href={audioUrl} download style={{ fontSize: '12px', color: 'var(--purple)', display: 'inline-block', marginTop: '8px', fontWeight: 600 }}>
              ↓ Download audio
            </a>
          </div>
        )}

        {/* Video renderer — client-side Canvas + MediaRecorder */}
        {currentStep === 'done' && segments.length > 0 && (
          <div className="ts-card" style={{ border: '1.5px solid var(--purple)' }}>
            <div className="ts-card-title">🎬 Video walkthrough
              <span className="ts-card-sub">renders in your browser · fastest in Chrome or Edge</span>
            </div>
            {videoProps?.mode === 'lambda' ? (
              <div style={{ fontSize: '13px', color: 'var(--dark)' }}>
                ⏳ Rendering on AWS Lambda… Render ID: <code style={{ fontSize: '11px' }}>{videoProps.renderId}</code>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>Refresh in 60 seconds to see the completed walkthrough.</div>
              </div>
            ) : (
              <>
              <VideoRenderer
                segments={segments}
                parsedData={selectedReturnData}
                year={selectedReturnYear}
                firmName={firmNameForVideo}
                firmColor={firmColorForVideo}
                audioUrl={audioUrl}
                facts={videoProps?.compositionProps?.facts}
                onComplete={(url, blob, meta) => { setRenderProgress(100); saveRenderedVideo(blob, meta); }}
                onProgress={(pct) => setRenderProgress(pct)}
              />
              {videoSave.state === 'saving' && (
                <div style={{ marginTop:10, fontSize:12.5, color:'var(--muted)' }}>Saving the video so your client receives it…</div>
              )}
              {videoSave.state === 'error' && (
                <div style={{ marginTop:10, padding:'10px 14px', background:'var(--color-red-light)', color:'var(--color-red-dark)', borderRadius:10, fontSize:12.5 }}>{videoSave.error}</div>
              )}
              {renderProgress === 100 && videoSave.state === 'saved' && (
                <div style={{ marginTop:10, padding:'10px 14px', background:'var(--green-bg)',
                  border:'1px solid var(--color-green-check)', borderRadius:10, display:'flex',
                  alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                  <div style={{ fontSize:12.5, fontWeight:600, color:'var(--green-dark)' }}>
                    ✓ Video rendered — ready to share with your client
                  </div>
                  <button
                    onClick={() => document.querySelector('[data-share-panel]')?.scrollIntoView({ behavior:'smooth' })}
                    style={{ padding:'7px 14px', background:'var(--green-dark)', color:'#fff', border:'none',
                      borderRadius:9, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                    Create share link ↓
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {error && !currentStep && (
          <div style={{ background: 'var(--color-red-light)', color: 'var(--color-red-dark)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px' }}>{error}</div>
        )}

        <div data-share-panel />
        {currentStep === 'done' && (
          <div className="ts-card" style={{ border: '1.5px solid var(--purple)' }}>
            <div className="ts-card-title">📤 Share with your client
              <span className="ts-card-sub">secure link · no client account required</span>
            </div>

            {shareResult ? (
              /* ── Share success state ── */
              <div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                    Viewer link
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input readOnly value={shareResult.viewerUrl}
                      style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 12.5, fontFamily: 'inherit', color: 'var(--dark)', background: 'var(--bg)' }}
                      onClick={e => e.target.select()} />
                    <button onClick={copyShareLink}
                      style={{ padding: '9px 16px', background: shareCopied ? 'var(--green)' : 'var(--purple)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background .2s' }}>
                      {shareCopied ? '✓ Copied!' : 'Copy link'}
                    </button>
                  </div>
                </div>
                {shareResult.emailSent && (
                  <div style={{ padding: '10px 12px', background: 'var(--green-bg)', borderRadius: 9, fontSize: 12.5, color: 'var(--green-dark)', fontWeight: 500 }}>
                    ✓ Email sent to {shareEmail}
                  </div>
                )}
                <a href={shareResult.viewerUrl} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--purple)', fontWeight: 500 }}>
                  Preview as client →
                </a>
              </div>
            ) : (
              /* ── Share creation form ── */
              <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                    Client email <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — leave blank to copy link{labelsOnly ? '. Used once to send this email; never saved' : ''})</span>
                  </label>
                  <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                    placeholder="client@email.com"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', color: 'var(--dark)', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" disabled={shareSending}
                  style={{ padding: '11px', background: 'var(--purple)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: shareSending ? 0.7 : 1 }}>
                  {shareSending ? 'Creating link…' : shareEmail.trim() ? '📧 Send to client' : '🔗 Create share link'}
                </button>
              </form>
            )}
          </div>
        )}

        {currentStep === 'done' && (
          <button onClick={resetGenerate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--purple)', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}>
            ← Generate another walkthrough
          </button>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  // ── DETAIL VIEW ───────────────────────────────────────────────────
  const v   = selectedVideo || {};
  const segs = v.audio_segments || [];
  const totalSec = segs.reduce((s, seg) => s + (seg.duration_s || 0), 0);

  return (
    <div className="ts-page">
      <button className="ts-back" onClick={() => setView('list')}>← Back to walkthroughs</button>
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">
            {v.clients?.name || cleanFilename(v.file_name) || 'Walkthrough'}
            {v.tax_year && <span style={{fontSize:14,fontWeight:400,color:'var(--muted)',marginLeft:8}}>{v.tax_year} return</span>}
          </div>
          <div className="ts-page-sub">
            Tax year {v.tax_year || '—'} · {segs.length} scenes · {Math.round(totalSec)}s · {new Date(v.created_at).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {v.audio_url && <SignedLink value={v.audio_url} className="ts-btn ts-btn-secondary">↓ Open audio</SignedLink>}
          <button className="ts-btn ts-btn-primary"
              onClick={() => {
                // Navigate to the generate view for this return to access share
                setSelectedId(v.id); setCurrentStep('done');
                signAudio(v.audio_url).then(u => setAudioUrl(u));   // private bucket: mint a signed URL for this session
                setSegments(v.audio_segments || []);
                setView('generate');
                setTimeout(() => document.querySelector('[data-share-panel]')?.scrollIntoView({behavior:'smooth'}), 300);
              }}>
              📤 Share with client
            </button>
        </div>
      </div>

      <div className="ts-split-wide">
        {/* Audio player with segment tracker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="ts-card">
            <div className="ts-card-title">🎙️ Audio walkthrough</div>
            {v.audio_url
              ? <SignedAudio value={v.audio_url} />
              : <div style={{ background: 'var(--bg)', borderRadius: '10px', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>Audio not available</div>
            }
          </div>

          {/* Scene timeline */}
          {segs.length > 0 && (
            <div className="ts-card">
              <div className="ts-card-title">Scene timeline — {segs.length} segments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
                {segs.map((seg, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '10px', padding: '8px 10px', borderRadius: '8px',
                    background: 'var(--bg)', fontSize: '12px', alignItems: 'flex-start',
                  }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--purple3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--purple)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '3px' }}>
                        {seg.field_ref?.replace(/_/g, ' ')} · {seg.duration_s}s
                      </div>
                      <div style={{ color: 'var(--dark)', lineHeight: 1.5 }}>{seg.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Return details sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="ts-card">
            <div className="ts-card-title">Return details</div>
            {[
              ['File',      v.file_name],
              ['Tax year',  v.tax_year],
              ['Scenes',    segs.length > 0 ? `${segs.length} segments` : '—'],
              ['Duration',  totalSec > 0 ? `${Math.round(totalSec)} seconds` : '—'],
              ['Created',   new Date(v.created_at).toLocaleDateString()],
            ].map(([k, val]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-purple-faint)', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight: 500, color: 'var(--dark)', maxWidth: '180px', textAlign: 'right', wordBreak: 'break-word' }}>{val || '—'}</span>
              </div>
            ))}
            <Link to="/cpa/projections" className="ts-btn ts-btn-ghost ts-btn-sm" style={{ marginTop: '10px' }}>View full projection →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
