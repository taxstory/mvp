import { useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const CLIENTS = [
  {name:'Sarah & Michael Chen', email:'chen@example.com', year:'2024', status:'Married joint', tax:'$54,320', rate:'22.1%', rateClass:'ts-p-green'},
  {name:'Robert Keller',         email:'rkeller@example.com', year:'2024', status:'Single', tax:'$31,080', rate:'19.8%', rateClass:'ts-p-green'},
  {name:'Torres Family Trust',   email:'torres@example.com',  year:'2024', status:'HoH',    tax:'$28,450', rate:'18.3%', rateClass:'ts-p-green'},
  {name:'Patricia Okonkwo',      email:'pokonkwo@example.com',year:'2024', status:'Single', tax:'$19,760', rate:'15.6%', rateClass:'ts-p-green'},
];

const STATUS_PILL = {single:'ts-p-gray','Married joint':'ts-p-dark',HoH:'ts-p-gray'};

export default function CPAProjections() {
  const [view, setView]       = useState('list'); // list | new | detail
  const [selected, setSelected] = useState(null);
  const [form, setForm]       = useState({ name:'', year:'2024', status:'Married filing jointly', wages:142000, business:54000, capGains:29000, other:20000, deduction:'standard' });
  const [dragging, setDragging] = useState(false);
  const [file, setFile]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [error, setError]     = useState('');
  const fileRef = useRef();
  const { user } = useAuth();

  const upd = k => e => setForm(f => ({...f, [k]: e.target.value}));

  // Live projection
  const totalIncome  = (+form.wages||0) + (+form.business||0) + (+form.capGains||0) + (+form.other||0);
  const stdDed       = form.status.includes('Married') && !form.status.includes('sep') ? 30000 : 15000;
  const taxableInc   = Math.max(0, totalIncome - stdDed);
  const brackets     = form.status.includes('Married') && !form.status.includes('sep')
    ? [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]]
    : [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]];
  let tax=0,prev=0;
  for(const [lim,rate] of brackets){if(taxableInc<=prev)break;tax+=(Math.min(taxableInc,lim)-prev)*rate;prev=lim;}
  const effRate = taxableInc>0 ? (tax/taxableInc*100).toFixed(1) : '0.0';
  const marginal = brackets.find(([lim])=>taxableInc<=lim)?.[1] || 0.37;
  const bracketRoom = brackets.find(([lim])=>taxableInc<=lim)?.[0] - taxableInc;

  // Upload
  const handleFileDrop = useCallback(async f => {
    if(!f) return;
    setError('');
    if(f.type !== 'application/pdf') { setError('Only PDF files accepted.'); return; }
    if(f.size > 25*1024*1024) { setError('File must be under 25 MB.'); return; }
    setFile(f);
  }, []);

  async function handleUploadParse() {
    if(!file||!user) return;
    setError(''); setUploading(true);
    try {
      const {data:rec,error:ie} = await supabase.from('tax_returns').insert({user_id:user.id,file_name:file.name,status:'uploading'}).select('id').single();
      if(ie) throw new Error(ie.message);
      const path = `${user.id}/${rec.id}/${file.name}`;
      const {error:ue} = await supabase.storage.from('tax-returns').upload(path,file,{contentType:'application/pdf',upsert:false});
      if(ue) throw new Error(ue.message);
      setUploading(false); setParsing(true);
      const {data:{session}} = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/parse-return',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({taxReturnId:rec.id,storagePath:path,userId:user.id})});
      if(!res.ok) { const e=await res.json(); throw new Error(e.error||'Parse failed'); }
      const {data:updated} = await supabase.from('tax_returns').select('parsed_data').eq('id',rec.id).single();
      setParsedData(updated.parsed_data);
      setView('detail');
    } catch(e) { setError(e.message); } finally { setUploading(false); setParsing(false); }
  }

  const fmt = v => typeof v==='number' ? `$${v.toLocaleString()}` : v||'—';

  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">CPA Projections</div><div className="ts-page-sub">Tax analysis from completed returns</div></div>
        <button className="ts-btn ts-btn-primary" onClick={() => setView('new')}>+ New projection</button>
      </div>
      <div className="ts-g3">
        {[{l:'Total clients',v:'14'},{l:'Avg effective rate',v:'21.4%',d:'▼ 0.8% vs prior year',dc:'ts-delta-dn'},{l:'Avg federal tax',v:'$38.2k'}].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div>{k.d&&<div className={`ts-kpi-delta ${k.dc}`}>{k.d}</div>}</div>
        ))}
      </div>
      <div className="ts-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--dark)'}}>All projections</div>
          <div style={{display:'flex',gap:'8px'}}>
            <input type="text" placeholder="Search clients…" style={{width:'180px',fontSize:'12px',padding:'7px 11px'}} />
            <button className="ts-btn ts-btn-secondary ts-btn-sm">Export all</button>
          </div>
        </div>
        <table className="ts-tbl">
          <thead><tr><th>Client</th><th>Tax year</th><th>Filing status</th><th>Federal tax</th><th>Eff. rate</th><th>Actions</th></tr></thead>
          <tbody>
            {CLIENTS.map((c,i)=>(
              <tr key={i}>
                <td><div className="ts-rn">{c.name}</div><div className="ts-rm">{c.email}</div></td>
                <td>{c.year}</td>
                <td><span className={`ts-pill ${STATUS_PILL[c.status]||'ts-p-gray'}`}>{c.status}</span></td>
                <td style={{fontWeight:700}}>{c.tax}</td>
                <td><span className={`ts-pill ${c.rateClass}`}>{c.rate}</span></td>
                <td><button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>{setSelected(c);setView('detail');}}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (view === 'new') return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to projections</button>
      <div className="ts-hrow">
        <div><div className="ts-page-title">New CPA Projection</div><div className="ts-page-sub">Upload a tax return PDF or enter data manually</div></div>
      </div>

      {/* Upload section */}
      <div className="ts-card" style={{marginBottom:'16px'}}>
        <div className="ts-card-title">Upload tax return PDF <span className="ts-card-sub">PII-free parsing · SOC 2</span></div>
        <div className={`ts-upload-zone${dragging?' border-purple bg-purple3':''}`}
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);handleFileDrop(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>handleFileDrop(e.target.files[0])} />
          {file
            ? <div><div style={{fontSize:'16px',marginBottom:'6px'}}>📄</div><div style={{fontWeight:600,color:'var(--dark)'}}>{file.name}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{(file.size/1024/1024).toFixed(2)} MB</div></div>
            : <div style={{fontSize:'13px',color:'var(--muted)'}}><div style={{fontSize:'28px',marginBottom:'8px'}}>☁️</div>Drop your PDF here or click to browse · Max 25 MB</div>
          }
        </div>
        {error && <div style={{marginTop:'10px',background:'#FEE2E2',border:'1px solid #FECACA',color:'#991B1B',fontSize:'12px',padding:'8px 12px',borderRadius:'8px'}}>{error}</div>}
        {file && (
          <button className="ts-btn ts-btn-primary" style={{marginTop:'12px',width:'100%'}} onClick={handleUploadParse} disabled={uploading||parsing}>
            {uploading ? '⬆️ Uploading…' : parsing ? '⚙️ Parsing…' : '→ Upload & Parse Return'}
          </button>
        )}
        <div style={{marginTop:'10px',padding:'10px 12px',background:'#E1F5EE',border:'1px solid #9FE1CB',borderRadius:'8px',fontSize:'12px',color:'#0F6E56'}}>
          🔒 Names, SSNs, and addresses are never extracted — only financial figures.
        </div>
      </div>

      <div style={{textAlign:'center',color:'var(--muted)',fontSize:'12px',fontWeight:600,margin:'8px 0'}}>— or enter manually —</div>

      <div className="ts-split">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Client information</div>
            <div className="ts-frow"><label className="ts-fl">Client name</label><input type="text" placeholder="e.g. Sarah & Michael Chen" value={form.name} onChange={upd('name')} /></div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Tax year</label><input type="number" value={form.year} onChange={upd('year')} /></div>
              <div className="ts-frow"><label className="ts-fl">Filing status</label>
                <select value={form.status} onChange={upd('status')}>
                  <option>Single</option><option>Married filing jointly</option><option>Married filing separately</option><option>Head of household</option>
                </select>
              </div>
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Income</div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">W-2 wages</label><input type="number" value={form.wages} onChange={upd('wages')} /><div className="ts-hint">Total Box 1 from all W-2s</div></div>
              <div className="ts-frow"><label className="ts-fl">Business income <span>(Sch. C)</span></label><input type="number" value={form.business} onChange={upd('business')} /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Capital gains</label><input type="number" value={form.capGains} onChange={upd('capGains')} /></div>
              <div className="ts-frow"><label className="ts-fl">Other income</label><input type="number" value={form.other} onChange={upd('other')} /></div>
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Deductions</div>
            <div className="ts-frow"><label className="ts-fl">Deduction type</label>
              <div className="ts-seg">
                <div className={`ts-seg-btn${form.deduction==='standard'?' sel':''}`} onClick={()=>setForm(f=>({...f,deduction:'standard'}))}>Standard (${stdDed.toLocaleString()})</div>
                <div className={`ts-seg-btn${form.deduction==='itemized'?' sel':''}`} onClick={()=>setForm(f=>({...f,deduction:'itemized'}))}>Itemized</div>
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:'10px'}}>
            <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
            <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={()=>setView('detail')}>Calculate & save →</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>Live estimate</div>
            <div className="ts-big-num">${Math.round(tax).toLocaleString()}</div>
            <div className="ts-big-label">estimated federal tax</div>
            <div style={{marginTop:'18px'}}>
              {[
                ['Total income', `$${totalIncome.toLocaleString()}`],
                ['Standard deduction', `−$${stdDed.toLocaleString()}`],
                ['Taxable income', `$${Math.round(taxableInc).toLocaleString()}`],
                ['Effective rate', `${effRate}%`, '#B8B0FF'],
                ['Marginal bracket', `${(marginal*100).toFixed(0)}%`],
                ['Room to bracket ceiling', `$${Math.round(Math.max(0,bracketRoom||0)).toLocaleString()}`, '#FFD60A'],
              ].map(([k,v,vc])=>(
                <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val" style={vc?{color:vc}:{}}>{v}</div></div>
              ))}
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Tax-saving opportunities</div>
            {[
              {icon:'💡',bg:'var(--purple3)',title:'Maximize 401(k) contribution',sub:'Could save up to $4,340 in federal tax'},
              {icon:'💡',bg:'var(--purple3)',title:'HSA contribution opportunity',sub:'$7,750 family limit — could save $1,860'},
              {icon:'⚠️',bg:'#FEF3C7',title:'IRMAA surcharge risk',sub:'Income may trigger Medicare premium increase'},
            ].map((t,i)=>(
              <div key={i} style={{display:'flex',gap:'9px',padding:'9px 0',borderBottom:i<2?'1px solid #F0EEF8':'none'}}>
                <div style={{width:'26px',height:'26px',borderRadius:'50%',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',flexShrink:0}}>{t.icon}</div>
                <div><div style={{fontSize:'12px',fontWeight:600,color:'var(--dark)'}}>{t.title}</div><div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{t.sub}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Detail view
  const c = selected || CLIENTS[0];
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to projections</button>
      <div className="ts-hrow">
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
          <div className="ts-av-lg">{c.name?.split(' ').map(w=>w[0]).join('').slice(0,2)||'SC'}</div>
          <div>
            <div className="ts-page-title">{c.name||'Sarah & Michael Chen'}</div>
            <div className="ts-page-sub">Tax year {c.year||'2024'} · {c.status||'Married filing jointly'} · <span className={`ts-pill ${c.rateClass||'ts-p-green'}`}>{c.rate||'22.1%'} eff. rate</span></div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-secondary">Export PDF</button>
          <Link to="/cpa/video" className="ts-btn ts-btn-primary">🎬 Generate video</Link>
        </div>
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[
          {l:'Total income',   v:'$245,000'},
          {l:'Federal tax',    v:c.tax||'$54,320'},
          {l:'Effective rate', v:c.rate||'22.1%'},
          {l:'Refund / Owed',  v:'$3,060 refund'},
        ].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val" style={{fontSize:'20px'}}>{k.v}</div></div>
        ))}
      </div>

      <div className="ts-split-wide">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Income breakdown</div>
            {[['W-2 Wages','$142,000'],['Business income','$54,000'],['Capital gains','$29,000'],['Other income','$20,000'],['Total income','$245,000'],['Standard deduction','−$30,000'],['Taxable income','$215,000']].map(([k,v],i)=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<6?'1px solid #F0EEF8':'none',fontWeight:i>=4?600:400}}>
                <span style={{fontSize:'13px',color:i>=4?'var(--dark)':'var(--muted)'}}>{k}</span>
                <span style={{fontSize:'13px',color:'var(--dark)'}}>{v}</span>
              </div>
            ))}
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Tax computation</div>
            {[['10% bracket','$2,385'],['12% bracket','$8,778'],['22% bracket','$24,739'],['24% bracket','$18,418'],['Total tax','$54,320'],['Withholding','$57,380'],['Refund','$3,060']].map(([k,v],i)=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<6?'1px solid #F0EEF8':'none',fontWeight:i>=4?700:400}}>
                <span style={{fontSize:'13px',color:i>=4?'var(--dark)':'var(--muted)'}}>{k}</span>
                <span style={{fontSize:'13px',color:i===6?'var(--green)':'var(--dark)'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>2025 projection</div>
            <div className="ts-big-num">$53,100</div>
            <div className="ts-big-label">estimated federal tax</div>
            <div style={{marginTop:'18px'}}>
              {[['vs 2024','−$1,220','#5DCAA5'],['Effective rate','21.6%'],['Marginal bracket','24%'],['Projected refund','$4,280','#5DCAA5']].map(([k,v,vc])=>(
                <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val" style={vc?{color:vc}:{}}>{v}</div></div>
              ))}
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Planning notes</div>
            <textarea style={{height:'100px',resize:'none'}} placeholder="Add notes about this client's tax situation…" />
            <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{marginTop:'10px'}}>Save notes</button>
          </div>
          <div style={{background:'var(--purple3)',border:'1px solid #AFA9EC',borderRadius:'14px',padding:'18px'}}>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--dark)',marginBottom:'6px'}}>🎬 Generate client video</div>
            <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'12px'}}>Turn this projection into a personalized 2–3 min walkthrough your client can watch on their phone.</div>
            <Link to="/cpa/video" className="ts-btn ts-btn-primary" style={{width:'100%',justifyContent:'center',textDecoration:'none',display:'flex'}}>Generate video →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
