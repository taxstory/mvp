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
  const [view, setView]           = useState('list');
  const [returns, setReturns]     = useState([]);  // parsed returns available
  const [videos, setVideos]       = useState([]);  // completed video records
  const [selectedId, setSelectedId] = useState(searchParams.get('returnId') || '');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [error, setError]         = useState('');
  const [script, setScript]       = useState('');
  const [audioUrl, setAudioUrl]   = useState('');
  const [editingScript, setEditingScript] = useState(false);
  const [editedScript, setEditedScript]   = useState('');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchAll();
    if (searchParams.get('returnId')) setView('new');
  }, [user]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: parsedReturns }, { data: audioReady }] = await Promise.all([
      supabase.from('tax_returns').select('id,file_name,tax_year,status,created_at,clients(name)')
        .eq('user_id', user.id)
        .in('status', ['parsed','script_ready','audio_ready'])
        .order('created_at', { ascending: false }),
      supabase.from('tax_returns').select('id,file_name,tax_year,status,created_at,audio_url,clients(name)')
        .eq('user_id', user.id).eq('status','audio_ready')
        .order('created_at', { ascending: false }),
    ]);
    setReturns(parsedReturns || []);
    setVideos(audioReady || []);
    setLoading(false);
  }

  const isGenerating = ['fetch','script','audio'].includes(currentStep);

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

  const credits = creditsRemaining ?? 0;
  const creditPct = creditsTotal > 0 ? Math.round((credits/creditsTotal)*100) : 0;

  // ── LIST ──
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">Video Generator</div><div className="ts-page-sub">AI-powered client walkthrough videos</div></div>
        <button className="ts-btn ts-btn-primary" onClick={()=>{setCurrentStep(null);setScript('');setAudioUrl('');setSelectedId('');setView('new');}}>+ Generate video</button>
      </div>
      <div className="ts-g4">
        {[
          { l:'Videos generated', v: loading ? '—' : videos.length },
          { l:'Credits remaining',v: loading ? '—' : credits, sub:`of ${creditsTotal || 100} this year` },
          { l:'Available returns', v: loading ? '—' : returns.length },
          { l:'Credits used',     v: loading ? '—' : (creditsTotal||100) - credits },
        ].map(k=>(
          <div className="ts-kpi" key={k.l}>
            <div className="ts-kpi-label">{k.l}</div>
            <div className="ts-kpi-val">{k.v}</div>
            {k.sub&&<div className="ts-kpi-delta ts-delta-nt">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Credit bar */}
      <div className="ts-hero-banner" style={{marginBottom:'16px'}}>
        <span style={{fontSize:'20px'}}>🎬</span>
        <div style={{flex:1}}>
          <div style={{fontSize:'12px',fontWeight:700,color:'white',marginBottom:'4px'}}>Video credits — {credits} of {creditsTotal||100} remaining</div>
          <div className="ts-progress-track"><div className="ts-progress-fill" style={{width:`${creditPct}%`}} /></div>
        </div>
        <Link to="/billing" className="ts-btn ts-btn-secondary ts-btn-sm">Buy credits</Link>
      </div>

      <div className="ts-card">
        <div style={{fontSize:'13px',fontWeight:700,color:'var(--dark)',marginBottom:'14px'}}>Generated videos</div>
        {loading ? <div style={{padding:'30px',textAlign:'center',color:'var(--muted)'}}>Loading…</div>
        : videos.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px'}}>
            <div style={{fontSize:'32px',marginBottom:'10px'}}>🎬</div>
            <div style={{fontSize:'14px',color:'var(--muted)',marginBottom:'16px'}}>No videos yet. Upload a tax return first.</div>
            {returns.length > 0
              ? <button className="ts-btn ts-btn-primary" onClick={()=>setView('new')}>Generate first video</button>
              : <Link to="/cpa/projections" className="ts-btn ts-btn-ghost">→ Upload a tax return</Link>}
          </div>
        ) : (
          <table className="ts-tbl">
            <thead><tr><th>Client / return</th><th>Tax year</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {videos.map(v=>(
                <tr key={v.id}>
                  <td>
                    <div className="ts-rn">{v.clients?.name || v.file_name || '—'}</div>
                    <div className="ts-rm">{v.file_name}</div>
                  </td>
                  <td>{v.tax_year || '—'}</td>
                  <td><span className="ts-pill ts-p-green">Ready</span></td>
                  <td style={{fontSize:'12px',color:'var(--muted)'}}>{new Date(v.created_at).toLocaleDateString()}</td>
                  <td style={{display:'flex',gap:'6px'}}>
                    <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>{setSelectedVideo(v);setView('detail');}}>View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── GENERATE ──
  if (view === 'new') return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>{setView('list');setCurrentStep(null);setScript('');setAudioUrl('');}}>← Back to videos</button>
      <div className="ts-hrow"><div><div className="ts-page-title">Generate Video</div><div className="ts-page-sub">Select a parsed return to create a personalized client walkthrough</div></div></div>

      {!currentStep && (
        <div style={{maxWidth:'560px',display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Select a return ({credits} credits remaining)</div>
            {credits === 0 && (
              <div style={{background:'#FEF3C7',border:'1px solid #FDE68A',color:'#92400E',padding:'10px 14px',borderRadius:'10px',fontSize:'13px',marginBottom:'14px'}}>
                ⚠️ No video credits remaining. <Link to="/billing" style={{color:'#92400E',fontWeight:700}}>Buy more →</Link>
              </div>
            )}
            {returns.length === 0 ? (
              <div style={{textAlign:'center',padding:'20px'}}>
                <p style={{fontSize:'13px',color:'var(--muted)',marginBottom:'12px'}}>No parsed returns available yet.</p>
                <Link to="/cpa/projections" className="ts-btn ts-btn-ghost ts-btn-sm">→ Upload a tax return</Link>
              </div>
            ) : returns.map(r => (
              <label key={r.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px',borderRadius:'10px',border:`1.5px solid ${selectedId===r.id?'var(--purple)':'var(--border)'}`,background:selectedId===r.id?'var(--purple3)':'white',cursor:'pointer',marginBottom:'8px'}}>
                <input type="radio" name="return" checked={selectedId===r.id} onChange={()=>setSelectedId(r.id)} style={{accentColor:'var(--purple)'}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'var(--dark)'}}>{r.clients?.name || r.file_name}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'1px'}}>{r.tax_year ? `Tax Year ${r.tax_year} · ` : ''}{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`ts-pill ${r.status==='parsed'?'ts-p-green':'ts-p-purple'}`}>{r.status==='parsed'?'Ready':'Script done'}</span>
              </label>
            ))}
            {selectedId && credits > 0 && (
              <button className="ts-btn ts-btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={handleGenerate} disabled={isGenerating}>
                🎬 Generate Video (1 credit)
              </button>
            )}
          </div>
          {error && <div style={{background:'#FEE2E2',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
        </div>
      )}

      {currentStep && (
        <div style={{maxWidth:'560px',display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Generating your video</div>
            {STEPS.map((step, i) => {
              const stepIdx = STEPS.findIndex(s => s.id === currentStep);
              const isDone  = currentStep === 'done' || i < stepIdx;
              const isActive = step.id === currentStep && currentStep !== 'done';
              return (
                <div key={step.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px',borderRadius:'10px',marginBottom:'8px',
                  background: isActive ? 'var(--purple3)' : isDone ? '#F0FDF4' : '#F9F8FF',
                  border: `1px solid ${isActive ? 'var(--purple)' : isDone ? '#BBF7D0' : 'var(--border)'}`,
                }}>
                  <div style={{width:'28px',height:'28px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'12px',flexShrink:0,fontWeight:700,
                    background: isDone ? 'var(--green)' : isActive ? 'var(--purple)' : '#E8E6F8',
                    color: isDone || isActive ? 'white' : 'var(--muted)',
                  }}>
                    {isDone ? '✓' : isActive
                      ? <div style={{width:'14px',height:'14px',borderRadius:'50%',border:'2px solid white',borderTopColor:'transparent',animation:'spin .7s linear infinite'}} />
                      : (i+1)}
                  </div>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:600,color:isActive?'var(--purple)':isDone?'#065F46':'var(--muted)'}}>{step.icon} {step.label}</div>
                    {isActive && <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'1px'}}>
                      {step.id==='script'?'Claude is writing a personalized script for your client…':'Converting the script to a natural-sounding voiceover…'}
                    </div>}
                    {isDone && <div style={{fontSize:'11px',color:'#065F46'}}>Complete</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {currentStep === 'done' && audioUrl && (
            <div className="ts-card">
              <div className="ts-card-title">🎙️ Client voiceover</div>
              <audio controls style={{width:'100%'}} src={audioUrl} />
              <a href={audioUrl} download style={{fontSize:'12px',color:'var(--purple)',display:'inline-block',marginTop:'10px',fontWeight:600}}>↓ Download audio</a>
            </div>
          )}

          {currentStep === 'done' && script && (
            <div className="ts-card">
              <div className="ts-card-title">📝 Generated script
                <button onClick={()=>{setEditingScript(!editingScript);setEditedScript(script);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:'var(--purple)',fontWeight:600}}>{editingScript?'Cancel':'Edit'}</button>
              </div>
              {editingScript
                ? <><textarea value={editedScript} onChange={e=>setEditedScript(e.target.value)} rows={16} style={{resize:'vertical'}} />
                  <button className="ts-btn ts-btn-primary ts-btn-sm" style={{marginTop:'10px'}} onClick={()=>{setScript(editedScript);setEditingScript(false);}}>Save edits</button></>
                : <div style={{fontSize:'12px',color:'var(--muted)',lineHeight:1.8,maxHeight:'200px',overflow:'hidden',position:'relative'}}>
                    {script.split('\n').map((l,i)=><p key={i}>{l}</p>)}
                    <div style={{position:'absolute',bottom:0,left:0,right:0,height:'40px',background:'linear-gradient(transparent,white)'}} />
                  </div>
              }
            </div>
          )}

          {currentStep==='done' && (
            <button onClick={()=>{setCurrentStep(null);setScript('');setAudioUrl('');setSelectedId('');}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--purple)',fontSize:'13px',fontWeight:600,textAlign:'left'}}>← Generate another</button>
          )}
          {error && <div style={{background:'#FEE2E2',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </div>
  );

  // ── DETAIL ──
  const v = selectedVideo || {};
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to videos</button>
      <div className="ts-hrow">
        <div>
          <div className="ts-page-title">{v.clients?.name || v.file_name || 'Video walkthrough'}</div>
          <div className="ts-page-sub">Tax year {v.tax_year || '—'} · {new Date(v.created_at).toLocaleDateString()}</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {v.audio_url && <a href={v.audio_url} download className="ts-btn ts-btn-secondary">↓ Download</a>}
          <button className="ts-btn ts-btn-primary">📧 Send to client</button>
        </div>
      </div>
      <div className="ts-split-wide">
        <div className="ts-card">
          <div className="ts-card-title">Audio walkthrough</div>
          {v.audio_url
            ? <audio controls style={{width:'100%'}} src={v.audio_url} />
            : <div style={{background:'var(--bg)',borderRadius:'10px',padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Audio file not available</div>}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Return summary</div>
            {[
              ['File', v.file_name],
              ['Tax year', v.tax_year],
              ['Status', 'Ready'],
              ['Created', new Date(v.created_at).toLocaleDateString()],
            ].map(([k,val])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #F0EEF8',fontSize:'13px'}}>
                <span style={{color:'var(--muted)'}}>{k}</span>
                <span style={{fontWeight:500,color:'var(--dark)'}}>{val||'—'}</span>
              </div>
            ))}
            <Link to={`/cpa/projections`} className="ts-btn ts-btn-ghost ts-btn-sm" style={{marginTop:'10px'}}>View full projection →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
