import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const CLIENTS = [
  {name:'Jennifer Marsh',    email:'jmarsh@example.com',  scenarios:3, horizon:'10 yr', saved:'$28,400', status:'Active'},
  {name:'David & Sue Kim',   email:'dkim@example.com',    scenarios:2, horizon:'7 yr',  saved:'$14,200', status:'Active'},
  {name:'Marcus Washington', email:'mwash@example.com',   scenarios:1, horizon:'15 yr', saved:'$41,800', status:'Active'},
  {name:'Carol Reyes',       email:'creyes@example.com',  scenarios:2, horizon:'5 yr',  saved:'$9,600',  status:'Active'},
];

export default function RIAProjections() {
  const [view, setView]         = useState('list');
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeScenario, setActiveScenario] = useState('baseline');
  const [form, setForm] = useState({
    name:'', age:58, retireAge:65, filingStatus:'Married filing jointly',
    wages:180000, ira:420000, roth:85000, taxable:310000, k401:185000,
    annualContrib:23000, growthRate:7,
  });
  const upd = k => e => setForm(f=>({...f,[k]:e.target.value}));

  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">RIA Projections</div><div className="ts-page-sub">Multi-year tax planning for investment advisors</div></div>
        <button className="ts-btn ts-btn-primary" onClick={()=>setView('new')}>+ New projection</button>
      </div>
      <div className="ts-g4">
        {[{l:'RIA clients',v:'8'},{l:'Avg tax saved',v:'$23.5k',d:'per client',dc:'ts-delta-up'},{l:'Scenarios modeled',v:'18'},{l:'Avg horizon',v:'9.2 yr'}].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val">{k.v}</div>{k.d&&<div className={`ts-kpi-delta ${k.dc}`}>{k.d}</div>}</div>
        ))}
      </div>
      <div className="ts-card">
        <table className="ts-tbl">
          <thead><tr><th>Client</th><th>Scenarios</th><th>Horizon</th><th>Est. tax saved</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {CLIENTS.map((c,i)=>(
              <tr key={i}>
                <td><div className="ts-rn">{c.name}</div><div className="ts-rm">{c.email}</div></td>
                <td>{c.scenarios} scenarios</td>
                <td>{c.horizon}</td>
                <td style={{fontWeight:700,color:'var(--green)'}}>{c.saved}</td>
                <td><span className="ts-pill ts-p-green">{c.status}</span></td>
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
      <div className="ts-hrow"><div><div className="ts-page-title">New RIA Projection</div><div className="ts-page-sub">Build a multi-year tax scenario model</div></div></div>
      <div className="ts-split">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Client profile</div>
            <div className="ts-frow"><label className="ts-fl">Client name</label><input type="text" placeholder="e.g. Jennifer Marsh" value={form.name} onChange={upd('name')} /></div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Current age</label><input type="number" value={form.age} onChange={upd('age')} /></div>
              <div className="ts-frow"><label className="ts-fl">Retirement age</label><input type="number" value={form.retireAge} onChange={upd('retireAge')} /></div>
            </div>
            <div className="ts-frow"><label className="ts-fl">Filing status</label>
              <select value={form.filingStatus} onChange={upd('filingStatus')}>
                <option>Single</option><option>Married filing jointly</option><option>Married filing separately</option><option>Head of household</option>
              </select>
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Current portfolio</div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Annual income</label><input type="number" value={form.wages} onChange={upd('wages')} /></div>
              <div className="ts-frow"><label className="ts-fl">Annual contribution</label><input type="number" value={form.annualContrib} onChange={upd('annualContrib')} /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Traditional IRA</label><input type="number" value={form.ira} onChange={upd('ira')} /></div>
              <div className="ts-frow"><label className="ts-fl">Roth IRA</label><input type="number" value={form.roth} onChange={upd('roth')} /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">401(k) balance</label><input type="number" value={form.k401} onChange={upd('k401')} /></div>
              <div className="ts-frow"><label className="ts-fl">Taxable accounts</label><input type="number" value={form.taxable} onChange={upd('taxable')} /></div>
            </div>
            <div className="ts-frow">
              <label className="ts-fl">Growth rate assumption: {form.growthRate}%</label>
              <input type="range" min="3" max="12" step="0.5" value={form.growthRate} onChange={upd('growthRate')} />
            </div>
          </div>
          <div style={{display:'flex',gap:'10px'}}>
            <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
            <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={()=>setView('detail')}>Build projection →</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>Projection snapshot</div>
            <div className="ts-big-num">$1.24M</div>
            <div className="ts-big-label">projected portfolio at retirement</div>
            <div style={{marginTop:'18px'}}>
              {[['Years to retirement',`${form.retireAge-form.age} yrs`],['Current total assets',`$${((+form.ira||0)+(+form.roth||0)+(+form.k401||0)+(+form.taxable||0)).toLocaleString()}`],['RMD starts','Age 73'],['Est. annual RMD','$52,400'],['Lifetime tax estimate','$318,000'],].map(([k,v])=>(
                <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val">{v}</div></div>
              ))}
            </div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Scenarios to model</div>
            {[{label:'Baseline',sub:'Current trajectory — no changes',active:true},{label:'Roth conversion',sub:'Annual conversions to fill 22% bracket'},{label:'Tax-loss harvesting',sub:'Offset gains with harvested losses'}].map((s,i)=>(
              <div key={i} style={{display:'flex',gap:'10px',padding:'9px 0',borderBottom:i<2?'1px solid #F0EEF8':'none'}}>
                <input type="checkbox" defaultChecked={s.active} style={{accentColor:'var(--purple)',marginTop:'2px'}} />
                <div><div style={{fontSize:'13px',fontWeight:600,color:'var(--dark)'}}>{s.label}</div><div style={{fontSize:'11px',color:'var(--muted)',marginTop:'1px'}}>{s.sub}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Detail
  const c = selected || CLIENTS[0];
  return (
    <div className="ts-page">
      <button className="ts-back" onClick={()=>setView('list')}>← Back to projections</button>
      <div className="ts-hrow">
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
          <div className="ts-av-lg">{c.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
          <div>
            <div className="ts-page-title">{c.name}</div>
            <div className="ts-page-sub">{c.horizon} projection · {c.scenarios} scenarios · <span className="ts-pill ts-p-green">Est. saved {c.saved}</span></div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="ts-btn ts-btn-secondary">Export PDF</button>
          <button className="ts-btn ts-btn-primary">+ Add scenario</button>
        </div>
      </div>

      <div className="ts-stabs">
        {['Baseline','Roth Conversion','Tax-Loss Harvesting'].map(s=>(
          <div key={s} className={`ts-stab${activeScenario===s.toLowerCase().replace(/ /g,'-')?' act':''}`} onClick={()=>setActiveScenario(s.toLowerCase().replace(/ /g,'-'))}>{s}</div>
        ))}
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[{l:'Total portfolio',v:'$1.24M'},{l:'Est. tax saved',v:c.saved,cl:'ts-delta-up'},{l:'Lifetime tax',v:'$318k'},{l:'RMD at 73',v:'$52,400/yr'}].map(k=>(
          <div className="ts-kpi" key={k.l}><div className="ts-kpi-label">{k.l}</div><div className="ts-kpi-val" style={{fontSize:'20px'}}>{k.v}</div>{k.cl&&<div className={`ts-kpi-delta ${k.cl}`}>vs baseline</div>}</div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="ts-card" style={{marginBottom:'14px'}}>
        <div className="ts-card-title">10-year projection — annual federal tax <span className="ts-card-sub">Baseline vs Roth Conversion</span></div>
        <div style={{display:'flex',gap:'12px',marginBottom:'10px'}}>
          {[['var(--purple)','Baseline'],['var(--teal)','Roth Conversion']].map(([bg,lbl])=>(
            <div key={lbl} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',color:'var(--muted)',fontWeight:600}}>
              <div style={{width:'9px',height:'9px',borderRadius:'2px',background:bg}} />{lbl}
            </div>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'flex-end',gap:'10px',height:'100px'}}>
          {[['2026',60,48],['2027',62,46],['2028',68,44],['2029',72,42],['2030',76,40],['2031',80,38],['2032',85,37],['2033',88,36],['2034',92,34],['2035',95,32]].map(([yr,b,r])=>(
            <div key={yr} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
              <div style={{display:'flex',gap:'2px',alignItems:'flex-end',width:'100%',height:'80px'}}>
                <div style={{flex:1,height:`${b}px`,borderRadius:'3px 3px 0 0',background:'var(--purple)',opacity:.7}} />
                <div style={{flex:1,height:`${r}px`,borderRadius:'3px 3px 0 0',background:'var(--teal)',opacity:.8}} />
              </div>
              <div style={{fontSize:'9px',color:'var(--muted)'}}>{yr}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ts-g2">
        <div className="ts-card">
          <div className="ts-card-title">Account balances at retirement</div>
          {[['Traditional IRA','$0','$682k converted'],['Roth IRA','$1.12M','↑ from $85k'],['401(k)','$310k','RMDs begin age 73'],['Taxable','$340k','Step-up at death']].map(([ac,v,sub],i)=>(
            <div key={ac} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'10px 0',borderBottom:i<3?'1px solid #F0EEF8':'none'}}>
              <div><div style={{fontSize:'13px',fontWeight:600,color:'var(--dark)'}}>{ac}</div><div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{sub}</div></div>
              <div style={{fontSize:'14px',fontWeight:700,color:'var(--dark)'}}>{v}</div>
            </div>
          ))}
        </div>
        <div className="ts-card">
          <div className="ts-card-title">Planning notes</div>
          <textarea style={{height:'120px',resize:'none'}} defaultValue="Roth conversion strategy: fill 22% bracket each year before retirement. Target $60-70k annual conversions 2026-2032. Coordinate with Social Security timing." />
          <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{marginTop:'10px'}}>Save notes</button>
        </div>
      </div>
    </div>
  );
}
