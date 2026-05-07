import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const BRACKETS_MFJ    = [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]];
const BRACKETS_SINGLE = [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]];
const STD_DED_MFJ = 30000, STD_DED_SINGLE = 15000;

function calcTax(taxable, mfj) {
  const brackets = mfj ? BRACKETS_MFJ : BRACKETS_SINGLE;
  let tax = 0, prev = 0;
  for (const [lim, rate] of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, lim) - prev) * rate;
    prev = lim;
  }
  return tax;
}

function projectYears(form, years) {
  const mfj = form.filingStatus.includes('jointly');
  const std = mfj ? STD_DED_MFJ : STD_DED_SINGLE;
  const g = +form.growthRate / 100;
  const results = [];
  let tradBal  = +form.ira;
  let rothBal  = +form.roth;
  let k401Bal  = +form.k401;
  let taxBal   = +form.taxable;
  let income   = +form.wages;

  for (let i = 0; i < years; i++) {
    const age = +form.age + i;
    // Roth conversion scenario: convert to fill 22% bracket each year
    const baseIncome = income;
    const taxable_no_convert = Math.max(0, baseIncome - std);
    const baseTax = calcTax(taxable_no_convert, mfj);

    // Baseline scenario
    const rmdAge = 73;
    const rmd = age >= rmdAge && tradBal > 0 ? tradBal / (90 - age) : 0;
    const totalIncome = baseIncome + rmd;
    const taxableInc = Math.max(0, totalIncome - std);
    const fedTax = calcTax(taxableInc, mfj);

    results.push({
      year: new Date().getFullYear() + i,
      age,
      income: Math.round(totalIncome),
      tradBal: Math.round(tradBal),
      rothBal: Math.round(rothBal),
      k401Bal: Math.round(k401Bal),
      taxBal:  Math.round(taxBal),
      total:   Math.round(tradBal + rothBal + k401Bal + taxBal),
      fedTax:  Math.round(fedTax),
      rmd:     Math.round(rmd),
    });

    // Grow balances
    tradBal = (tradBal + (+form.annualContrib * 0.7)) * (1 + g) - rmd;
    rothBal = (rothBal + (+form.annualContrib * 0.3)) * (1 + g);
    k401Bal = k401Bal * (1 + g);
    taxBal  = taxBal  * (1 + g);
    income  = income  * 1.03; // 3% wage growth
  }
  return results;
}

const EMPTY_FORM = {
  name:'', age:55, retireAge:65, filingStatus:'Married filing jointly',
  wages:150000, ira:300000, roth:50000, k401:200000, taxable:100000,
  annualContrib:20000, growthRate:7,
};

export default function RIAProjections() {
  const { user } = useAuth();
  const [view, setView]           = useState('list');
  const [projections, setProj]    = useState([]);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [activeScenario, setActiveScenario] = useState('baseline');

  const upd = k => e => setForm(f => ({...f, [k]: e.target.value}));
  const yearsTo = Math.max(1, +form.retireAge - +form.age);
  const projection = projectYears(form, Math.min(yearsTo + 15, 30));
  const atRetirement = projection[yearsTo - 1] || projection[projection.length - 1];
  const totalAssets = (+form.ira||0)+(+form.roth||0)+(+form.k401||0)+(+form.taxable||0);
  const lifetimeTax = projection.reduce((s, r) => s + r.fedTax, 0);

  useEffect(() => { if (user) fetchProj(); }, [user]);

  async function fetchProj() {
    setLoading(true);
    const { data } = await supabase
      .from('ria_projections')
      .select('*, clients(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setProj(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Client name is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        user_id: user.id,
        client_name: form.name,
        filing_status: form.filingStatus,
        current_age: +form.age,
        retirement_age: +form.retireAge,
        annual_income: +form.wages,
        ira_balance: +form.ira,
        roth_balance: +form.roth,
        k401_balance: +form.k401,
        taxable_balance: +form.taxable,
        annual_contribution: +form.annualContrib,
        growth_rate: +form.growthRate,
        projection_data: projection,
        lifetime_tax_estimate: lifetimeTax,
        notes: '',
      };
      const { data, error: e } = await supabase.from('ria_projections').insert(payload).select('id').single();
      if (e) throw e;
      await fetchProj();
      setSelected({ ...payload, id: data.id });
      setView('detail');
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this projection?')) return;
    await supabase.from('ria_projections').delete().eq('id', id);
    await fetchProj();
    if (selected?.id === id) setView('list');
  }

  const fmt = v => v != null ? `$${Math.round(v).toLocaleString()}` : '—';
  const sp = selected?.projection_data || [];
  const sAtRetire = sp[Math.max(0, (selected?.retirement_age||65) - (selected?.current_age||55) - 1)] || sp[sp.length-1] || {};

  // ── LIST ──
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">RIA Projections</div><div className="ts-page-sub">Multi-year tax planning for investment advisors</div></div>
        <button className="ts-btn ts-btn-primary" onClick={()=>{setForm(EMPTY_FORM);setError('');setView('new');}}>+ New projection</button>
      </div>
      <div className="ts-g4">
        {[
          { l:'RIA clients',     v: loading ? '—' : projections.length },
          { l:'Avg lifetime tax',v: loading ? '—' : projections.length ? fmt(projections.reduce((s,p)=>s+(p.lifetime_tax_estimate||0),0)/projections.length) : '—' },
          { l:'Scenarios run',   v: loading ? '—' : projections.length },
          { l:'Avg horizon',     v: loading ? '—' : projections.length ? `${Math.round(projections.reduce((s,p)=>s+((p.retirement_age||65)-(p.current_age||55)),0)/projections.length)} yr` : '—' },
        ].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div></div>
        ))}
      </div>
      <div className="ts-card">
        {loading ? <div style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>Loading…</div>
        : projections.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px'}}>
            <div style={{fontSize:'32px',marginBottom:'10px'}}>📈</div>
            <div style={{fontSize:'14px',color:'var(--muted)',marginBottom:'16px'}}>No RIA projections yet.</div>
            <button className="ts-btn ts-btn-primary" onClick={()=>setView('new')}>+ Build first projection</button>
          </div>
        ) : (
          <table className="ts-tbl">
            <thead><tr><th>Client</th><th>Age / horizon</th><th>Portfolio today</th><th>Lifetime tax</th><th>Actions</th></tr></thead>
            <tbody>
              {projections.map(p=>(
                <tr key={p.id}>
                  <td><div className="ts-rn">{p.clients?.name || p.client_name || '—'}</div><div className="ts-rm">{p.filing_status}</div></td>
                  <td>Age {p.current_age} → {p.retirement_age}</td>
                  <td style={{fontWeight:700}}>{fmt((p.ira_balance||0)+(p.roth_balance||0)+(p.k401_balance||0)+(p.taxable_balance||0))}</td>
                  <td style={{color:'var(--muted)'}}>{fmt(p.lifetime_tax_estimate)}</td>
                  <td style={{display:'flex',gap:'6px'}}>
                    <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>{setSelected(p);setView('detail');}}>View →</button>
                    <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
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
      <div className="ts-hrow"><div><div className="ts-page-title">New RIA Projection</div><div className="ts-page-sub">Build a multi-year tax scenario</div></div></div>
      <div className="ts-split">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Client profile</div>
            <div className="ts-frow"><label className="ts-fl">Client name <span>*</span></label><input type="text" placeholder="e.g. Jennifer Marsh" value={form.name} onChange={upd('name')} /></div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Current age</label><input type="number" value={form.age} onChange={upd('age')} /></div>
              <div className="ts-frow"><label className="ts-fl">Retirement age</label><input type="number" value={form.retireAge} onChange={upd('retireAge')} /></div>
            </div>
            <div className="ts-frow"><label className="ts-fl">Filing status</label>
              <select value={form.filingStatus} onChange={upd('filingStatus')}>
                <option>Single</option><option>Married filing jointly</option><option>Married filing separately</option><option>Head of household</option>
              </select>
            </div>
            <div className="ts-frow"><label className="ts-fl">Annual income</label><input type="number" value={form.wages} onChange={upd('wages')} /></div>
            <div className="ts-frow"><label className="ts-fl">Annual contribution</label><input type="number" value={form.annualContrib} onChange={upd('annualContrib')} /></div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Portfolio balances</div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Traditional IRA</label><input type="number" value={form.ira} onChange={upd('ira')} /></div>
              <div className="ts-frow"><label className="ts-fl">Roth IRA</label><input type="number" value={form.roth} onChange={upd('roth')} /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">401(k)</label><input type="number" value={form.k401} onChange={upd('k401')} /></div>
              <div className="ts-frow"><label className="ts-fl">Taxable accounts</label><input type="number" value={form.taxable} onChange={upd('taxable')} /></div>
            </div>
            <div className="ts-frow">
              <label className="ts-fl">Growth rate: {form.growthRate}%</label>
              <input type="range" min="3" max="12" step="0.5" value={form.growthRate} onChange={upd('growthRate')} />
            </div>
          </div>
          {error && <div style={{background:'#FEE2E2',color:'#991B1B',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
          <div style={{display:'flex',gap:'10px'}}>
            <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
            <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>{saving?'Saving…':'Build projection →'}</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>Live projection snapshot</div>
            <div className="ts-big-num">{fmt(atRetirement?.total)}</div>
            <div className="ts-big-label">projected portfolio at retirement</div>
            <div style={{marginTop:'18px'}}>
              {[
                ['Years to retirement', `${yearsTo} yrs`],
                ['Current total assets', fmt(totalAssets)],
                ['Est. lifetime tax', fmt(lifetimeTax)],
                ['RMD starts', 'Age 73'],
                ['Est. annual RMD', atRetirement ? fmt(atRetirement.rmd) : '—'],
              ].map(([k,v])=>(
                <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val">{v}</div></div>
              ))}
            </div>
          </div>
          {/* Mini bar chart preview */}
          <div className="ts-card">
            <div className="ts-card-title">Annual tax preview</div>
            <div style={{display:'flex',alignItems:'flex-end',gap:'4px',height:'80px'}}>
              {projection.slice(0,15).map(y=>{
                const maxTax = Math.max(...projection.map(p=>p.fedTax));
                const h = maxTax > 0 ? Math.round((y.fedTax/maxTax)*70) : 4;
                return (
                  <div key={y.year} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                    <div style={{width:'100%',height:`${h}px`,borderRadius:'2px 2px 0 0',background:'var(--purple)',opacity:.7}} />
                    <div style={{fontSize:'8px',color:'var(--muted)'}}>{String(y.year).slice(2)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── DETAIL ──
  const s = selected || {};
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back</button>
      <div className="ts-hrow">
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
          <div className="ts-av-lg">{(s.clients?.name||s.client_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
          <div>
            <div className="ts-page-title">{s.clients?.name || s.client_name || 'RIA Client'}</div>
            <div className="ts-page-sub">Age {s.current_age} → {s.retirement_age} · {s.filing_status} · {yearsTo} yr horizon</div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(s.id)}>Delete</button>
        </div>
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[
          {l:'Total at retirement',v: fmt(sAtRetire.total)},
          {l:'Lifetime fed. tax',  v: fmt(s.lifetime_tax_estimate)},
          {l:'Annual RMD at 73',   v: fmt(sAtRetire.rmd)},
          {l:'Growth rate',        v: `${s.growth_rate}%`},
        ].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val" style={{fontSize:'20px'}}>{k.v}</div></div>
        ))}
      </div>

      {/* Year-by-year table */}
      <div className="ts-card" style={{marginBottom:'14px'}}>
        <div className="ts-card-title">Year-by-year projection</div>
        <div style={{overflowX:'auto'}}>
          <table className="ts-tbl">
            <thead><tr><th>Year</th><th>Age</th><th>Income</th><th>Fed. Tax</th><th>Portfolio</th><th>RMD</th></tr></thead>
            <tbody>
              {sp.map((y,i)=>(
                <tr key={i} style={{background:y.age===(s.retirement_age||65)?'#EEEAFF':''}}>
                  <td style={{fontWeight:y.age===(s.retirement_age||65)?700:400}}>{y.year}</td>
                  <td>{y.age}{y.age===s.retirement_age?' 🎯':''}</td>
                  <td>{fmt(y.income)}</td>
                  <td>{fmt(y.fedTax)}</td>
                  <td style={{fontWeight:600}}>{fmt(y.total)}</td>
                  <td>{y.rmd > 0 ? fmt(y.rmd) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ts-g2">
        <div className="ts-card">
          <div className="ts-card-title">Starting portfolio</div>
          {[
            ['Traditional IRA', fmt(s.ira_balance)],
            ['Roth IRA',        fmt(s.roth_balance)],
            ['401(k)',          fmt(s.k401_balance)],
            ['Taxable',         fmt(s.taxable_balance)],
            ['Total',           fmt((s.ira_balance||0)+(s.roth_balance||0)+(s.k401_balance||0)+(s.taxable_balance||0))],
          ].map(([k,v],i,arr)=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<arr.length-1?'1px solid #F0EEF8':'none',fontWeight:i===arr.length-1?700:400,fontSize:'13px'}}>
              <span style={{color:i===arr.length-1?'var(--dark)':'var(--muted)'}}>{k}</span>
              <span style={{color:'var(--dark)'}}>{v}</span>
            </div>
          ))}
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Planning notes</div>
          <RIANoteEditor projId={s.id} initialNotes={s.notes||''} />
        </div>
      </div>
    </div>
  );
}

function RIANoteEditor({ projId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved]   = useState(false);
  async function save() {
    await supabase.from('ria_projections').update({ notes }).eq('id', projId);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  return (
    <>
      <textarea value={notes} onChange={e=>{setNotes(e.target.value);setSaved(false);}} style={{height:'100px',resize:'none'}} placeholder="Add scenario notes…" />
      <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{marginTop:'10px'}} onClick={save}>{saved?'Saved ✓':'Save notes'}</button>
    </>
  );
}
