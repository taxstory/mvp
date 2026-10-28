import { useState, useEffect, useMemo } from 'react';
import { saveDraft } from '../../utils/drafts';
import { calcFullFederalTax, calcRMD, getBracketHeadroom, getMarginalRate, taxOptionsFor } from '../../utils/taxEngine';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// projectYears: uses taxEngine.js — accurate NIIT, AMT, SE tax, all year params
function projectYears(form, years) {
  const results = [];
  const g = +form.growthRate / 100;
  let tradBal = +form.ira;
  let rothBal = +form.roth;
  let k401Bal = +form.k401;
  let taxBal  = +form.taxable;
  let income  = +form.wages;
  const birthYear = new Date().getFullYear() - (+form.age || 0);   // decides whether RMDs start at 73 or 75 (SECURE 2.0)

  for (let i = 0; i < years; i++) {
    const age    = +form.age + i;
    // IRS Uniform Lifetime Table. This used `balance / (90 - age)`, which overstated the RMD by 56% at age 73 and doubled it at 80 (and took 100% of the balance from 90).
    const rmd    = tradBal > 0 ? calcRMD(tradBal, age, birthYear) : 0;
    const totalIncome = income + rmd;

    // Use the real tax engine — gets NIIT, AMT, SS taxability, year-correct brackets
    // Feed all income types to the engine — retirement clients have
    // RMDs (ordinary income), dividends, and capital gains from taxable accounts.
    // Using only 'wages' understates tax for the typical 70+ client.
    const divIncome   = +form.dividends    || 0;
    const qualDivInc  = Math.min(divIncome, +form.qualDividends || 0);
    const ltcgIncome  = +form.ltcgIncome   || 0;
    const calYear = new Date().getFullYear() + i;     // each row is taxed in ITS year: dollar figures held at 2026 levels, provisions removed on schedule (tips/overtime/senior/auto-loan after 2028; the SALT cap in 2030)
    const { totalFederalTax: fedTax } = calcFullFederalTax({
      wages:              Math.max(0, totalIncome - rmd - divIncome - ltcgIncome),
      rmdIncome:          rmd,
      ordinaryDividends:  divIncome,
      qualifiedDividends: qualDivInc,
      ltcg:               ltcgIncome,
      filingStatus:       form.filingStatus,
      aged:               age >= 65,
    }, calYear, taxOptionsFor(calYear));

    results.push({
      year:    calYear,
      age,
      income:  Math.round(totalIncome),
      tradBal: Math.round(tradBal),
      rothBal: Math.round(rothBal),
      k401Bal: Math.round(k401Bal),
      taxBal:  Math.round(taxBal),
      total:   Math.round(tradBal + rothBal + k401Bal + taxBal),
      fedTax,
      rmd:     Math.round(rmd),
    });

    tradBal = (tradBal + (+form.annualContrib * 0.7)) * (1 + g) - rmd;
    rothBal = (rothBal + (+form.annualContrib * 0.3)) * (1 + g);
    k401Bal = k401Bal * (1 + g);
    taxBal  = taxBal  * (1 + g);
    income  = income  * (1 + (g / 2)); // income grows at half portfolio rate
  }
  return results;
}


const EMPTY_FORM = {
  name:'', age:55, retireAge:65, filingStatus:'Married filing jointly',
  wages:150000, ira:300000, roth:50000, k401:200000, taxable:100000,
  annualContrib:20000, growthRate:7,
};

import { useConfirm } from '../../components/ui/ConfirmProvider';

export default function RIAProjections() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [view, setView]           = useState('list');
  const [projections, setProj]    = useState([]);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [activeScenario, setActiveScenario] = useState('baseline');

  const upd = k => e => {
    const val = typeof e === 'object' ? e.target.value : e;
    setForm(f => {
      const next = {...f, [k]: val};
      { const { name: _omit, ...figuresOnly } = next; saveDraft('taxstory_ria_draft', figuresOnly); }   // figures only — the client's name is never kept in the browser
      return next;
    });
  };
  const yearsTo = Math.max(1, +form.retireAge - +form.age);
  const projection = useMemo(
    () => projectYears(form, Math.min(yearsTo + 15, 30)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.age, form.wages, form.filingStatus, form.growthRate,
     form.ira, form.roth, form.k401, form.taxable, form.annualContrib, yearsTo]
  );
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
      // Plans are created by a function that charges the allowance (browsers cannot insert them directly).
      const payload = {
        client_name: form.name.trim(),
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
      };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired. Please sign in again.');
      const res = await fetch('/.netlify/functions/save-ria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
      await fetchProj();
      setSelected({ ...payload, id: out.id, user_id: user.id, notes: '' });
      setView('detail');
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!(await confirm({ title: 'Delete this projection?', message: 'This cannot be undone.', confirmLabel: 'Delete projection' }))) return;
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
        <div><div className="ts-page-title">Investment Planning</div><div className="ts-page-sub">Multi-year tax planning for clients</div></div>
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
      <div className="ts-hrow"><div><div className="ts-page-title">New Investment Plan</div><div className="ts-page-sub">Build a multi-year tax scenario</div></div></div>
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
          {error && <div style={{background:'var(--color-red-light)',color:'var(--color-red-dark)',padding:'10px 14px',borderRadius:'10px',fontSize:'13px'}}>{error}</div>}
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
        {/* ── Portfolio trajectory chart ── */}
        {projection && projection.length > 1 && (() => {
          const years = projection.map(r => r.year);
          const totals = projection.map(r => r.total);
          const maxV = Math.max(...totals, 1);
          const W = 560, H = 160, PAD = 32;
          const x = i => PAD + (i / (projection.length - 1)) * (W - PAD * 2);
          const y = v => H - PAD - (v / maxV) * (H - PAD * 2);
          const polyline = projection.map((r, i) => `${x(i)},${y(r.total)}`).join(' ');
          const tradLine = projection.map((r, i) => `${x(i)},${y(r.tradBal)}`).join(' ');
          const rothLine = projection.map((r, i) => `${x(i)},${y(r.rothBal)}`).join(' ');
          const fmt = v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}K`;
          const labelYears = [0, Math.floor(projection.length/3), Math.floor(projection.length*2/3), projection.length-1];
          return (
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12,
              padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: '.06em', marginBottom: 12 }}>Portfolio trajectory</div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                {/* Grid lines */}
                {[0.25, 0.5, 0.75, 1].map(p => (
                  <line key={p} x1={PAD} y1={y(maxV * p)} x2={W - PAD} y2={y(maxV * p)}
                    stroke="var(--color-gray-bg)" strokeWidth="1" />
                ))}
                {[0.25, 0.5, 0.75, 1].map(p => (
                  <text key={`l${p}`} x={PAD - 4} y={y(maxV * p) + 4}
                    textAnchor="end" fontSize="9" fill="var(--muted-light)">{fmt(maxV * p)}</text>
                ))}
                {/* Area fill under total line */}
                <polygon
                  points={`${x(0)},${H - PAD} ${polyline} ${x(projection.length-1)},${H - PAD}`}
                  fill="var(--purple)" opacity="0.08" />
                {/* Trad / Roth lines */}
                <polyline points={tradLine} fill="none" stroke="var(--purple)" strokeWidth="1.5" opacity="0.5" />
                <polyline points={rothLine} fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.5" />
                {/* Total line */}
                <polyline points={polyline} fill="none" stroke="var(--purple)" strokeWidth="2.5" />
                {/* Year labels */}
                {labelYears.map(i => (
                  <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted-light)">
                    {years[i]}
                  </text>
                ))}
                {/* Final value callout */}
                <text x={x(projection.length-1) - 4} y={y(totals[projection.length-1]) - 8}
                  textAnchor="end" fontSize="10" fontWeight="700" fill="var(--purple)">
                  {fmt(totals[projection.length-1])}
                </text>
              </svg>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                <span><span style={{ color: 'var(--purple)', fontWeight: 700 }}>—</span> Total</span>
                <span><span style={{ color: 'var(--purple)', opacity: 0.5, fontWeight: 700 }}>—</span> Traditional IRA/401k</span>
                <span><span style={{ color: 'var(--green)', opacity: 0.5, fontWeight: 700 }}>—</span> Roth</span>
              </div>
            </div>
          );
        })()}
          {/* Mini bar chart preview */}
          <div className="ts-card">
            <div className="ts-card-title">Annual tax preview <span className="ts-card-sub">by client age</span></div>
            <div style={{display:'flex',alignItems:'flex-end',gap:'4px',height:'80px'}}>
              {projection.slice(0,15).map(y=>{
                const maxTax = Math.max(...projection.map(p=>p.fedTax));
                const h = maxTax > 0 ? Math.round((y.fedTax/maxTax)*70) : 4;
                const isRetirementYear = y.age === +form.retireAge;
                return (
                  <div key={y.year} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                    <div style={{width:'100%',height:`${h}px`,borderRadius:'2px 2px 0 0',background: isRetirementYear ? 'var(--amber)' : 'var(--purple)',opacity:.7}} />
                    {/* Show age, not a truncated year — age is what the headline metrics ("Years to retirement") reference */}
                    <div style={{fontSize:'8px',color: isRetirementYear ? 'var(--amber)' : 'var(--muted)', fontWeight: isRetirementYear ? 700 : 400}}>{y.age}</div>
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
<div style={{fontSize:'12px',color:'var(--muted)',margin:'0 0 10px',lineHeight:1.5}}>Assumptions: each year is taxed with 2026 dollar figures (no inflation indexing, no new legislation); provisions scheduled to end are removed on time (tips, overtime, senior and auto-loan deductions after 2028; the larger SALT cap in 2030). Required minimum distributions use the IRS Uniform Lifetime Table and begin at 73 or 75 depending on birth year. Growth is applied uniformly. This is a planning estimate, not a tax return.</div>
        <div style={{overflowX:'auto'}}>
          <table className="ts-tbl">
            <thead><tr><th>Year</th><th>Age</th><th>Income</th><th>Fed. Tax</th><th>Portfolio</th><th>RMD</th></tr></thead>
            <tbody>
              {sp.map((y,i)=>(
                <tr key={i} style={{background:y.age===(s.retirement_age||65)?'var(--purple3)':''}}>
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
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<arr.length-1?'1px solid var(--color-purple-faint)':'none',fontWeight:i===arr.length-1?700:400,fontSize:'13px'}}>
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
