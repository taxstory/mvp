import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// 2025 federal tax brackets
const BRACKETS = {
  mfj: [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
  single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
  hoh: [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
};
const STD_DED = { mfj: 30000, single: 15000, mfs: 15000, hoh: 22500 };

function calcTax(taxable, key) {
  let tax = 0, prev = 0;
  for (const [lim, rate] of (BRACKETS[key] || BRACKETS.single)) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, lim) - prev) * rate;
    prev = lim;
  }
  return tax;
}

function filingKey(status) {
  if (status.includes('jointly')) return 'mfj';
  if (status.includes('separately')) return 'mfs';
  if (status.includes('household')) return 'hoh';
  return 'single';
}

const EMPTY_FORM = { name:'', year:'2024', status:'Married filing jointly', wages:0, business:0, capGains:0, other:0, deduction:'standard', itemizedAmt:0, withholding:0 };

export default function CPAProjections() {
  const { user } = useAuth();
  const [view, setView]           = useState('list');
  const [returns, setReturns]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [file, setFile]           = useState(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [dragging, setDragging]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const fileRef = useRef();

  const upd = k => e => setForm(f => ({...f, [k]: e.target.value}));

  // Live 2025 projection
  const fk         = filingKey(form.status);
  const std         = STD_DED[fk] || 15000;
  const totalIncome = (+form.wages||0)+(+form.business||0)+(+form.capGains||0)+(+form.other||0);
  const deduction   = form.deduction === 'standard' ? std : (+form.itemizedAmt||0);
  const taxableInc  = Math.max(0, totalIncome - deduction);
  const estTax      = calcTax(taxableInc, fk);
  const effRate     = taxableInc > 0 ? (estTax/taxableInc*100).toFixed(1) : '0.0';
  const margBracket = (BRACKETS[fk]||BRACKETS.single).find(([lim])=>taxableInc<=lim)?.[1] || 0.37;
  const refundOwed  = (+form.withholding||0) - estTax;

  useEffect(() => { if (user) fetchReturns(); }, [user]);

  async function fetchReturns() {
    setLoading(true);
    const { data } = await supabase
      .from('tax_returns')
      .select('*, clients(name,email,type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setReturns(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Client name is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        user_id: user.id,
        file_name: `Manual — ${form.name}`,
        tax_year: +form.year,
        status: 'parsed',
        parsed_data: {
          filing_status: form.status,
          wages: +form.wages, business_income: +form.business,
          capital_gains: +form.capGains, other_income: +form.other,
          total_income: totalIncome, agi: totalIncome,
          standard_deduction: deduction, taxable_income: taxableInc,
          federal_tax: Math.round(estTax), effective_rate: +effRate,
          withholding: +form.withholding,
          refund_or_owed: Math.round(refundOwed),
          projection_year: 2025,
        },
        notes: '',
      };
      const { data, error: e } = await supabase.from('tax_returns').insert(payload).select('id').single();
      if (e) throw e;
      await fetchReturns();
      const newRec = returns.find(r => r.id === data.id) || { ...payload, id: data.id };
      setSelected({ ...payload, id: data.id });
      setView('detail');
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  }

  const handleFileDrop = useCallback(f => {
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('Only PDF files accepted.'); return; }
    if (f.size > 25*1024*1024)        { setError('File must be under 25 MB.'); return; }
    setError(''); setFile(f);
  }, []);

  async function handleUploadParse() {
    if (!file || !user) return;
    setError(''); setUploading(true);
    try {
      const { data: rec, error: ie } = await supabase.from('tax_returns').insert({ user_id: user.id, file_name: file.name, status: 'uploading' }).select('id').single();
      if (ie) throw ie;
      const path = `${user.id}/${rec.id}/${file.name}`;
      const { error: ue } = await supabase.storage.from('tax-returns').upload(path, file, { contentType: 'application/pdf' });
      if (ue) throw ue;
      setUploading(false); setParsing(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/parse-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ taxReturnId: rec.id, storagePath: path, userId: user.id }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Parse failed'); }
      await fetchReturns();
      const { data: updated } = await supabase.from('tax_returns').select('*').eq('id', rec.id).single();
      setSelected(updated);
      setView('detail');
    } catch(e) { setError(e.message); } finally { setUploading(false); setParsing(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this projection? This cannot be undone.')) return;
    await supabase.from('tax_returns').delete().eq('id', id);
    await fetchReturns();
    if (selected?.id === id) setView('list');
  }

  const fmt = v => v != null ? `$${Math.round(v).toLocaleString()}` : '—';
  const filtered = returns.filter(r => !search || r.file_name?.toLowerCase().includes(search.toLowerCase()) || r.clients?.name?.toLowerCase().includes(search.toLowerCase()));
  const pd = selected?.parsed_data || {};

  // ── LIST ──
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">CPA Projections</div><div className="ts-page-sub">Tax analysis from completed returns</div></div>
        <button className="ts-btn ts-btn-primary" onClick={() => { setForm(EMPTY_FORM); setFile(null); setError(''); setView('new'); }}>+ New projection</button>
      </div>
      <div className="ts-g3">
        {[
          { l:'Total returns', v: loading ? '—' : returns.length },
          { l:'Avg effective rate', v: loading ? '—' : returns.length ? (returns.reduce((s,r)=>s+(r.parsed_data?.effective_rate||0),0)/returns.length).toFixed(1)+'%' : '—' },
          { l:'With video', v: loading ? '—' : returns.filter(r=>r.status==='audio_ready').length },
        ].map(k => (
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div></div>
        ))}
      </div>
      <div className="ts-card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--dark)'}}>All projections</div>
          <input type="text" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:'180px',fontSize:'12px',padding:'7px 11px'}} />
        </div>
        {loading ? <div style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>Loading…</div>
        : filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px'}}>
            <div style={{fontSize:'32px',marginBottom:'10px'}}>📊</div>
            <div style={{fontSize:'14px',color:'var(--muted)',marginBottom:'16px'}}>{search ? 'No results.' : 'No projections yet. Upload a tax return PDF to get started.'}</div>
            {!search && <button className="ts-btn ts-btn-primary" onClick={()=>setView('new')}>+ Upload first return</button>}
          </div>
        ) : (
          <table className="ts-tbl">
            <thead><tr><th>Return / client</th><th>Tax year</th><th>Filing status</th><th>Federal tax</th><th>Eff. rate</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(r => {
                const p = r.parsed_data || {};
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="ts-rn">{r.clients?.name || r.file_name || 'Unnamed'}</div>
                      <div className="ts-rm">{r.file_name}</div>
                    </td>
                    <td>{r.tax_year || p.tax_year || '—'}</td>
                    <td><span className="ts-pill ts-p-gray">{p.filing_status?.split(' ').slice(-1)[0] || '—'}</span></td>
                    <td style={{fontWeight:700}}>{fmt(p.federal_tax)}</td>
                    <td>{p.effective_rate ? <span className="ts-pill ts-p-green">{p.effective_rate}%</span> : '—'}</td>
                    <td style={{display:'flex',gap:'6px'}}>
                      <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>{setSelected(r);setView('detail');}}>View →</button>
                      <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(r.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── NEW ──
  if (view === 'new') return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back</button>
      <div className="ts-hrow"><div><div className="ts-page-title">New CPA Projection</div><div className="ts-page-sub">Upload a PDF or enter data manually</div></div></div>
      <div className="ts-card" style={{marginBottom:'16px'}}>
        <div className="ts-card-title">Upload PDF <span className="ts-card-sub">PII-free · SOC 2</span></div>
        <div className={`ts-upload-zone${dragging?'':''}`}
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);handleFileDrop(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>handleFileDrop(e.target.files[0])} />
          {file
            ? <div><div style={{fontSize:'24px',marginBottom:'6px'}}>📄</div><div style={{fontWeight:600,color:'var(--dark)'}}>{file.name}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{(file.size/1024/1024).toFixed(2)} MB · PDF</div></div>
            : <div style={{color:'var(--muted)'}}><div style={{fontSize:'28px',marginBottom:'8px'}}>☁️</div>Drop your PDF here or click to browse · Max 25 MB</div>}
        </div>
        {error && <div style={{marginTop:'10px',background:'#FEE2E2',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'12px'}}>{error}</div>}
        {file && <button className="ts-btn ts-btn-primary" style={{marginTop:'12px',width:'100%'}} onClick={handleUploadParse} disabled={uploading||parsing}>
          {uploading?'⬆️ Uploading…':parsing?'⚙️ Parsing return…':'→ Upload & Parse'}
        </button>}
        <div style={{marginTop:'10px',padding:'10px 12px',background:'#E1F5EE',border:'1px solid #9FE1CB',borderRadius:'8px',fontSize:'12px',color:'#0F6E56'}}>
          🔒 Names, SSNs, and addresses are never extracted — only financial figures.
        </div>
      </div>

      <div style={{textAlign:'center',color:'var(--muted)',fontSize:'12px',fontWeight:600,margin:'8px 0'}}>— or enter manually —</div>

      <div className="ts-split">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Client & filing info</div>
            <div className="ts-frow"><label className="ts-fl">Client name <span>*</span></label><input type="text" placeholder="e.g. Sarah & Michael Chen" value={form.name} onChange={upd('name')} /></div>
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
              <div className="ts-frow"><label className="ts-fl">W-2 wages</label><input type="number" value={form.wages} onChange={upd('wages')} /></div>
              <div className="ts-frow"><label className="ts-fl">Business income</label><input type="number" value={form.business} onChange={upd('business')} /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Capital gains</label><input type="number" value={form.capGains} onChange={upd('capGains')} /></div>
              <div className="ts-frow"><label className="ts-fl">Other income</label><input type="number" value={form.other} onChange={upd('other')} /></div>
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Deductions & withholding</div>
            <div className="ts-frow"><label className="ts-fl">Deduction type</label>
              <div className="ts-seg">
                <div className={`ts-seg-btn${form.deduction==='standard'?' sel':''}`} onClick={()=>setForm(f=>({...f,deduction:'standard'}))}>Standard (${std.toLocaleString()})</div>
                <div className={`ts-seg-btn${form.deduction==='itemized'?' sel':''}`} onClick={()=>setForm(f=>({...f,deduction:'itemized'}))}>Itemized</div>
              </div>
            </div>
            {form.deduction==='itemized' && <div className="ts-frow"><label className="ts-fl">Itemized deduction total</label><input type="number" value={form.itemizedAmt} onChange={upd('itemizedAmt')} /></div>}
            <div className="ts-frow"><label className="ts-fl">Federal withholding</label><input type="number" value={form.withholding} onChange={upd('withholding')} /></div>
          </div>
          {error && <div style={{background:'#FEE2E2',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
          <div style={{display:'flex',gap:'10px'}}>
            <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
            <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Calculate & save →'}</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>Live estimate</div>
            <div className="ts-big-num">{fmt(estTax)}</div>
            <div className="ts-big-label">estimated federal tax</div>
            <div style={{marginTop:'18px'}}>
              {[
                ['Total income', fmt(totalIncome)],
                ['Deduction', `−${fmt(deduction)}`],
                ['Taxable income', fmt(taxableInc)],
                ['Effective rate', `${effRate}%`, '#B8B0FF'],
                ['Marginal bracket', `${(margBracket*100).toFixed(0)}%`],
                ['Withholding', fmt(+form.withholding)],
                [refundOwed >= 0 ? 'Estimated refund' : 'Estimated owed', fmt(Math.abs(refundOwed)), refundOwed >= 0 ? '#5DCAA5' : '#F09595'],
              ].map(([k,v,vc])=>(
                <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val" style={vc?{color:vc}:{}}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── DETAIL ──
  const r = selected || {};
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to projections</button>
      <div className="ts-hrow">
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
          <div className="ts-av-lg">{(r.clients?.name||r.file_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
          <div>
            <div className="ts-page-title">{r.clients?.name || r.file_name || 'Tax Return'}</div>
            <div className="ts-page-sub">Tax year {r.tax_year || pd.tax_year || '—'} · {pd.filing_status || '—'} · <span className="ts-pill ts-p-green">{pd.effective_rate}% eff. rate</span></div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(r.id)}>Delete</button>
          <Link to={`/cpa/video?returnId=${r.id}`} className="ts-btn ts-btn-primary">🎬 Generate video</Link>
        </div>
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[
          {l:'Total income',   v:fmt(pd.total_income)},
          {l:'Federal tax',    v:fmt(pd.federal_tax)},
          {l:'Effective rate', v:pd.effective_rate ? `${pd.effective_rate}%` : '—'},
          {l:pd.refund_or_owed>=0?'Refund':'Owed', v:fmt(Math.abs(pd.refund_or_owed))},
        ].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val" style={{fontSize:'20px'}}>{k.v}</div></div>
        ))}
      </div>

      <div className="ts-split-wide">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Income breakdown</div>
            {[
              ['W-2 Wages', fmt(pd.wages)],
              ['Business income', fmt(pd.business_income)],
              ['Capital gains', fmt(pd.capital_gains)],
              ['Other income', fmt(pd.other_income)],
              ['Total income', fmt(pd.total_income)],
              ['Deduction', `−${fmt(pd.standard_deduction)}`],
              ['Taxable income', fmt(pd.taxable_income)],
            ].filter(([,v])=>v!=='$0'&&v!=='—').map(([k,v],i,arr)=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<arr.length-1?'1px solid #F0EEF8':'none',fontWeight:i>=4?600:400}}>
                <span style={{fontSize:'13px',color:i>=4?'var(--dark)':'var(--muted)'}}>{k}</span>
                <span style={{fontSize:'13px',color:'var(--dark)'}}>{v}</span>
              </div>
            ))}
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Filing details</div>
            {[
              ['Filing status', pd.filing_status],
              ['Tax year', r.tax_year || pd.tax_year],
              ['Withholding', fmt(pd.withholding)],
              ['Refund / Owed', pd.refund_or_owed >= 0 ? `${fmt(pd.refund_or_owed)} refund` : `${fmt(Math.abs(pd.refund_or_owed))} owed`],
              ['Parsed on', r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'],
            ].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #F0EEF8',fontSize:'13px'}}>
                <span style={{color:'var(--muted)'}}>{k}</span><span style={{fontWeight:500,color:'var(--dark)'}}>{v||'—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>2025 projection (estimated)</div>
            {(() => {
              const fk2025 = filingKey(pd.filing_status || '');
              const std2025 = STD_DED[fk2025] || 15000;
              const ti = Math.max(0, (pd.total_income||0) - std2025);
              const t2025 = calcTax(ti, fk2025);
              const diff = t2025 - (pd.federal_tax||0);
              return (
                <>
                  <div className="ts-big-num">{fmt(t2025)}</div>
                  <div className="ts-big-label">estimated federal tax</div>
                  <div style={{marginTop:'18px'}}>
                    {[
                      ['vs prior year', diff >= 0 ? `+${fmt(diff)}` : `−${fmt(Math.abs(diff))}`, diff >= 0 ? '#F09595' : '#5DCAA5'],
                      ['2025 std deduction', fmt(std2025)],
                      ['Effective rate', ti > 0 ? `${(t2025/ti*100).toFixed(1)}%` : '—'],
                    ].map(([k,v,vc])=>(
                      <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val" style={vc?{color:vc}:{}}>{v}</div></div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Notes</div>
            <NoteEditor returnId={r.id} initialNotes={r.notes||''} />
          </div>
          <div style={{background:'var(--purple3)',border:'1px solid #AFA9EC',borderRadius:'14px',padding:'18px'}}>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--dark)',marginBottom:'6px'}}>🎬 Generate client video</div>
            <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'12px'}}>Turn this projection into a personalized 2–3 min walkthrough.</div>
            <Link to={`/cpa/video?returnId=${r.id}`} className="ts-btn ts-btn-primary" style={{width:'100%',justifyContent:'center',textDecoration:'none',display:'flex'}}>Generate video →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteEditor({ returnId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved]   = useState(false);
  async function save() {
    await supabase.from('tax_returns').update({ notes }).eq('id', returnId);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  return (
    <>
      <textarea value={notes} onChange={e=>{setNotes(e.target.value);setSaved(false);}} style={{height:'90px',resize:'none'}} placeholder="Add notes about this return…" />
      <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{marginTop:'10px'}} onClick={save}>{saved?'Saved ✓':'Save notes'}</button>
    </>
  );
}
