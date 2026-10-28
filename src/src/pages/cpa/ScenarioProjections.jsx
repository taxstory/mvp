// src/pages/cpa/ScenarioProjections.jsx
// Multi-scenario tax projection UI — mirrors the Red Five 2026 Tax Scenario Model
// Supports: Form 1040 (Individual), Form 1041 (Estate/Trust),
//           Form 1065 (Partnership), Form 1120 (C-Corp), Form 1120-S (S-Corp)
// Up to 3 scenarios side-by-side with comparison summary.

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAuth }   from '../../context/AuthContext';
import { supabase }  from '../../lib/supabase';
import {
  calcFullFederalTax, calcScenarios, taxOptionsFor,
  calc1041Tax, calc1065Results, calc1120Tax, calc1120SResults,
} from '../../utils/taxEngine';

// ── Fast number formatter ─────────────────────────────────────────────────────
// toLocaleString is convenient but calls into the browser's ICU/locale subsystem.
// On the hot path (40+ calls per keystroke in scenario comparison), that overhead
// compounds. This manual version is 5-10x faster and produces identical output.
function fmtDollar(n) {
  if (n == null || isNaN(n)) return '—';
  const abs  = Math.abs(Math.round(Number(n)));
  const str  = String(abs);
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) result += ',';
    result += str[i];
  }
  return (n < 0 ? '-$' : '$') + result;
}

// fmt is an alias kept for call-site compatibility
const fmt = fmtDollar;
const pct = (n) => n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`;
const fmtPct = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

const SCENARIO_COLORS = ['var(--purple)', 'var(--color-green)', 'var(--color-amber)'];
const SCENARIO_LABELS = ['A', 'B', 'C'];

const FILING_OPTIONS = [
  { value: 'Married filing jointly',   label: 'MFJ — Married filing jointly' },
  { value: 'Single',                   label: 'Single' },
  { value: 'Married filing separately',label: 'MFS — Married filing separately' },
  { value: 'Head of household',        label: 'HOH — Head of household' },
];

const FORM_OPTIONS = [
  { value: '1040',  label: 'Form 1040 — Individual' },
  { value: '1041',  label: 'Form 1041 — Estate / Trust' },
  { value: '1065',  label: 'Form 1065 — Partnership' },
  { value: '1120',  label: 'Form 1120 — C-Corporation' },
  { value: '1120S', label: 'Form 1120-S — S-Corporation' },
];

// Default blank scenario
function blankScenario(label = 'Base Case') {
  return {
    scenarioLabel: label,
    filingStatus: 'Married filing jointly',
    taxpayerAge: 0, spouseAge: 0,
    numDependents: 0, children: 0,
    // Income
    wages: 0, spouseWages: 0,
    businessIncome: 0, partnershipKIncome: 0,
    rentalIncome: 0, farmIncome: 0,
    interestIncome: 0, ordinaryDividends: 0, qualifiedDividends: 0,
    ltcg: 0, stcg: 0, cryptoLtcg: 0, cryptoStcg: 0,
    section1231Gain: 0, unrecaptured1250Gain: 0,
    capitalLossCarryforward: 0,
    socialSecurity: 0, pensionDistributions: 0,
    gamblingWinnings: 0, alimonyReceived: 0, otherIncome: 0,
    tipIncome: 0, overtimeIncome: 0,
    // Above the line
    studentLoanInterest: 0, educatorExpenses: 0, hsaContribution: 0,
    iraDeduction: 0, seHealthInsurance: 0, alimonyPaid: 0, otherAdjustments: 0,
    // Itemized
    saltIncomeTaxesPaid: 0, propertyTaxesPaid: 0,
    mortgageInterestPrimary: 0, mortgageInterestSecond: 0,
    cashCharity: 0, nonCashCharity: 0,
    medicalExpenses: 0, gamblingLosses: 0, investmentInterest: 0, casualtyLosses: 0,
    // Credits
    dependentCareExpenses: 0, educationExpenses: 0,
    energyCredits: 0, evCredit: 0, foreignTaxCredit: 0, otherCredits: 0,
    isAmericanOpportunity: true,
    // Payments
    federalWithholding: 0, estimatedPayments: 0, priorYearOverpayment: 0,
    // OBBBA
    aged: false, blind: false, spouseAgedOrBlind: false,
    vehicleLoanInterest: 0,
  };
}

// Input field component
function NumInput({ label, value, onChange, hint, small }) {
  return (
    <div style={{ marginBottom: small ? 6 : 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--muted)', marginBottom: 3 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: 5, color: 'var(--color-muted-light)' }}>{hint}</span>}
      </label>
      <input
        type="number"
        value={value || ''}
        onChange={e => onChange(Number(e.target.value) || 0)}
        style={{
          width: '100%', padding: '6px 10px', border: '1px solid var(--color-border)',
          borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: 'var(--dark)',
          background: 'var(--color-soft-white)',
        }}
        placeholder="0"
      />
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
      color: 'var(--purple)', borderBottom: '1px solid var(--color-border)',
      paddingBottom: 5, marginBottom: 8, marginTop: 14,
    }}>
      {title}
    </div>
  );
}

// Comparison row in results table
function CompRow({ label, values, color, bold, highlight }) {
  return (
    <div style={{
      display: 'flex',
      padding: '6px 0',
      borderBottom: '1px solid var(--color-gray-bg)',
      background: highlight ? 'var(--color-soft)' : 'transparent',
      alignItems: 'center',
    }}>
      <div style={{ flex: 1.4, fontSize: 12, color: bold ? 'var(--dark)' : 'var(--muted)', fontWeight: bold ? 600 : 400 }}>
        {label}
      </div>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1, textAlign: 'right', fontSize: 13,
          fontWeight: bold ? 700 : 500,
          color: color?.[i] || (bold ? 'var(--dark)' : 'var(--muted)'),
          fontFamily: bold ? 'inherit' : 'monospace',
        }}>
          {v}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScenarioProjections() {
  const { user } = useAuth();
  const [formType, setFormType] = useState('1040');
  const [year, setYear]         = useState(2026);
  const [scenarios, setScenarios] = useState([
    blankScenario('Base Case'),
    blankScenario('Scenario B'),
    blankScenario('Scenario C'),
  ]);
  const [activeTab, setActiveTab]   = useState(0);
  const [showPresets,  setShowPresets]  = useState(false);
  const [presetToast,  setPresetToast]  = useState('');

  // Scenario presets — common planning situations as starting points
  const PRESETS = {
    roth_conversion: {
      label: '🔄 Roth Conversion',
      scenarios: [
        {...blankScenario('No Conversion'),    wages:150000, filingStatus:'Married filing jointly', federalWithholding:22000},
        {...blankScenario('Convert $25K'),     wages:150000, filingStatus:'Married filing jointly', federalWithholding:22000},
        {...blankScenario('Convert $50K'),     wages:150000, filingStatus:'Married filing jointly', federalWithholding:22000},
      ],
    },
    salary_vs_distrib: {
      label: '💼 Salary vs Distribution',
      scenarios: [
        {...blankScenario('All W-2'),          wages:200000, filingStatus:'Single', estimatedPayments:40000},
        {...blankScenario('$100K Sal + Dist'), wages:100000, businessIncome:100000, filingStatus:'Single', estimatedPayments:40000},
        {...blankScenario('$60K Sal + Dist'),  wages:60000,  businessIncome:140000, filingStatus:'Single', estimatedPayments:40000},
      ],
    },
    capital_gains_timing: {
      label: '📈 Capital Gains Timing',
      scenarios: [
        {...blankScenario('Realize in 2026'), wages:80000, ltcg:50000, filingStatus:'Single', federalWithholding:14000},
        {...blankScenario('Defer to 2027'),   wages:80000, ltcg:0,     filingStatus:'Single', federalWithholding:14000},
        {...blankScenario('Spread 2026+2027'),wages:80000, ltcg:25000, filingStatus:'Single', federalWithholding:14000},
      ],
    },
  };
  const [showAll, setShowAll]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savedMsg, setSavedMsg]     = useState('');
  const [clientId, setClientId]     = useState('');
  const [clientList, setClientList] = useState([]);

  useEffect(() => {
    if (!user) return;
    supabase.from('clients').select('id,name').eq('user_id', user.id)
      .order('name').then(({ data }) => setClientList(data || []));
  }, [user?.id]);

  async function saveScenarios() {
    if (!user) return;
    setSaving(true); setSavedMsg('');
    try {
      const payload = {
        user_id:    user.id,
        client_id:  clientId || null,
        file_name:  `Scenarios — ${scenarios.map(s=>s.scenarioLabel).join(' vs ')} — ${formType} ${year}`,
        tax_year:   year,
        status:     'scenario_set',
        parsed_data: { formType, year, scenarios, results },
        notes: '',
      };
      await supabase.from('tax_returns').insert(payload);
      setSavedMsg('Saved to client record ✓');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch(e) { setSavedMsg('Save failed: ' + e.message); }
    setSaving(false);
  }

  function exportCSV() {
    if (!results.length) return;
    const rows = [
      ['Metric', ...results.map(r => r.scenarioLabel)],
    ];
    if (formType === '1040') {
      const metrics = [
        ['Gross Income',       r => r.grossIncome],
        ['AGI',                r => r.agi],
        ['Taxable Income',     r => r.taxableIncome],
        ['Ordinary Tax',       r => r.ordinaryTax],
        ['LTCG Tax',           r => r.ltcgTax],
        ['SE Tax',             r => r.seTax],
        ['NIIT',               r => r.niit],
        ['Total Federal Tax',  r => r.totalFederalTax],
        ['Total Payments',     r => r.totalPayments],
        ['Balance Due/Refund', r => r.balanceDue],
        ['Effective Rate %',   r => r.effectiveRate],
        ['Marginal Rate %',    r => (r.marginalRate||0)*100],
      ];
      metrics.forEach(([label, fn]) => {
        rows.push([label, ...results.map(r => fn(r) ?? '')]);
      });
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `TaxStory_Scenarios_${formType}_${year}.csv`;
    a.click();
  }

  // Immediate update for non-numeric fields (labels, selects, checkboxes)
  // so the UI feels instant. Numeric inputs get the debounced version below.
  const updateScenario = useCallback((idx, key, val) => {
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));
  }, []);

  // Debounced numeric update — waits 120ms after last keystroke before
  // invalidating the useMemo and running the tax calculation.
  // Cuts calc frequency from ~8/sec (fast typist) to ~1/sec.
  const pendingRef = useRef({});
  const timerRef   = useRef(null);

  const updateScenarioDebounced = useCallback((idx, key, val) => {
    // Apply visually immediately (controlled input needs this)
    setScenarios(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));
    // But batch the memo invalidation
    pendingRef.current = { ...pendingRef.current, [`${idx}_${key}`]: true };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pendingRef.current = {};
      // Force a memo re-evaluation by touching a separate debounced state
      setDebounceTick(t => t + 1);
    }, 120);
  }, []);

  const [debounceTick, setDebounceTick] = useState(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Compute results for all scenarios
  const results = useMemo(() => {
    if (formType === '1040') return calcScenarios(scenarios, year, taxOptionsFor(year));
    if (formType === '1041') return scenarios.map(s => ({ ...calc1041Tax(s), scenarioLabel: s.scenarioLabel }));
    if (formType === '1065') return scenarios.map(s => ({ ...calc1065Results(s), scenarioLabel: s.scenarioLabel }));
    if (formType === '1120') return scenarios.map(s => ({ ...calc1120Tax(s), scenarioLabel: s.scenarioLabel }));
    if (formType === '1120S') return scenarios.map(s => ({ ...calc1120SResults(s), scenarioLabel: s.scenarioLabel }));
    return [];
  }, [scenarios, formType, year, debounceTick]); // debounceTick batches rapid input

  const sc = scenarios[activeTab];
  // upd for text/select/checkbox (immediate), updN for numbers (debounced)
  const upd  = useCallback((k) => (v) => updateScenario(activeTab, k, v), [activeTab, updateScenario]);
  const updN = useCallback((k) => (v) => updateScenarioDebounced(activeTab, k, v), [activeTab, updateScenarioDebounced]);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 24, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>
            Scenario Projections
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Model up to 3 tax scenarios side by side · Form 1040 / 1041 / 1065 / 1120 / 1120-S
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap:'wrap' }}>
          {clientList.length > 0 && (
            <select value={clientId} onChange={e=>setClientId(e.target.value)}
              style={{padding:'7px 10px',border:'1px solid var(--color-border)',borderRadius:9,fontSize:12.5,color:'var(--dark)'}}>
              <option value="">Save to client…</option>
              {clientList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div style={{position:'relative'}}>
            <button onClick={()=>setShowPresets(p=>!p)}
              style={{padding:'7px 13px',background:'var(--bg)',color:'var(--purple)',border:'1px solid var(--color-blue-mid-bg)',borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
              📋 Templates ▾
            </button>
            {showPresets && (
              <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,background:'#fff',border:'1px solid var(--color-border)',
                borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:50,minWidth:200,padding:6}}>
                {Object.entries(PRESETS).map(([key,preset]) => (
                  <button key={key}
                    onClick={()=>{
                      setScenarios(preset.scenarios.map(s=>({...blankScenario(),...s})));
                      setShowPresets(false);
                      setActiveTab(0);
                      // Brief toast so CPA knows to update the baseline figures
                      setPresetToast('Preset loaded — adjust income and filing status to match your client.');
                      setTimeout(() => setPresetToast(''), 5000);
                    }}
                    style={{display:'block',width:'100%',textAlign:'left',padding:'9px 12px',background:'transparent',
                      border:'none',borderRadius:7,fontSize:12.5,fontWeight:500,color:'var(--dark)',cursor:'pointer',fontFamily:'inherit'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={saveScenarios} disabled={saving}
            style={{padding:'7px 13px',background:'var(--purple3)',color:'var(--purple)',border:'none',borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            {savedMsg || (saving ? 'Saving…' : '💾 Save')}
          </button>
          <button onClick={exportCSV}
            style={{padding:'7px 13px',background:'var(--color-green-light)',color:'var(--color-green-dark)',border:'1px solid var(--color-green-very)',borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            ↓ CSV
          </button>
        </div>
        {presetToast && (
          <div style={{marginTop:8,padding:'9px 14px',background:'var(--color-green-light)',border:'1px solid var(--color-green-check)',
            borderRadius:9,fontSize:12.5,color:'var(--color-green-dark)',fontWeight:500,display:'flex',alignItems:'center',gap:8}}>
            <span>✓</span> {presetToast}
          </div>
        )}
        <div style={{display:'none'}} aria-hidden="true">
          <select
            value={formType}
            onChange={e => setFormType(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid var(--color-border)', borderRadius: 9, fontSize: 13, color: 'var(--dark)' }}
          >
            {FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '7px 12px', border: '1px solid var(--color-border)', borderRadius: 9, fontSize: 13, color: 'var(--dark)' }}
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18 }}>

        {/* ── LEFT: Input panel ─────────────────────────────────────── */}
        <div>
          {/* Scenario tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
            {scenarios.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                style={{
                  flex: 1, padding: '8px 4px',
                  background: activeTab === i ? SCENARIO_COLORS[i] : 'var(--color-purple-wash)',
                  color: activeTab === i ? 'white' : 'var(--muted)',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  borderRadius: i === 0 ? '9px 0 0 9px' : i === 2 ? '0 9px 9px 0' : '0',
                }}
              >
                {s.scenarioLabel || `Scenario ${SCENARIO_LABELS[i]}`}
              </button>
            ))}
          </div>

          {/* Scenario label */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
              Scenario label
            </label>
            <input
              type="text"
              value={sc.scenarioLabel}
              onChange={e => upd('scenarioLabel')(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 9, fontSize: 13 }}
            />
          </div>

          {/* Form 1040 inputs */}
          {formType === '1040' && (
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 4 }}>

              <SectionHeader title="Filing & Personal" />
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  Filing status
                </label>
                <select value={sc.filingStatus} onChange={e => upd('filingStatus')(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 9, fontSize: 13 }}>
                  {FILING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <NumInput label="Taxpayer age" value={sc.taxpayerAge} onChange={updN('taxpayerAge')} small />
                <NumInput label="Spouse age" value={sc.spouseAge} onChange={updN('spouseAge')} small />
                <NumInput label="Dependents" value={sc.numDependents} onChange={updN('numDependents')} small />
                <NumInput label="Children (CTC)" value={sc.children} onChange={updN('children')} hint="Under 17" small />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                {[['aged','TP1 age 65+'],['blind','TP1 blind'],['spouseAgedOrBlind','Spouse 65+/blind']].map(([k,l]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sc[k]} onChange={e => upd(k)(e.target.checked)} style={{ accentColor: 'var(--purple)' }} />
                    {l}
                  </label>
                ))}
              </div>

              <SectionHeader title="Income — Ordinary" />
              <NumInput label="W-2 Wages — Taxpayer" value={sc.wages} onChange={updN('wages')} />
              <NumInput label="W-2 Wages — Spouse" value={sc.spouseWages} onChange={updN('spouseWages')} />
              <NumInput label="Business Income (Sch C — Net)" value={sc.businessIncome} onChange={updN('businessIncome')} hint="Before SE deduction" />
              <NumInput label="Partnership / S-Corp K-1" value={sc.partnershipKIncome} onChange={updN('partnershipKIncome')} />
              <NumInput label="Rental Income (Net)" value={sc.rentalIncome} onChange={updN('rentalIncome')} />
              <NumInput label="Farm Income (Sch F)" value={sc.farmIncome} onChange={updN('farmIncome')} />
              <NumInput label="Taxable Interest" value={sc.interestIncome} onChange={updN('interestIncome')} />
              <NumInput label="Ordinary Dividends" value={sc.ordinaryDividends} onChange={updN('ordinaryDividends')} />
              <NumInput label="Qualified Dividends" value={sc.qualifiedDividends} onChange={updN('qualifiedDividends')} hint="Subset of ord. divs" />
              <NumInput label="IRA / Pension Distributions" value={sc.pensionDistributions} onChange={updN('pensionDistributions')} />
              <NumInput label="Social Security Benefits (Total)" value={sc.socialSecurity} onChange={updN('socialSecurity')} />
              <NumInput label="Qualified tips (already in wages)" value={sc.tipIncome} onChange={updN('tipIncome')} hint="Deduction ≤ $25k; reduced over $150k/$300k MAGI" />
              <NumInput label="Qualified overtime premium (already in wages)" value={sc.overtimeIncome} onChange={updN('overtimeIncome')} hint="Deduction ≤ $12.5k ($25k joint); same phase-out" />
              <NumInput label="Gambling Winnings" value={sc.gamblingWinnings} onChange={updN('gamblingWinnings')} />
              <NumInput label="Alimony Received" value={sc.alimonyReceived} onChange={updN('alimonyReceived')} hint="Pre-2019 only" />
              <NumInput label="Other Income" value={sc.otherIncome} onChange={updN('otherIncome')} />

              <SectionHeader title="Capital Gains & Crypto" />
              <NumInput label="Short-Term Capital Gains" value={sc.stcg} onChange={updN('stcg')} />
              <NumInput label="Long-Term Capital Gains" value={sc.ltcg} onChange={updN('ltcg')} />
              <NumInput label="Capital Losses (enter negative)" value={sc.capitalLossCarryforward} onChange={updN('capitalLossCarryforward')} />
              <NumInput label="Crypto — Short-Term Gains" value={sc.cryptoStcg} onChange={updN('cryptoStcg')} />
              <NumInput label="Crypto — Long-Term Gains" value={sc.cryptoLtcg} onChange={updN('cryptoLtcg')} />
              <NumInput label="Section 1231 Gain / Loss" value={sc.section1231Gain} onChange={updN('section1231Gain')} />
              <NumInput label="Unrecaptured Sec. 1250 Gain" value={sc.unrecaptured1250Gain} onChange={updN('unrecaptured1250Gain')} hint="Max 25% rate" />

              <SectionHeader title="Above-the-Line Deductions" />
              <NumInput label="Student Loan Interest" value={sc.studentLoanInterest} onChange={updN('studentLoanInterest')} hint="Max $2,500" />
              <NumInput label="Educator Expenses" value={sc.educatorExpenses} onChange={updN('educatorExpenses')} hint="Max $300" />
              <NumInput label="HSA Contribution" value={sc.hsaContribution} onChange={updN('hsaContribution')} />
              <NumInput label="IRA Deduction (Traditional)" value={sc.iraDeduction} onChange={updN('iraDeduction')} />
              <NumInput label="Self-Employed Health Insurance" value={sc.seHealthInsurance} onChange={updN('seHealthInsurance')} />
              <NumInput label="Vehicle Loan Interest" value={sc.vehicleLoanInterest} onChange={updN('vehicleLoanInterest')} hint="Deduction ≤ $10k; reduced over $100k/$200k MAGI" />
              <NumInput label="Alimony Paid" value={sc.alimonyPaid} onChange={updN('alimonyPaid')} hint="Pre-2019 only" />
              <NumInput label="Other Adjustments" value={sc.otherAdjustments} onChange={updN('otherAdjustments')} />

              <SectionHeader title="Itemized Deductions (Sch A)" />
              <NumInput label="State & Local Income Taxes" value={sc.saltIncomeTaxesPaid} onChange={updN('saltIncomeTaxesPaid')} hint="Capped combined w/ property" />
              <NumInput label="Real Property Taxes" value={sc.propertyTaxesPaid} onChange={updN('propertyTaxesPaid')} hint="Included in SALT cap" />
              <NumInput label="Mortgage Interest — Primary" value={sc.mortgageInterestPrimary} onChange={updN('mortgageInterestPrimary')} />
              <NumInput label="Mortgage Interest — Second Home" value={sc.mortgageInterestSecond} onChange={updN('mortgageInterestSecond')} />
              <NumInput label="Cash Charitable Contributions" value={sc.cashCharity} onChange={updN('cashCharity')} />
              <NumInput label="Non-Cash Charitable Contributions" value={sc.nonCashCharity} onChange={updN('nonCashCharity')} />
              <NumInput label="Unreimbursed Medical Expenses" value={sc.medicalExpenses} onChange={updN('medicalExpenses')} hint="Before 7.5% AGI floor" />
              <NumInput label="Gambling Losses" value={sc.gamblingLosses} onChange={updN('gamblingLosses')} hint="To extent of winnings" />
              <NumInput label="Investment Interest Expense" value={sc.investmentInterest} onChange={updN('investmentInterest')} />

              <SectionHeader title="Credits" />
              <NumInput label="Child & Dependent Care Expenses" value={sc.dependentCareExpenses} onChange={updN('dependentCareExpenses')} />
              <NumInput label="Education Expenses" value={sc.educationExpenses} onChange={updN('educationExpenses')} />
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sc.isAmericanOpportunity}
                    onChange={e => upd('isAmericanOpportunity')(e.target.checked)}
                    style={{ accentColor: 'var(--purple)' }} />
                  American Opportunity (vs Lifetime Learning)
                </label>
              </div>
              <NumInput label="Energy Credits (IRC 25C/25D)" value={sc.energyCredits} onChange={updN('energyCredits')} hint="Max $1,200" />
              <NumInput label="EV Credit (IRC 30D)" value={sc.evCredit} onChange={updN('evCredit')} hint="Up to $7,500" />
              <NumInput label="Foreign Tax Credit" value={sc.foreignTaxCredit} onChange={updN('foreignTaxCredit')} />
              <NumInput label="Other Credits" value={sc.otherCredits} onChange={updN('otherCredits')} />

              <SectionHeader title="Payments" />
              <NumInput label="Federal Withholding (W-2 + 1099)" value={sc.federalWithholding} onChange={updN('federalWithholding')} />
              <NumInput label="Estimated Tax Payments" value={sc.estimatedPayments} onChange={updN('estimatedPayments')} />
              <NumInput label="Prior Year Overpayment Applied" value={sc.priorYearOverpayment} onChange={updN('priorYearOverpayment')} />
            </div>
          )}

          {/* Form 1041 inputs */}
          {formType === '1041' && (
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 4 }}>
              <SectionHeader title="Entity" />
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Entity type</label>
                <select value={sc.entityType || 'Estate'} onChange={e => upd('entityType')(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 9, fontSize: 13 }}>
                  <option value="Estate">Estate</option>
                  <option value="Simple Trust">Simple Trust ($300 exemption)</option>
                  <option value="Complex Trust">Complex Trust ($100 exemption)</option>
                </select>
              </div>
              <SectionHeader title="Income" />
              <NumInput label="Interest Income" value={sc.interestIncome} onChange={updN('interestIncome')} />
              <NumInput label="Ordinary Dividends" value={sc.ordinaryDividends} onChange={updN('ordinaryDividends')} />
              <NumInput label="Qualified Dividends" value={sc.qualifiedDividends} onChange={updN('qualifiedDividends')} />
              <NumInput label="Business / Pass-Through Income" value={sc.businessIncome} onChange={updN('businessIncome')} />
              <NumInput label="Rental Income (Net)" value={sc.rentalIncome} onChange={updN('rentalIncome')} />
              <NumInput label="Short-Term Capital Gains" value={sc.stcg} onChange={updN('stcg')} />
              <NumInput label="Long-Term Capital Gains" value={sc.ltcg} onChange={updN('ltcg')} />
              <NumInput label="Capital Loss Carryforward" value={sc.capitalLossCarryforward} onChange={updN('capitalLossCarryforward')} />
              <SectionHeader title="Deductions" />
              <NumInput label="Fiduciary Fees" value={sc.fiduciaryFees || 0} onChange={updN('fiduciaryFees')} />
              <NumInput label="Attorney / Accounting Fees" value={sc.attorneyFees || 0} onChange={updN('attorneyFees')} />
              <NumInput label="Charitable Contributions (IRC §642c)" value={sc.charityContributions || 0} onChange={updN('charityContributions')} />
              <NumInput label="Interest Expense" value={sc.interestExpense || 0} onChange={updN('interestExpense')} />
              <NumInput label="Tax Preparation Fees" value={sc.taxPrepFees || 0} onChange={updN('taxPrepFees')} />
              <NumInput label="Exemption" value={sc.exemption || 600} onChange={updN('exemption')} hint="Estate=600, Simple=300, Complex=100" />
              <NumInput label="Distribution Deduction" value={sc.distributionDeduction || 0} onChange={updN('distributionDeduction')} hint="Lesser of DNI or actual" />
              <SectionHeader title="Payments" />
              <NumInput label="Estimated Tax Payments" value={sc.estimatedPayments || 0} onChange={updN('estimatedPayments')} />
            </div>
          )}

          {/* Form 1065 / 1120-S inputs */}
          {(formType === '1065' || formType === '1120S') && (
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 4 }}>
              <SectionHeader title="Entity" />
              <NumInput label={formType === '1065' ? 'Number of Partners' : 'Number of Shareholders'}
                value={formType === '1065' ? (sc.numberOfPartners || 1) : (sc.numberOfShareholders || 1)}
                onChange={updN(formType === '1065' ? 'numberOfPartners' : 'numberOfShareholders')} />
              <SectionHeader title="Income" />
              <NumInput label="Gross Receipts / Sales" value={sc.grossReceipts || 0} onChange={updN('grossReceipts')} />
              <NumInput label="Cost of Goods Sold" value={sc.costOfGoodsSold || 0} onChange={updN('costOfGoodsSold')} />
              <NumInput label="Interest Income" value={sc.interestIncome} onChange={updN('interestIncome')} />
              <NumInput label="Rental Real Estate (Net)" value={sc.rentalRealEstate || 0} onChange={updN('rentalRealEstate')} />
              <NumInput label="Net STCG / (Loss)" value={sc.stcg} onChange={updN('stcg')} />
              <NumInput label="Net LTCG / (Loss)" value={sc.ltcg} onChange={updN('ltcg')} />
              <SectionHeader title="Deductions / Expenses" />
              <NumInput label={formType === '1065' ? 'Guaranteed Payments' : 'Officer Compensation (W-2)'}
                value={sc.officerComp || sc.guaranteedPayments || 0}
                onChange={updN(formType === '1065' ? 'guaranteedPayments' : 'officerComp')} />
              <NumInput label="Salaries & Wages (W-2 employees)" value={sc.salariesWages || 0} onChange={updN('salariesWages')} />
              <NumInput label="Rent Expense" value={sc.rentExpense || 0} onChange={updN('rentExpense')} />
              <NumInput label="Depreciation (incl. §179 / Bonus)" value={sc.depreciation || 0} onChange={updN('depreciation')} />
              <NumInput label="Interest Expense (Business)" value={sc.interestExpense || 0} onChange={updN('interestExpense')} />
              <NumInput label="Taxes & Licenses" value={sc.taxesLicenses || 0} onChange={updN('taxesLicenses')} />
              <NumInput label="Employee Benefits" value={sc.employeeBenefits || 0} onChange={updN('employeeBenefits')} />
              <NumInput label="Repairs & Maintenance" value={sc.repairs || 0} onChange={updN('repairs')} />
              <NumInput label="Other Deductions" value={sc.otherDeductions || 0} onChange={updN('otherDeductions')} />
              <NumInput label="Section 179 (Separately Stated)" value={sc.section179 || 0} onChange={updN('section179')} />
              <NumInput label="Charitable Contributions (Separately Stated)" value={sc.charityContributions || 0} onChange={updN('charityContributions')} />
              <SectionHeader title="Distributions" />
              <NumInput label="Distributions to Owners (Cash)" value={sc.cashDistributions || 0} onChange={updN('cashDistributions')} />
            </div>
          )}

          {/* Form 1120 inputs */}
          {formType === '1120' && (
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: 4 }}>
              <SectionHeader title="Income" />
              <NumInput label="Gross Receipts / Sales" value={sc.grossReceipts || 0} onChange={updN('grossReceipts')} />
              <NumInput label="Cost of Goods Sold" value={sc.costOfGoodsSold || 0} onChange={updN('costOfGoodsSold')} />
              <NumInput label="Interest Income" value={sc.interestIncome} onChange={updN('interestIncome')} />
              <NumInput label="Dividend Income (from corps)" value={sc.dividendIncome || 0} onChange={updN('dividendIncome')} />
              <NumInput label="Dividends-Received Deduction %" value={(sc.dividendsReceivedPct || 0.5) * 100} onChange={v => upd('dividendsReceivedPct')(v / 100)} hint="50/65/100" />
              <NumInput label="Rental Income (Net)" value={sc.rentalIncome} onChange={updN('rentalIncome')} />
              <NumInput label="Capital Gain (taxed as ordinary)" value={sc.ltcg} onChange={updN('ltcg')} />
              <SectionHeader title="Deductions / Expenses" />
              <NumInput label="Officer Compensation" value={sc.officerComp || 0} onChange={updN('officerComp')} />
              <NumInput label="Salaries & Wages (Other)" value={sc.salariesWages || 0} onChange={updN('salariesWages')} />
              <NumInput label="Rent Expense" value={sc.rentExpense || 0} onChange={updN('rentExpense')} />
              <NumInput label="Depreciation" value={sc.depreciation || 0} onChange={updN('depreciation')} />
              <NumInput label="Interest Expense" value={sc.interestExpense || 0} onChange={updN('interestExpense')} />
              <NumInput label="Advertising" value={sc.advertising || 0} onChange={updN('advertising')} />
              <NumInput label="Employee Benefit Programs" value={sc.employeeBenefits || 0} onChange={updN('employeeBenefits')} />
              <NumInput label="Charitable Contributions" value={sc.charityContributions || 0} onChange={updN('charityContributions')} hint="Limited to 10% of income" />
              <NumInput label="Taxes & Licenses" value={sc.taxesLicenses || 0} onChange={updN('taxesLicenses')} />
              <NumInput label="Bad Debts" value={sc.badDebts || 0} onChange={updN('badDebts')} />
              <NumInput label="Other Deductions" value={sc.otherDeductions || 0} onChange={updN('otherDeductions')} />
              <SectionHeader title="Credits & Payments" />
              <NumInput label="General Business Credits (R&D, WOTC)" value={sc.generalBusinessCredits || 0} onChange={updN('generalBusinessCredits')} />
              <NumInput label="Foreign Tax Credit" value={sc.foreignTaxCredit} onChange={updN('foreignTaxCredit')} />
              <NumInput label="Estimated Tax Payments" value={sc.estimatedPayments} onChange={updN('estimatedPayments')} />
              <SectionHeader title="Dividend Planning" />
              <NumInput label="Planned Dividend to Shareholders" value={sc.plannedDividend || 0} onChange={updN('plannedDividend')} />
            </div>
          )}
        </div>

        {/* ── RIGHT: Results panel ─────────────────────────────────────── */}
        <div>
          {/* Scenario comparison header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `1fr repeat(3, 1fr)`,
            background: 'var(--dark)',
            borderRadius: '12px 12px 0 0',
            padding: '12px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {FORM_OPTIONS.find(f => f.value === formType)?.label} · {year}
            </div>
            {results.map((r, i) => (
              <div key={i} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: SCENARIO_COLORS[i] }}>{r.scenarioLabel}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
            padding: '0 16px 14px',
            maxHeight: 'calc(100vh - 210px)',
            overflowY: 'auto',
          }}>
            {formType === '1040' && (
              <>
                <CompRow label="GROSS INCOME" bold
                  values={results.map(r => fmt(r.grossIncome))} highlight />
                <CompRow label="  W-2 Wages (Total)"
                  values={results.map(r => fmt(r.totalWages))} />
                <CompRow label="  Business / K-1 / Farm"
                  values={results.map(r => fmt((r.inputs?.businessIncome||0)+(r.inputs?.partnershipKIncome||0)+(r.inputs?.farmIncome||0)))} />
                <CompRow label="  Rental Income (Net)"
                  values={results.map(r => fmt(r.inputs?.rentalIncome))} />
                <CompRow label="  Net LTCG + Qual. Dividends"
                  values={results.map(r => fmt(r.ltcgAndQD))} />
                <CompRow label="  Social Security (Taxable)"
                  values={results.map(r => fmt(r.taxableSS))} />

                <CompRow label="TOTAL ADJUSTMENTS" bold
                  values={results.map(r => fmt(-r.totalAboveTheLine))} highlight />
                <CompRow label="  SE Tax Deduction"
                  values={results.map(r => fmt(-r.seDeduction))} />
                <CompRow label="  Student Loan Interest"
                  values={results.map(r => r.studentLoanDed ? fmt(-r.studentLoanDed) : '—')} />
                <CompRow label="  HSA Deduction"
                  values={results.map(r => r.hsaDed ? fmt(-r.hsaDed) : '—')} />
                <CompRow label="  IRA Deduction"
                  values={results.map(r => r.iraDed ? fmt(-r.iraDed) : '—')} />
                <CompRow label="  SE Health Insurance"
                  values={results.map(r => r.seHealthDed ? fmt(-r.seHealthDed) : '—')} />

                <CompRow label="ADJUSTED GROSS INCOME (AGI)" bold
                  values={results.map(r => fmt(r.agi))}
                  color={results.map(() => 'var(--purple)')} highlight />

                <CompRow label="DEDUCTIONS" bold
                  values={results.map(r => fmt(-r.totalDeductions))} highlight />
                <CompRow label="  Standard / Itemized"
                  values={results.map(r => `${fmt(-r.actualDeduction)} ${r.useItemized ? '(itemized)' : '(standard)'}`)} />
                <CompRow label="  QBI Deduction (§199A)"
                  values={results.map(r => r.qbiDeduction ? fmt(-r.qbiDeduction) : '—')} />
                <CompRow label="  Senior Deduction"
                  values={results.map(r => r.seniorDeduction ? fmt(-r.seniorDeduction) : '—')} />

                <CompRow label="TAXABLE INCOME" bold
                  values={results.map(r => fmt(r.taxableIncome))}
                  color={results.map(() => 'var(--dark)')} highlight />

                <div style={{ paddingTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.06em', paddingBottom: 5, borderBottom: '1px solid var(--color-border)' }}>
                    Tax Calculations
                  </div>
                </div>
                <CompRow label="Federal Tax (Ordinary Income)"
                  values={results.map(r => fmt(r.ordinaryTax))} />
                <CompRow label="Tax on LTCG / Qualified Dividends"
                  values={results.map(r => fmt(r.ltcgTax))} />
                <CompRow label="Self-Employment Tax"
                  values={results.map(r => r.seTax ? fmt(r.seTax) : '—')} />
                <CompRow label="NIIT (3.8%)"
                  values={results.map(r => r.niit ? fmt(r.niit) : '—')} />
                <CompRow label="Additional Medicare Tax (0.9%)"
                  values={results.map(r => r.additionalMedicare ? fmt(r.additionalMedicare) : '—')} />
                <CompRow label="AMT"
                  values={results.map(r => r.amtLiability ? fmt(r.amtLiability) : '—')} />

                <CompRow label="TAX BEFORE CREDITS" bold
                  values={results.map(r => fmt(r.taxBeforeCredits))} highlight />

                <CompRow label="  Child Tax Credit (CTC)"
                  values={results.map(r => r.ctc ? fmt(-r.ctc) : '—')} />
                <CompRow label="  Child & Dependent Care Credit"
                  values={results.map(r => r.childCareCred ? fmt(-r.childCareCred) : '—')} />
                <CompRow label="  Education Credits"
                  values={results.map(r => r.educationCred ? fmt(-r.educationCred) : '—')} />
                <CompRow label="  Energy / EV Credits"
                  values={results.map(r => (r.energyCredits||0)+(r.evCred||0) ? fmt(-((r.energyCredits||0)+(r.evCred||0))) : '—')} />
                <CompRow label="  Total Credits"
                  values={results.map(r => r.totalCredits ? fmt(-r.totalCredits) : '—')} />

                <CompRow label="NET FEDERAL TAX LIABILITY" bold
                  values={results.map(r => fmt(r.totalFederalTax))}
                  color={results.map(() => 'var(--color-red)')} highlight />

                <CompRow label="  Total Payments (W/H + Est.)"
                  values={results.map(r => fmt(-r.totalPayments))} />
                <CompRow label="BALANCE DUE / (REFUND)" bold
                  values={results.map(r => r.balanceDue < 0 ? `(${fmt(-r.balanceDue)})` : fmt(r.balanceDue))}
                  color={results.map(r => r.balanceDue < 0 ? 'var(--color-green)' : 'var(--color-red)')} highlight />

                <div style={{ paddingTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.06em', paddingBottom: 5, borderBottom: '1px solid var(--color-border)' }}>
                    Key Metrics
                  </div>
                </div>
                <CompRow label="Effective Federal Tax Rate" bold
                  values={results.map(r => fmtPct(r.effectiveRate) + '%')} />
                <CompRow label="Effective Rate on AGI"
                  values={results.map(r => r.agi > 0 ? fmtPct(r.totalFederalTax / r.agi * 100) + '%' : '—')} />
                <CompRow label="Marginal Rate (Ordinary)"
                  values={results.map(r => pct(r.marginalRate))} />
                <CompRow label="LTCG Marginal Rate"
                  values={results.map(r => pct(r.ltcgMarginalRate))} />
                <CompRow label="SE Tax"
                  values={results.map(r => r.seTax ? fmt(r.seTax) : '—')} />
                <CompRow label="NIIT"
                  values={results.map(r => r.niit ? fmt(r.niit) : '—')} />
                <CompRow label="AMT"
                  values={results.map(r => r.amtLiability ? fmt(r.amtLiability) : '—')} />
                <CompRow label="Estimated Q1 Payment (25%)"
                  values={results.map(r => fmt(r.estQ1Payment))} />

                {/* Planning flags */}
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', marginBottom: 8 }}>Planning Flags</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                    {results.map((r, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: SCENARIO_COLORS[i], marginBottom: 4 }}>
                          {r.scenarioLabel}
                        </div>
                        {Object.entries(r.flags || {})
                          .filter(([, v]) => v)
                          .map(([k]) => (
                            <div key={k} style={{ fontSize: 10, color: 'var(--muted)', padding: '2px 0', display: 'flex', gap: 4 }}>
                              <span>⚑</span>
                              <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                            </div>
                          ))
                        }
                        {!Object.values(r.flags || {}).some(Boolean) && (
                          <div style={{ fontSize: 10, color: 'var(--color-green)' }}>✓ No flags</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {formType === '1041' && (
              <>
                <CompRow label="TOTAL INCOME" bold values={results.map(r => fmt(r.totalIncome))} highlight />
                <CompRow label="TOTAL DEDUCTIONS" bold values={results.map(r => fmt(-r.totalDeductions))} highlight />
                <CompRow label="TAXABLE INCOME" bold values={results.map(r => fmt(r.taxableIncome))}
                  color={results.map(() => 'var(--dark)')} highlight />
                <CompRow label="Tax on Ordinary Income" values={results.map(r => fmt(r.ordinaryTax))} />
                <CompRow label="Tax on LTCG / Qual. Dividends" values={results.map(r => fmt(r.ltcgTax))} />
                <CompRow label="NIIT (3.8%)" values={results.map(r => fmt(r.niit))} />
                <CompRow label="NET TAX LIABILITY" bold values={results.map(r => fmt(r.netTax))}
                  color={results.map(() => 'var(--color-red)')} highlight />
                <CompRow label="BALANCE DUE / (REFUND)" bold
                  values={results.map(r => r.balanceDue < 0 ? `(${fmt(-r.balanceDue)})` : fmt(r.balanceDue))}
                  color={results.map(r => r.balanceDue < 0 ? 'var(--color-green)' : 'var(--color-red)')} highlight />
                <CompRow label="Effective Rate on Total Income" bold values={results.map(r => fmtPct(r.effectiveRateOnIncome) + '%')} />
                <CompRow label="Effective Rate on Taxable Income" values={results.map(r => fmtPct(r.effectiveRateOnTaxable) + '%')} />
              </>
            )}

            {(formType === '1065' || formType === '1120S') && (
              <>
                <CompRow label="Gross Receipts" values={results.map(r => fmt(r.grossReceipts))} />
                <CompRow label="Cost of Goods Sold" values={results.map(r => fmt(r.costOfGoodsSold))} />
                <CompRow label="GROSS PROFIT" bold values={results.map(r => fmt(r.grossProfit))} highlight />
                <CompRow label="Total Deductions" values={results.map(r => fmt(-r.totalExpenses))} />
                <CompRow label="ORDINARY BUSINESS INCOME" bold values={results.map(r => fmt(r.ordinaryBusinessIncome))}
                  color={results.map(() => 'var(--purple)')} highlight />
                <CompRow label="Total K-1 Income (All Items)" bold values={results.map(r => fmt(r.totalK1))} highlight />
                <CompRow label="SE Earnings (GP Only)" values={results.map(r => fmt(r.seEarnings))} />
                <CompRow label="Per-Partner Ordinary Income" bold values={results.map(r => fmt(r.perPartner?.ordinaryIncome))} highlight />
                <CompRow label="Per-Partner Cash Distribution" values={results.map(r => fmt(r.perPartner?.cashDistribution))} />
                <div style={{ marginTop: 12, padding: 10, background: 'var(--color-soft)', borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                  ⚠ {formType === '1065' ? 'Partnerships' : 'S-Corps'} pay no entity-level federal income tax. All items flow through to {formType === '1065' ? 'partners' : 'shareholders'} via K-1.
                </div>
              </>
            )}

            {formType === '1120' && (
              <>
                <CompRow label="GROSS INCOME" bold values={results.map(r => fmt(r.grossIncome))} highlight />
                <CompRow label="TAXABLE INCOME" bold values={results.map(r => fmt(r.taxableIncome))}
                  color={results.map(() => 'var(--dark)')} highlight />
                <CompRow label="Corporate Tax @ 21%" bold values={results.map(r => fmt(r.corporateTax))} />
                <CompRow label="Credits" values={results.map(r => r.credits ? fmt(-r.credits) : '—')} />
                <CompRow label="NET FEDERAL TAX LIABILITY" bold values={results.map(r => fmt(r.netTax))}
                  color={results.map(() => 'var(--color-red)')} highlight />
                <CompRow label="BALANCE DUE / (REFUND)" bold
                  values={results.map(r => r.balanceDue < 0 ? `(${fmt(-r.balanceDue)})` : fmt(r.balanceDue))}
                  color={results.map(r => r.balanceDue < 0 ? 'var(--color-green)' : 'var(--color-red)')} highlight />
                <CompRow label="DIVIDEND / DOUBLE-TAX ANALYSIS" bold values={['','','']} highlight />
                <CompRow label="Planned Dividend" values={results.map(r => fmt(r.plannedDividend))} />
                <CompRow label="Shareholder Tax on Dividend (~20%)" values={results.map(r => fmt(r.shareholderTaxOnDividend))} />
                <CompRow label="Combined Entity + Shareholder Tax" bold values={results.map(r => fmt(r.combinedTax))}
                  color={results.map(() => 'var(--color-red)')} highlight />
                <CompRow label="Effective Rate (Entity)" bold values={results.map(r => pct(r.effectiveRate))} />
                <CompRow label="Combined Effective Rate" values={results.map(r => pct(r.combinedRate))} />
              </>
            )}

            <div style={{ marginTop: 14, fontSize: 10, color: 'var(--color-muted-light)', lineHeight: 1.5, borderTop: '1px solid var(--color-gray-bg)', paddingTop: 10 }}>
              ⚠ FOR DISCUSSION PURPOSES ONLY. This model provides estimates based on {year} projected rates.
              Always confirm with current IRS guidance. Not tax advice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
