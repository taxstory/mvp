import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const VIDEOS = [
  {client:'Sarah & Michael Chen', type:'CPA', date:'Mar 18', duration:'2:34', status:'Ready',    statusClass:'ts-p-green'},
  {client:'Robert Keller',         type:'CPA', date:'Mar 15', duration:'2:18', status:'Ready',    statusClass:'ts-p-green'},
  {client:'Jennifer Marsh',        type:'RIA', date:'Mar 12', duration:'2:51', status:'Ready',    statusClass:'ts-p-green'},
  {client:'Torres Family Trust',   type:'CPA', date:'Mar 8',  duration:'—',    status:'Generating',statusClass:'ts-p-amber'},
];

const STEPS = [
  {id:'fetch',  label:'Loading return data',   icon:'📄'},
  {id:'script', label:'Writing client script', icon:'✍️'},
  {id:'audio',  label:'Generating voiceover',  icon:'🎙️'},
  {id:'done',   label:'Video ready',           icon:'✅'},
];

export default function CPAVideoGenerator() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [view, setView]         = useState('list'); // list | new | detail
  const [selected, setSelected] = useState(null);
  const [returns, setReturns]   = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('returnId')||'');
  const [currentStep, setCurrentStep] = useState(null);
  const [error, setError]       = useState('');
  const [script, setScript]     = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [editingScript, setEditingScript] = useState(false);
  const [editedScript, setEditedScript]   = useState('');

  useEffect(()=>{
    if(!user) return;
    supabase.from('tax_returns').select('id,file_name,tax_year,status,created_at')
      .eq('user_id',user.id).in('status',['parsed','script_ready','audio_ready'])
      .order('created_at',{ascending:false})
      .then(({data})=>setReturns(data||[]));
    if(searchParams.get('returnId')) setView('new');
  },[user]);

  async function handleGenerate() {
    if(!selectedId||!user) return;
    setError(''); setScript(''); setAudioUrl(''); setCurrentStep('fetch');
    try {
      const {data:{session}} = await supabase.auth.getSession();
      const headers = {'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`};
      setCurrentStep('script');
      const sr = await fetch('/.netlify/functions/generate-script',{method:'POST',headers,body:JSON.stringify({taxReturnId:selectedId,userId:user.id})});
      if(!sr.ok){const e=await sr.json();throw new Error(e.error||'Script generation failed');}
      const {script:gs} = await sr.json();
      setScript(gs); setEditedScript(gs);
      setCurrentStep('audio');
      const ar = await fetch('/.netlify/functions/generate-audio',{method:'POST',headers,body:JSON.stringify({taxReturnId:selectedId,userId:user.id,script:gs})});
      if(!ar.ok){const e=await ar.json();throw new Error(e.error||'Audio generation failed');}
      const {audioUrl:url} = await ar.json();
      setAudioUrl(url); setCurrentStep('done');
    } catch(e) { setError(e.message); setCurrentStep(null); }
  }

  const isGenerating = ['fetch','script','audio'].includes(currentStep);

  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">Video Generator</div><div className="ts-page-sub">AI-powered client walkthrough videos</div></div>
        <button className="ts-btn ts-btn-primary" onClick={()=>setView('new')}>+ Generate video</button>
      </div>
      <div className="ts-g4">
        {[{l:'Videos generated',v:'38',d:'▲ 6 this month',dc:'ts-delta-up'},{l:'Credits remaining',v:'62',d:'of 100 this year',dc:'ts-delta-nt'},{l:'Avg duration',v:'2:34',d:'per video',dc:'ts-delta-nt'},{l:'Credits used',v:'38',d:'resets Jan 2027',dc:'ts-delta-nt'}].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div><div className={`ts-kpi-delta ${k.dc}`}>{k.d}</div></div>
        ))}
      </div>
      <div className="ts-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--dark)'}}>All videos</div>
          <input type="text" placeholder="Search…" style={{width:'180px',fontSize:'12px',padding:'7px 11px'}} />
        </div>
        <table className="ts-tbl">
          <thead><tr><th>Client</th><th>Type</th><th>Date</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {VIDEOS.map((v,i)=>(
              <tr key={i}>
                <td><div className="ts-rn">{v.client}</div></td>
                <td><span className={`ts-pill ${v.type==='RIA'?'ts-p-amber':'ts-p-dark'}`}>{v.type}</span></td>
                <td style={{color:'var(--muted)',fontSize:'12px'}}>{v.date}</td>
                <td style={{fontWeight:600}}>{v.duration}</td>
                <td><span className={`ts-pill ${v.statusClass}`}>{v.status}</span></td>
                <td><button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>{setSelected(v);setView('detail');}}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (view === 'new') return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>{setView('list');setCurrentStep(null);setScript('');setAudioUrl('');}}>← Back to videos</button>
      <div className="ts-hrow">
        <div><div className="ts-page-title">Generate Video</div><div className="ts-page-sub">Select a parsed return to create a personalized client walkthrough</div></div>
      </div>

      {!currentStep && (
        <div style={{maxWidth:'560px',display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Select a tax return</div>
            {returns.length === 0 ? (
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <div style={{fontSize:'32px',marginBottom:'8px'}}>📄</div>
                <p style={{fontSize:'13px',color:'var(--muted)',marginBottom:'12px'}}>No parsed returns yet.</p>
                <Link to="/cpa/projections" className="ts-btn ts-btn-ghost ts-btn-sm">→ Go to CPA Projections</Link>
              </div>
            ) : returns.map(r=>(
              <label key={r.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px',borderRadius:'10px',border:`1.5px solid ${selectedId===r.id?'var(--purple)':'var(--border)'}`,background:selectedId===r.id?'var(--purple3)':'white',cursor:'pointer',marginBottom:'8px'}}>
                <input type="radio" name="return" checked={selectedId===r.id} onChange={()=>setSelectedId(r.id)} style={{accentColor:'var(--purple)'}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'var(--dark)'}}>{r.file_name}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{r.tax_year&&`Tax Year ${r.tax_year} · `}{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`ts-pill ${r.status==='parsed'?'ts-p-green':'ts-p-purple'}`}>{r.status==='parsed'?'Ready':'Script done'}</span>
              </label>
            ))}
            {selectedId && <button className="ts-btn ts-btn-primary" style={{width:'100%',marginTop:'8px'}} onClick={handleGenerate} disabled={isGenerating}>🎬 Generate Video Walkthrough</button>}
          </div>
          {error && <div style={{background:'#FEE2E2',border:'1px solid #FECACA',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error} <button onClick={()=>setError('')} style={{marginLeft:'8px',textDecoration:'underline',background:'none',border:'none',cursor:'pointer',color:'#991B1B',fontSize:'12px'}}>Dismiss</button></div>}
        </div>
      )}

      {currentStep && (
        <div style={{maxWidth:'560px',display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Generating video</div>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {STEPS.map((step,i)=>{
                const stepIdx = STEPS.findIndex(s=>s.id===currentStep);
                const isDone = currentStep==='done'||i<stepIdx;
                const isActive = step.id===currentStep&&currentStep!=='done';
                return (
                  <div key={step.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px',borderRadius:'10px',background:isActive?'var(--purple3)':isDone?'#F0FDF4':'#F9F8FF',border:`1px solid ${isActive?'var(--purple)':isDone?'#BBF7D0':'var(--border)'}`}}>
                    <div style={{width:'28px',height:'28px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'12px',flexShrink:0,fontWeight:700,background:isDone?'var(--green)':isActive?'var(--purple)':'#E8E6F8'}}>
                      {isDone?'✓':isActive?<div style={{width:'14px',height:'14px',borderRadius:'50%',border:'2px solid white',borderTopColor:'transparent',animation:'spin 0.7s linear infinite'}}/>:(i+1)}
                    </div>
                    <div>
                      <div style={{fontSize:'13px',fontWeight:600,color:isActive?'var(--purple)':isDone?'#065F46':'var(--muted)'}}>{step.icon} {step.label}</div>
                      {isActive&&<div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{step.id==='script'?'Claude is writing your personalized script…':'Converting script to natural-sounding voiceover…'}</div>}
                      {isDone&&<div style={{fontSize:'11px',color:'#065F46',marginTop:'2px'}}>Complete</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {currentStep==='done'&&audioUrl&&(
            <div className="ts-card">
              <div className="ts-card-title">🎙️ Client voiceover</div>
              <audio controls style={{width:'100%'}} src={audioUrl} />
              <a href={audioUrl} download style={{fontSize:'12px',color:'var(--purple)',display:'inline-block',marginTop:'10px'}}>↓ Download audio</a>
            </div>
          )}

          {currentStep==='done'&&script&&(
            <div className="ts-card">
              <div className="ts-card-title">📝 Generated script <button onClick={()=>{setEditingScript(!editingScript);setEditedScript(script);}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:'var(--purple)',fontWeight:600}}>{editingScript?'Cancel':'Edit'}</button></div>
              {editingScript
                ? <><textarea value={editedScript} onChange={e=>setEditedScript(e.target.value)} rows={16} style={{resize:'vertical'}} /><button className="ts-btn ts-btn-primary ts-btn-sm" style={{marginTop:'10px'}} onClick={()=>{setScript(editedScript);setEditingScript(false);}}>Save edits</button></>
                : <div style={{fontSize:'12px',color:'var(--muted)',lineHeight:1.8,maxHeight:'200px',overflow:'hidden',position:'relative'}}>{script.split('\n').map((l,i)=><p key={i}>{l}</p>)}<div style={{position:'absolute',bottom:0,left:0,right:0,height:'40px',background:'linear-gradient(transparent,white)'}} /></div>
              }
            </div>
          )}

          {currentStep==='done'&&(
            <button onClick={()=>{setCurrentStep(null);setScript('');setAudioUrl('');setSelectedId('');}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--purple)',fontSize:'13px',fontWeight:600,textAlign:'left'}}>← Generate another video</button>
          )}
          {error&&<div style={{background:'#FEE2E2',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // Detail view
  const v = selected || VIDEOS[0];
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to videos</button>
      <div className="ts-hrow">
        <div><div className="ts-page-title">{v.client}</div><div className="ts-page-sub">{v.type} walkthrough · {v.date} · {v.duration}</div></div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-secondary">↓ Download</button>
          <button className="ts-btn ts-btn-ghost">Share link</button>
          <button className="ts-btn ts-btn-primary">Send to client</button>
        </div>
      </div>
      <div className="ts-split-wide">
        <div className="ts-card">
          <div className="ts-card-title">Audio walkthrough</div>
          <div style={{background:'var(--bg)',borderRadius:'10px',padding:'16px',display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
            <button style={{width:'40px',height:'40px',borderRadius:'50%',background:'var(--purple)',border:'none',color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>▶</button>
            <div style={{flex:1}}>
              <div style={{height:'4px',background:'var(--border)',borderRadius:'2px'}}>
                <div style={{width:'35%',height:'4px',background:'var(--purple)',borderRadius:'2px'}} />
              </div>
            </div>
            <span style={{fontSize:'12px',color:'var(--muted)'}}>0:54 / 2:34</span>
          </div>
          <div className="ts-card-title">Script</div>
          <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.8}}>
            <p>Hi there! I'm excited to walk you through your 2024 tax return today. Overall, it was a really solid year for you financially, and I think you'll be pleased with how things came out...</p>
            <p style={{marginTop:'10px'}}>Your total income this year was $245,000, coming mostly from your wages and business. You also had some nice investment income — capital gains taxed at a lower rate than ordinary income...</p>
            <p style={{marginTop:'10px'}}>After your standard deduction, your taxable income came to $215,000. Your effective tax rate was 22.1% — that means on average, you paid about 22 cents in federal tax for every dollar you earned...</p>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Delivery</div>
            <button className="ts-btn ts-btn-primary" style={{width:'100%',justifyContent:'center',marginBottom:'8px'}}>📧 Email to client</button>
            <button className="ts-btn ts-btn-secondary" style={{width:'100%',justifyContent:'center'}}>🔗 Copy share link</button>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Analytics</div>
            {[['Sent','Mar 18, 2026'],['Opened','Not yet'],['Played','Not yet'],['Duration watched','—']].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #F0EEF8',fontSize:'13px'}}>
                <span style={{color:'var(--muted)'}}>{k}</span><span style={{fontWeight:600,color:'var(--dark)'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
