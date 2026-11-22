// Fast dollar formatter — see ScenarioProjections for rationale
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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { supabase } from '../../lib/supabase';
import { identifierError } from '../../utils/pii';
import { FEATURES } from '../../config/features';
import { saveDraft, loadDraft, clearDraft } from '../../utils/drafts';
import ScopeNotice from '../../components/ui/ScopeNotice';
import { calcIRMAA, SUPPORTED_TAX_YEARS,
  calcFullFederalTax, taxOptionsFor, getStandardDeduction, getMarginalRate,
  getBracketHeadroom, analyzeRothConversion, filingKey,
  getBracketsForYear,
} from '../../utils/taxEngine';
import { buildProjectionInputs } from '../../utils/projectionInputs';

// Strips browser/filesystem duplicate-upload suffixes like " (2)" and the
// .pdf extension, so an unlinked return at least shows a clean label
// instead of the raw filename a user never typed.
function cleanFilename(name) {
  if (!name) return '';
  return name.replace(/\s*\(\d+\)/g, '').replace(/\.pdf$/i, '');
}

// Keep only finite numbers, short strings and boolean flags — the server rejects anything else (it never silently drops fields).
function cleanFigures(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    if (k === 'flags') { out.flags = Object.fromEntries(Object.entries(v || {}).filter(([, x]) => typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)))); continue; }
    if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : 0;
    else if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;      // aged, is_sstb (were silently dropped)
  }
  return out;
}
const FILING_STATUSES = ['Single', 'Married filing jointly', 'Married filing separately', 'Head of household', 'Qualifying surviving spouse'];

// ── PDF Summary Export ────────────────────────────────────────────────────────
// Generates a branded one-page HTML document and triggers print-to-PDF.
// No server call, no credit consumed — pure client-side from existing projection
// data. CPAs can hand this to a client in a meeting or attach to an email.
function exportSummaryPDF(r, pd, projection, roth, flagDefs, fmt, firmNameIn) {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clientName = esc(r.clients?.name || r.file_name?.replace(/\.pdf$/i,'') || 'Client');
  const priorYear  = Number(r.tax_year || pd.tax_year) || new Date().getFullYear() - 1;
  const projYear   = priorYear + 1;
  const firmName   = esc(firmNameIn || 'Your Tax Advisor');
  const diff       = projection.totalFederalTax - (pd.federal_tax || 0);

  const row = (label, value, bold = false, color = '') =>
    `<tr><td style="color:#6B698A;padding:7px 0;font-size:12px;border-bottom:1px solid #F0EEF8">${esc(label)}</td>
     <td style="text-align:right;padding:7px 0;font-size:12px;font-weight:${bold?700:500};color:${color||'#1A1230'};border-bottom:1px solid #F0EEF8">${value}</td></tr>`;

  const flagsHTML = flagDefs.length > 0
    ? flagDefs.map(f => `
        <div style="display:flex;gap:10px;padding:8px 12px;border-radius:8px;background:#F7F6FF;margin-bottom:6px;align-items:flex-start">
          <span style="width:8px;height:8px;border-radius:50%;background:${f.color || '#6B5CE7'};margin-top:5px;flex-shrink:0"></span>
          <div><div style="font-size:12px;font-weight:700;color:#1A1230">${esc(f.label)}</div>
          <div style="font-size:11px;color:#6B698A;margin-top:2px;line-height:1.5">${esc(f.detail)}</div></div>
        </div>`).join('')
    : '<p style="font-size:12px;color:#6B698A">No planning flags for this return.</p>';

  const rothHTML = roth.bracketHeadroom > 0
    ? `<div style="background:#EEEAFF;border-radius:10px;padding:12px 14px;margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:#6B5CE7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Roth Conversion Opportunity</div>
        <div style="font-size:12px;color:#1A1230">Current bracket: <strong>${(roth.currentMarginalRate*100).toFixed(0)}%</strong> · Headroom: <strong>${fmt(roth.bracketHeadroom)}</strong></div>
        ${roth.scenarios.filter(s=>s.amount>0&&s.amount<=500000).slice(0,2).map(s =>
          `<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
            <span style="color:#6B698A">${esc(s.label)}</span>
            <span style="font-weight:700;color:#1A1230">${fmt(s.taxCost)} tax cost (${s.effectiveConversionRate}%)</span>
           </div>`
        ).join('')}
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tax Summary — ${esc(clientName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',Arial,sans-serif;color:#1A1230;background:#fff;padding:32px 40px;font-size:13px}
  @media print{body{padding:16px 24px}@page{size:letter;margin:.5in}}
  h2{font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:-.3px}
  table{width:100%;border-collapse:collapse}
</style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #6B5CE7;margin-bottom:20px">
    <div>
      <h2>${esc(clientName)}</h2>
      <div style="font-size:12px;color:#6B698A;margin-top:4px">Tax Year ${priorYear} Return · ${projYear} Projection</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700;color:#1A1230">${esc(firmName)}</div>
      <div style="font-size:11px;color:#6B698A;margin-top:3px">Prepared by your tax advisor</div>
      <div style="font-size:10px;color:#A0A0C0;margin-top:2px">Prepared with TaxStory</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
    <!-- Prior year summary -->
    <div>
      <div style="font-size:10px;font-weight:800;color:#6B698A;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">${priorYear} Actual Return</div>
      <table>
        ${row('Total income',    fmt(pd.total_income))}
        ${row('Federal tax',     fmt(pd.federal_tax), true)}
        ${row('Effective rate',  pd.effective_rate != null ? `${pd.effective_rate}%` : '—')}
        ${row('Refund / Owed',   pd.refund_or_owed == null ? '—' : pd.refund_or_owed >= 0 ? `${fmt(pd.refund_or_owed)} refund` : `${fmt(Math.abs(pd.refund_or_owed))} owed`,
               false, pd.refund_or_owed >= 0 ? '#065F46' : '#991B1B')}
        ${row('Filing status',   pd.filing_status || '—')}
      </table>
    </div>
    <!-- Next year projection -->
    <div style="background:#1A1230;border-radius:12px;padding:16px;color:#fff">
      <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">${projYear} Projection (estimated)</div>
      <div style="font-family:Georgia,serif;font-size:28px;font-weight:700;line-height:1;margin-bottom:3px">${fmt(projection.totalFederalTax)}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.45);margin-bottom:14px">estimated federal tax</div>
      <table>
        <tr><td style="font-size:11px;color:rgba(255,255,255,.5);padding:5px 0">vs prior year</td>
            <td style="text-align:right;font-size:11px;font-weight:700;padding:5px 0;color:${diff>=0?'#E24B4A':'#1baf7a'}">${diff>=0?'+':'−'}${fmt(Math.abs(diff))}</td></tr>
        <tr><td style="font-size:11px;color:rgba(255,255,255,.5);padding:5px 0">Effective rate</td>
            <td style="text-align:right;font-size:11px;font-weight:700;padding:5px 0;color:#AFA9EC">${projection.effectiveRate}%</td></tr>
        <tr><td style="font-size:11px;color:rgba(255,255,255,.5);padding:5px 0">Marginal bracket</td>
            <td style="text-align:right;font-size:11px;font-weight:700;padding:5px 0">${(projection.marginalRate*100).toFixed(0)}%</td></tr>
        <tr><td style="font-size:11px;color:rgba(255,255,255,.5);padding:5px 0">Bracket headroom</td>
            <td style="text-align:right;font-size:11px;font-weight:700;padding:5px 0;color:#FFD60A">${fmt(projection.bracketHeadroom)}</td></tr>
      </table>
    </div>
  </div>

  <!-- Planning flags -->
  <div style="margin-bottom:20px">
    <div style="font-size:10px;font-weight:800;color:#6B698A;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Planning Opportunities</div>
    ${flagsHTML}
    ${rothHTML}
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #E2DFF8;padding-top:12px;margin-top:4px;display:flex;justify-content:space-between;font-size:10px;color:#A0A0C0">
    <span>This summary is for informational purposes only and does not constitute tax advice.</span>
    <span>Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return false;                       // pop-up blocked
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
  return true;
}

const EMPTY_FORM = {
  name:'', year: String(Math.min(Math.max(new Date().getFullYear() - 1, SUPPORTED_TAX_YEARS[0]), SUPPORTED_TAX_YEARS[SUPPORTED_TAX_YEARS.length - 1])), status:'Married filing jointly', isSSBT: false, w2WagesPaid: 0, qualPropBasis: 0,
  // Income — expanded
  wages:0, spouseWages:0, business:0, partnershipK:0,
  ordDividends:0, qualDividends:0, interest:0,
  ltcg:0, stcg:0, rentalNet:0,
  pension:0, socialSecurity:0, capGains:0, other:0,
  tips:0, overtime:0,
  // Deductions
  deduction:'standard', itemizedAmt:0,
  saltIncome:0, propertyTax:0, mortgage:0, charity:0, medical:0,
  seHealthInsurance:0, estimatedPayments:0, withholding:0,
  // Personal
  children:0, otherDependents:0, eicChildren:'', aged:false,
};

import { useConfirm } from '../../components/ui/ConfirmProvider';
import { readReturnPdf } from '../../utils/pdfExtract';
import { callFunction } from '../../utils/callFunction';
import { downloadRecords } from '../../utils/records';
import { FIELD_LABELS } from '../../utils/form1040Parser';
import { EmptyState, Button } from '../../components/ui';
import { FileText, Plus, SearchX } from 'lucide-react';
import { Icon, IconLabel } from '../../components/Icon';

export default function CPAProjections() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const { creditsRemaining = 0, packCreditsBalance = 0, tier } = useSubscription() || {};
  const isBasicTier = tier === 'cpa_basic' || tier === 'ria_basic';
  const totalCredits = creditsRemaining + packCreditsBalance;
  const [searchParams] = useSearchParams();

  const [view, setView]           = useState('list');
  const [returns, setReturns]     = useState([]);
  const [selected, setSelected]   = useState(null);
  // "Adjust next year": what-if changes applied to the projection only (never saved, reset per return).
  const NO_ADJ = { wagePct: 0, bizPct: 0, invPct: 0, retPct: 0, capGains: '', children: '', capLossCarry: '', yearsOut: 1 };
  const [projAdj, setProjAdj]     = useState(NO_ADJ);
  useEffect(() => { setProjAdj(NO_ADJ); }, [selected?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [file, setFile]           = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [parsing, setParsing]         = useState(false);
  const [parsePreview, setParsePreview] = useState(null);
  const [parseStep, setParseStep]       = useState('');   // 'reading'|'reviewing'|''
  const [error, setError]             = useState('');
  const [search, setSearch]       = useState('');
  const [dragging, setDragging]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [clientsList, setClientsList] = useState([]);
  const [uploadClientId, setUploadClientId] = useState('');
  const [uploadClientName, setUploadClientName] = useState('');
  const [reparseId, setReparseId]       = useState(null);    // set when re-importing figures into an existing return (no new charge)
  const [savingPreview, setSavingPreview] = useState(false);
  const [ackVerified, setAckVerified]   = useState(false);   // required before saving anything the reader could not fully confirm

  // Pre-select client if navigated from client detail page
  useEffect(() => {
    const preId = searchParams.get('clientId');
    if (preId && clientsList.length > 0) {
      const match = clientsList.find(c => c.id === preId);
      if (match) { setUploadClientId(preId); setUploadClientName(''); }
    }
  }, [searchParams, clientsList]);
  const fileRef = useRef();
  const [firmName, setFirmName]   = useState('');
  const [exportMsg, setExportMsg] = useState('');

  // Firm name for client-facing exports (same source Settings and the share email use)
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('firm_name').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.firm_name) setFirmName(data.firm_name); });
  }, [user]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  const upd = k => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => {
      const next = {...f, [k]: val};
      // Persist draft to localStorage so form survives navigation away and back
      // The draft holds figures only — the client's name is deliberately NOT persisted in the browser.
      { const { name: _omit, ...figuresOnly } = next; saveDraft('taxstory_projection_draft', figuresOnly); }   // eslint-disable-line no-unused-vars
      return next;
    });
  };

  // Restore draft on mount (only for manual entry — not after a successful parse)
  // Cleared when a projection is saved or the form is explicitly reset.
  useEffect(() => {
    try {
      const parsed = loadDraft('taxstory_projection_draft');   // expires after 24 hours; legacy un-timestamped drafts are discarded
      if (parsed) {
        // Only restore if it looks like a non-empty manual entry
        if (parsed && (parsed.wages > 0 || parsed.business > 0 || parsed.other > 0 || parsed.pension > 0 || parsed.socialSecurity > 0 || parsed.ordDividends > 0 || parsed.rentalNet > 0 || parsed.isSSBT)) {
          setForm(parsed);
        }
      }
    } catch {}
  }, []); // run once on mount

  // Live estimate — memoized so it only recomputes when form values change,
  // not on unrelated state updates (file drag, upload progress, search, etc.)
  const projYear   = +form.year || new Date().getFullYear();
  const liveResult = useMemo(() => calcFullFederalTax({
    wages:                +form.wages    || 0,
      isSSBT:               form.isSSBT    || false,
      w2WagesPaid:          +form.w2WagesPaid || 0,
      qualPropBasis:        +form.qualPropBasis || 0,
    spouseWages:          +form.spouseWages || 0,
    businessIncome:       +form.business || 0,
    partnershipKIncome:   +form.partnershipK || 0,
    rentalIncome:         +form.rentalNet || 0,
    ordinaryDividends:    +form.ordDividends || 0,
    qualifiedDividends:   +form.qualDividends || 0,
    interestIncome:       +form.interest || 0,
    ltcg:                 +form.ltcg || 0,
    stcg:                 +form.stcg || 0,
    pensionDistributions: +form.pension || 0,
    socialSecurity:       +form.socialSecurity || 0,
    otherIncome:          +form.other || 0,
    tipIncome:            +form.tips || 0,
    overtimeIncome:       +form.overtime || 0,
    filingStatus:         form.status,
    children:             +form.children || 0,
    otherDependents:      +form.otherDependents || 0,
    ...(form.eicChildren !== '' && form.eicChildren != null ? { eicChildren: +form.eicChildren || 0 } : {}),
    // Deductions
    ...(form.deduction === 'itemized' ? {
      saltIncomeTaxesPaid:      +form.saltIncome || 0,
      propertyTaxesPaid:        +form.propertyTax || 0,
      mortgageInterestPrimary:  +form.mortgage || 0,
      cashCharity:              +form.charity || 0,
      medicalExpenses:          +form.medical || 0,
    } : {}),
    seHealthInsurance:  +form.seHealthInsurance || 0,
    aged:               form.aged || false,
    // Payments
    federalWithholding:   +form.withholding || 0,
    estimatedPayments:    +form.estimatedPayments || 0,
  }, projYear, taxOptionsFor(projYear)), [
    form.wages, form.spouseWages, form.business, form.partnershipK,
    form.rentalNet, form.ordDividends, form.qualDividends, form.interest,
    form.ltcg, form.stcg, form.pension, form.socialSecurity, form.other,
    form.tips, form.overtime, form.status, form.children, form.otherDependents, form.eicChildren,
    form.deduction, form.saltIncome, form.propertyTax, form.mortgage,
    form.charity, form.medical, form.seHealthInsurance,
    form.aged, form.withholding, form.estimatedPayments, projYear,
  ]);
  const totalIncome = liveResult.grossIncome;
  const taxableInc  = liveResult.taxableIncome;
  const estTax      = liveResult.totalFederalTax;
  const effRate     = liveResult.effectiveRate;
  const margBracket = liveResult.marginalRate;
  const bracketRoom = liveResult.bracketHeadroom;
  const refundOwed  = -liveResult.balanceDue;   // the engine's own balance: every payment and the refundable credits (it used to recompute withholding + estimates - tax)
  const deduction   = liveResult.actualDeduction;
  const liveFlags   = liveResult.flags || {};

  useEffect(() => { if (view !== 'new') setReparseId(null); }, [view]);

  useEffect(() => {
    if (!user) return;
    fetchReturns();
    supabase.from('clients').select('id,name').eq('user_id', user.id).order('name').then(({data}) => setClientsList(data || []));
  }, [user]);

  async function fetchReturns() {
    setLoading(true);
    const { data } = await supabase
      .from('tax_returns')
      .select('*, clients(name,email,type)')
      .eq('user_id', user.id)
      .is('parsed_data->scenarios', null)   // saved scenario comparisons are not returns (status alone is not enough: it changes when a walkthrough is made)
      .order('created_at', { ascending: false });
    setReturns(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Client name is required.'); return; }
    setSaving(true); setError('');
    try {
      // Projections are created by a function that charges the allowance (browsers cannot insert them directly).
      const figures = cleanFigures({
        filing_status: form.status, wages: +form.wages, business_income: +form.business, capital_gains: +form.capGains,
        tip_income: +form.tips || 0, overtime_income: +form.overtime || 0, other_income: +form.other,
        total_income: liveResult.grossIncome, agi: liveResult.agi, standard_deduction: liveResult.actualDeduction,
        senior_deduction: liveResult.seniorDeduction || 0, qbi_deduction: liveResult.qbiDeduction || 0,
        taxable_income: liveResult.taxableIncome, federal_tax: liveResult.totalFederalTax, se_tax: liveResult.seTax || 0,
        niit: liveResult.niit || 0, amt_liability: liveResult.amtLiability || 0, effective_rate: liveResult.effectiveRate,
        marginal_rate: liveResult.marginalRate, bracket_headroom: liveResult.bracketHeadroom, withholding: +form.withholding,
        refund_or_owed: Math.round(refundOwed), tax_year: +form.year, flags: liveResult.flags,
        // Every input, so next year's projection and the narration see the whole return (only ~10 inputs were kept before).
        spouse_wages: +form.spouseWages || 0, partnership_k: +form.partnershipK || 0, interest: +form.interest || 0,
        ordinary_dividends: +form.ordDividends || 0, qualified_dividends: +form.qualDividends || 0, ltcg: +form.ltcg || 0, stcg: +form.stcg || 0,
        rental_income: +form.rentalNet || 0, pensions: +form.pension || 0, social_security: +form.socialSecurity || 0,
        taxable_social_security: Math.round(liveResult.taxableSS || 0),   // narrated amount (social_security is the gross benefit)
        children: Math.max(0, Math.min(30, Math.round(+form.children || 0))), aged: !!form.aged,
        other_dependents: Math.max(0, Math.min(30, Math.round(+form.otherDependents || 0))),
        ...(form.eicChildren !== '' && form.eicChildren != null ? { eic_children: Math.max(0, Math.min(30, Math.round(+form.eicChildren || 0))) } : {}),
        eic: Math.round(liveResult.eic || 0), actc: Math.round(liveResult.additionalChildTaxCredit || 0),
        cap_loss_carry_st: liveResult.capitalLossCarryoverST || 0, cap_loss_carry_lt: liveResult.capitalLossCarryoverLT || 0,   // carried into next year's projection
        deduction_type: form.deduction === 'itemized' ? 'itemized' : 'standard', itemized_amount: +form.itemizedAmt || 0,
        salt_income: +form.saltIncome || 0, property_tax: +form.propertyTax || 0, mortgage: +form.mortgage || 0, charity: +form.charity || 0,
        medical: +form.medical || 0, se_health_insurance: +form.seHealthInsurance || 0, estimated_payments: +form.estimatedPayments || 0,
        is_sstb: !!form.isSSBT, w2_wages_paid: +form.w2WagesPaid || 0, qual_prop_basis: +form.qualPropBasis || 0,
      });
      const out = await callFunction('save-return', { source: 'manual', figures, taxYear: +form.year, clientName: form.name.trim() });
      await fetchReturns();
      const { data: row } = await supabase.from('tax_returns').select('*, clients(name,email,type)').eq('id', out.id).single();
      setSelected(row); setView('detail');
      clearDraft('taxstory_projection_draft');
    } catch(e) { setError(e.message); } finally { setSaving(false); }
  }

  const handleFileDrop = useCallback(f => {
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('Only PDF files accepted.'); return; }
    if (f.size > 25*1024*1024)        { setError('File must be under 25 MB.'); return; }
    setError(''); setFile(f);
  }, []);

  // The PDF is read INSIDE this browser tab (pdf.js + a deterministic Form 1040 parser). It is never uploaded or stored; no
  // names, SSNs, addresses or bank details are read. Only the dollar figures the advisor confirms are sent to the server.
  async function handleUploadParse() {
    if (!file || !user) return;
    setError(''); setParsing(true); setParseStep('reading');
    try {
      const result = await readReturnPdf(file);
      setParseStep('reviewing');
      setAckVerified(false);
      setParsePreview({ result, data: { ...result.figures } });
      if (result.quality === 'insufficient') setError('Very little could be read from this PDF. Use a PDF exported from your tax software (not a scan), or enter the figures manually below.');
    } catch (e) {
      setError(e.message); setParseStep('');
    } finally { setParsing(false); }
  }

  async function saveParsed() {
    if (!parsePreview) return;
    const d = parsePreview.data;
    if (!d.filingStatus || !d.taxYear) { setError('Choose the filing status and tax year before saving.'); return; }
    if (parsePreview.result.quality !== 'good' && !ackVerified) { setError('Please confirm you have compared the figures with the return.'); return; }
    setSavingPreview(true); setError('');
    try {
      const out = await callFunction('save-return', {
        source: 'pdf', figures: cleanFigures(d),
        clientId: uploadClientId || undefined,
        clientName: !uploadClientId && uploadClientName.trim() ? uploadClientName.trim() : undefined,
        replaceId: reparseId || undefined,
      });
      await fetchReturns();
      const { data: row } = await supabase.from('tax_returns').select('*, clients(name,email,type)').eq('id', out.id).single();
      setSelected(row); setParsePreview(null); setFile(null); setReparseId(null); setParseStep(''); setView('detail');
    } catch (e) { setError(e.message); } finally { setSavingPreview(false); }
  }

  async function exportRecords(r) {
    try { await downloadRecords({ taxReturnId: r.id, label: r.file_name || 'return' }); }
    catch (e) { setError(e.message); }
  }
  async function handleDelete(id) {
    if (!(await confirm({ title: 'Delete this projection?', message: 'This permanently deletes the projection and its walkthrough audio, PDF summary and share links. This cannot be undone.'+
      ' Your approval records are reduced to a log with no figures, names or notes (kind, version and time only) — use “Download records” first if you need a copy.', confirmLabel: 'Delete permanently' }))) return;
    try {
      // Files are removed first, then the rows (see netlify/functions/delete-data.js) — so nothing is left behind.
      await callFunction('delete-data', { kind: 'return', id });
      setReturns(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) { setSelected(null); setView('list'); }
      await fetchReturns();
    } catch (e) { setError(e.message); }
  }

  // NaN-safe formatter — returns '—' for null/undefined/NaN, '$0' for zero
  const fmt = v => {
    if (v == null) return '—';
    const n = Number(v);
    if (isNaN(n)) return '—';
    return `$${Math.round(n).toLocaleString()}`;
  };

  const filtered = returns.filter(r => !search || r.file_name?.toLowerCase().includes(search.toLowerCase()) || r.clients?.name?.toLowerCase().includes(search.toLowerCase()));

  // Normalize parsed_data — the PDF reader (form1040Parser) uses camelCase keys,
  // the manual entry form uses snake_case. This maps both to a single canonical set.
  function normalizeParsed(raw) {
    if (!raw) return {};
    return {
      // Identity — pass through snake_case fields if already present
      filing_status:    raw.filing_status    ?? raw.filingStatus    ?? null,
      tax_year:         raw.tax_year         ?? raw.taxYear         ?? null,
      wages:            raw.wages            ?? raw.wages_salaries  ?? raw.totalWages ?? null,
      business_income:  raw.business_income  ?? raw.scheduleC_netProfit ?? null,
      capital_gains:    raw.capital_gains    ?? raw.capitalGainLoss ?? raw.capital_gains_long ?? null,
      other_income:     raw.other_income     ?? raw.otherIncome     ?? null,
      total_income:     raw.total_income     ?? raw.totalIncome     ?? null,
      agi:              raw.agi              ?? raw.agi             ?? raw.adjusted_gross_income ?? null,
      standard_deduction: raw.standard_deduction ?? raw.standardDeduction ?? null,
      itemized_deductions: raw.itemized_deductions ?? raw.itemizedDeductions ?? null,
      taxable_income:   raw.taxable_income   ?? raw.taxableIncome   ?? null,
      federal_tax:      raw.federal_tax      ?? raw.totalTax        ?? raw.regularTax   ?? raw.total_tax ?? null,
      effective_rate:   raw.effective_rate   ?? (raw.effectiveRate != null ? +(raw.effectiveRate * 100).toFixed(1) : null),
      withholding:      raw.withholding      ?? raw.federalWithheld ?? null,
      estimated_payments: raw.estimated_payments ?? raw.estimatedTaxPayments ?? null,
      // Normalize refund/owed into a single signed field
      refund_or_owed: raw.refund_or_owed != null
        ? raw.refund_or_owed
        : raw.refund != null && raw.refund > 0
          ? raw.refund
          : raw.amountOwed != null && raw.amountOwed > 0
            ? -raw.amountOwed
            : raw.amount_owed != null && raw.amount_owed > 0
              ? -raw.amount_owed
              : null,
      // Pass through extras
      qbi_deduction:  raw.qbi_deduction  ?? raw.qbiDeduction        ?? null,
      se_tax:         raw.se_tax         ?? raw.selfEmploymentTax    ?? null,
      amt:            raw.amt            ?? raw.alternativeMinTax    ?? null,
      dependents:     raw.dependents     ?? raw.number_of_dependents ?? null,
    };
  }

  const pd = normalizeParsed(selected?.parsed_data);

  // ── LIST ──
  if (view === 'list') return (
    <div className="ts-page">
      <div className="ts-hrow">
        <div><div className="ts-page-title">Tax Projections</div><div className="ts-page-sub">Tax analysis from completed returns</div></div>
        <button className="ts-btn ts-btn-primary" onClick={() => { setForm(EMPTY_FORM); setFile(null); setError(''); setView('new'); }}>+ New projection</button>
      </div>
      <div className="ts-g3">
        {[
          { l:'Total returns', v: loading ? '—' : returns.length },
          { l:'Avg effective rate', v: loading ? '—' : returns.length ? (returns.reduce((s,r) => {
              const pd = r.parsed_data || {};
              const rate = pd.effective_rate ?? (pd.effectiveRate != null ? pd.effectiveRate * 100 : 0);
              return s + rate;
            }, 0) / returns.length).toFixed(1)+'%' : '—' },
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
        {loading ? <div className="ts-loading" role="status">Loading…</div>
        : filtered.length === 0 ? (
          search
            ? <EmptyState icon={SearchX} size="sm" title="No matches" body={`Nothing matches “${search}”.`} />
            : <EmptyState icon={FileText} title="No projections yet" body="Import a client's return PDF. It is read on this device and never uploaded."
                action={<Button icon={Plus} onClick={()=>setView('new')}>Import first return</Button>} />
        ) : (
          <table className="ts-tbl">
            <thead><tr><th>Return / client</th><th>Tax year</th><th>Filing status</th><th>Federal tax</th><th>Eff. rate</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(r => {
                const p = normalizeParsed(r.parsed_data || {});
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="ts-rn">{r.clients?.name || cleanFilename(r.file_name) || 'Unnamed'}</div>
                      <div className="ts-rm">{r.file_name}</div>
                    </td>
                    <td>{r.tax_year || p.tax_year || '—'}</td>
                    <td><span className="ts-pill ts-p-gray">{p.filing_status?.split(' ').slice(-1)[0] || '—'}</span></td>
                    <td style={{fontWeight:700}}>{fmt(p.federal_tax)}</td>
                    <td>{p.effective_rate ? <span className="ts-pill ts-p-green">{p.effective_rate}%</span> : '—'}</td>
                    <td style={{display:'flex',gap:'6px'}}>
                      <button className="ts-btn ts-btn-ghost ts-btn-sm" onClick={()=>{setSelected(r);setView('detail');}}>View →</button>
                      <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={()=>exportRecords(r)}>Download records</button>
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
      <div className="ts-hrow"><div><div className="ts-page-title">New Tax Projection</div><div className="ts-page-sub">Import a return PDF (it stays on your device) or enter figures manually</div></div></div>
      <div className="ts-card" style={{marginBottom:'16px'}}>
        <div className="ts-card-title">{reparseId ? 'Re-import figures' : 'Import a return PDF'} <span className="ts-card-sub">read on your device · never uploaded</span></div>
        <div className={`ts-upload-zone${dragging?'':''}`}
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);handleFileDrop(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>handleFileDrop(e.target.files[0])} />
          {file
            ? <div><div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 6 }}><Icon name="file" size={24} /></div><div style={{fontWeight:600,color:'var(--dark)'}}>{file.name}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{(file.size/1024/1024).toFixed(2)} MB · PDF</div></div>
            : <div style={{color:'var(--muted)'}}><div className="ts-ico-tile ts-ico-tile-lg" style={{ marginBottom: 8 }}><Icon name="upload" size={24} /></div>Drop your PDF here or click to browse · Max 25 MB</div>}
        </div>
        {file && (
        <div className="ts-frow" style={{marginBottom:14}}>
          <label className="ts-fl" style={{fontSize:13,fontWeight:700,color:'var(--dark)',marginBottom:6}}>
            Step 1 — Which client is this for?
          </label>
          <label className="ts-fl">Link to client <span>a label is enough — initials or a nickname work</span></label>
            {clientsList.length > 0 ? (
              <select value={uploadClientId} onChange={e=>{setUploadClientId(e.target.value); if(e.target.value) setUploadClientName('');}} style={{marginBottom:'8px'}}>
                <option value="">— Select existing client —</option>
                {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div style={{padding:'9px 12px',background:'var(--bg)',border:'1px solid var(--border)',
                borderRadius:9,fontSize:12,color:'var(--muted)',marginBottom:8,lineHeight:1.6}}>
                No clients yet.{' '}
                <a href="/clients" style={{color:'var(--purple)',fontWeight:600,textDecoration:'none'}}>
                  Add a client →
                </a>{' '}
                or type a label below to link this return.
              </div>
            )}
            {!uploadClientId && (
              <input type="text" placeholder={clientsList.length > 0 ? 'Or type a new client name' : 'Client label (e.g. S. & M. Chen)'} value={uploadClientName} onChange={e=>setUploadClientName(e.target.value)} />
            )}
          </div>
        )}
        {error && <div className="ts-note ts-alert-danger ts-note-compact" role="alert" style={{ marginTop:'10px' }}>{error}</div>}
        {file && !uploading && !parsing && (
          <button className="ts-btn ts-btn-primary" style={{marginTop:'12px',width:'100%'}} onClick={handleUploadParse}>
            → Read return on this device
          </button>
        )}
        {(uploading || parsing) && (() => {
          const STEPS = [
            { key:'reading',   label:'Reading the PDF on your device…',          pct:60 },
            { key:'reviewing', label:'Checking the figures against each other…', pct:90 },
          ];
          const cur = STEPS.find(s => s.key === parseStep) || STEPS[0];
          return (
            <div style={{marginTop:12,padding:'14px 16px',background:'var(--bg)',borderRadius:11,border:'1px solid var(--color-purple-light)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:16,height:16,border:'2.5px solid var(--color-purple)',borderTopColor:'transparent',
                  borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}} />
                <span style={{fontSize:13,color:'var(--dark)',fontWeight:600}}>{cur.label}</span>
                <span style={{fontSize:12,color:'var(--purple)',marginLeft:'auto',fontWeight:700}}>{cur.pct}%</span>
              </div>
              <div style={{height:5,background:'var(--color-purple-light)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${cur.pct}%`,
                  background:'linear-gradient(90deg,var(--color-purple),var(--color-purple-grad))',
                  borderRadius:3,transition:'width .8s ease'}} />
              </div>
              <div style={{fontSize:11,color:'var(--muted-light)',marginTop:7}}>
                Usually a few seconds · nothing is uploaded
              </div>
            </div>
          );
        })()}
        {!uploading && !parsing && !parsePreview && (
          <div style={{marginTop:'10px',padding:'10px 12px',background:'var(--color-mint-light)',border:'1px solid var(--color-green-mint)',borderRadius:'8px',fontSize:'12px',color:'var(--color-green-deep)'}}>
            <Icon name="lock" /> Your PDF is read inside this browser tab and is never uploaded or saved. Names, SSNs, addresses and bank details are not read — only dollar figures, which you review before anything is saved.
          </div>
        )}
        <div className="ts-note ts-alert-info ts-note-compact" style={{ marginBottom:12 }}>
          <strong><Icon name="clipboard" /> Use digitally-generated PDFs</strong> from Drake, ProConnect, Lacerte, or CCH.
          Scanned or photographed documents cannot be read — the text must be embedded in the file.
        </div>
      </div>

      {/* ── Review panel: figures read ON THIS DEVICE. Nothing has been uploaded or saved yet. ── */}
      {parsePreview && (() => {
        const res = parsePreview.result, d = parsePreview.data;
        const fields = [...new Set([...(res.matched || []), 'totalIncome', 'agi', 'taxableIncome', 'totalTax', 'federalWithheld'])].filter(k => FIELD_LABELS[k]);
        const setField = (k, v) => setParsePreview(p => ({ ...p, data: { ...p.data, [k]: v === '' ? undefined : Number(v) } }));
        const tone = res.quality === 'good' ? ['var(--green-bg)', 'var(--green-dark)', '✓ Looks consistent — the figures add up the way the form says they should.']
          : res.quality === 'review' ? ['var(--amber-bg)', 'var(--color-amber-dark)', 'Please check carefully — some figures could not be confirmed against each other.']
          : ['var(--color-red-light)', 'var(--color-red-dark)', 'Too little could be read. Use a PDF exported from your tax software, or enter the figures manually.'];
        const shownChecks = res.checks.filter(c => c.status !== 'skip');
        return (
          <div style={{background:'var(--bg)',border:'1.5px solid var(--purple)',borderRadius:13,padding:'18px 20px',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'var(--dark)',marginBottom:6}}><Icon name="success" /> Return read on this device — check the figures</div>
                <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.6}}>
                  <Icon name="lock" /> Your PDF was read inside this browser tab. It has <strong>not</strong> been uploaded, and no names, SSNs or addresses were read.
                  Only the figures below are saved when you click Save.
                </div>
              </div>
              <button onClick={()=>{ setParsePreview(null); setFile(null); setParseStep(''); setError(''); }} aria-label="Close review" style={{background:'transparent',border:'none',color:'var(--muted)',fontSize:18,cursor:'pointer',lineHeight:1}}>×</button>
            </div>
            <div style={{margin:'8px 0 12px',padding:'7px 11px',borderRadius:7,fontSize:12,fontWeight:500,background:tone[0],color:tone[1]}}>{tone[2]}</div>
            {shownChecks.length > 0 && (
              <div style={{marginBottom:12,display:'flex',flexDirection:'column',gap:4}}>
                {shownChecks.map(c => (
                  <div key={c.id} style={{fontSize:12,color: c.status === 'pass' ? 'var(--green-dark)' : 'var(--color-amber-dark)'}}>
                    {c.status === 'pass' ? '✓' : ''} {c.label}{c.status === 'warn' ? ` — ${c.detail}` : ''}
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div>
                <label className="ts-fl">Filing status {!d.filingStatus && <span style={{color:'var(--color-red)'}}>required</span>}</label>
                <select value={d.filingStatus || ''} onChange={e => setParsePreview(p => ({ ...p, data: { ...p.data, filingStatus: e.target.value || undefined } }))}>
                  <option value="">— Choose —</option>
                  {FILING_STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <label className="ts-fl">Tax year {!d.taxYear && <span style={{color:'var(--color-red)'}}>required</span>}</label>
                <input type="number" min="2015" max={new Date().getFullYear() + 1} value={d.taxYear || ''} onChange={e => setParsePreview(p => ({ ...p, data: { ...p.data, taxYear: e.target.value ? Number(e.target.value) : undefined } }))} />
                {d.taxYear && !SUPPORTED_TAX_YEARS.includes(+d.taxYear) && (
                  <div style={{fontSize:11.5,color:'var(--color-amber-dark, #92400E)',marginTop:4}}>
                    {+d.taxYear < SUPPORTED_TAX_YEARS[0]
                      ? `Fine for the walkthrough (it uses the return's own figures). TaxStory's tax tables start at ${SUPPORTED_TAX_YEARS[0]}, so recalculations for ${d.taxYear} are estimates; the ${+d.taxYear + 1} projection ${+d.taxYear + 1 >= SUPPORTED_TAX_YEARS[0] ? 'uses official tables' : 'is an estimate too'}.`
                      : `${d.taxYear} tax tables are not available yet; calculations for it use ${SUPPORTED_TAX_YEARS[SUPPORTED_TAX_YEARS.length - 1]} figures and are marked as estimates.`}
                  </div>
                )}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 12px',marginBottom:14}}>
              {fields.map(k => (
                <label key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,background:'#fff',borderRadius:8,padding:'6px 10px',fontSize:12}}>
                  <span style={{color:'var(--muted)'}}>{FIELD_LABELS[k]}{res.confidence?.[k] === 'medium' ? ' ·' : ''}</span>
                  <input type="number" value={d[k] ?? ''} onChange={e => setField(k, e.target.value)} placeholder="—" style={{width:110,textAlign:'right',padding:'4px 8px',fontWeight:700}} />
                </label>
              ))}
            </div>
            {res.quality !== 'good' && (
              <label style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:12,color:'var(--dark)',background:'var(--color-amber-light)',border:'1px solid var(--color-amber-border)',borderRadius:8,padding:'9px 11px',marginBottom:12,lineHeight:1.5}}>
                <input type="checkbox" checked={ackVerified} onChange={e=>setAckVerified(e.target.checked)} style={{marginTop:2}} />
                <span>I have compared every figure above with the return itself and they are correct. (Required because the figures could not be fully confirmed against each other.)</span>
              </label>
            )}
            <div style={{display:'flex',gap:9}}>
              <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>{ setParsePreview(null); setFile(null); setParseStep(''); setError(''); }}>← Choose another file</button>
              <button className="ts-btn ts-btn-primary" style={{flex:2}} disabled={savingPreview || res.quality === 'insufficient' || (res.quality !== 'good' && !ackVerified)} onClick={saveParsed}>
                {savingPreview ? 'Saving…' : reparseId ? 'Replace figures →' : 'Save projection →'}
              </button>
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:8}}>
              {reparseId ? 'Replacing figures does not use another projection.' : 'Saving uses one projection from your plan.'}
            </div>
          </div>
        );
      })()}

      <div style={{textAlign:'center',color:'var(--muted)',fontSize:'12px',fontWeight:600,margin:'8px 0'}}>— or enter manually —</div>

      <div className="ts-split">
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-card">
            <div className="ts-card-title">Client & filing info</div>
            <div className="ts-frow"><label className="ts-fl">Client name <span>*</span></label><input type="text" placeholder="e.g. Sarah & Michael Chen" value={form.name} onChange={upd('name')} /></div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Tax year</label>
                {/* Only years with official tax tables: a manual entry is calculated, and other years would silently use another year's law */}
                <select value={form.year} onChange={upd('year')}>
                  {SUPPORTED_TAX_YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
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
              <div className="ts-frow"><label className="ts-fl">W-2 wages — Taxpayer</label><input type="number" value={form.wages} onChange={upd('wages')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">W-2 wages — Spouse</label><input type="number" value={form.spouseWages} onChange={upd('spouseWages')} placeholder="0" /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Business income (Sch C)</label><input type="number" value={form.business} onChange={upd('business')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Partnership / K-1</label><input type="number" value={form.partnershipK} onChange={upd('partnershipK')} placeholder="0" /></div>
            </div>
            {(+form.business > 0 || +form.partnershipK > 0) && (
              <div style={{ marginTop:8, padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:9 }}>
                <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={!!form.isSSBT}
                    onChange={e => setForm(f => ({...f, isSSBT: e.target.checked}))}
                    style={{ marginTop:2, accentColor:'var(--purple)' }} />
                  <div>
                    <div style={{ fontSize:12.5, fontWeight:600, color:'var(--dark)' }}>
                      Specified Service Business (SSTB)
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.5 }}>
                      CPA, law, consulting, financial advisory, medical, or performing arts.
                      QBI phases out completely above {form.status?.includes('jointly') ? '$503,700 MFJ' : '$251,850'} (2026).
                    </div>
                  </div>
                </label>
                {!form.isSSBT && (
                  <div className="ts-input-row" style={{ marginTop:8 }}>
                    <div className="ts-frow"><label className="ts-fl">W-2 wages paid <span>to employees</span></label>
                      <input type="number" value={form.w2WagesPaid||0} onChange={upd('w2WagesPaid')} placeholder="0" /></div>
                    <div className="ts-frow"><label className="ts-fl">Qual. prop. basis <span>UBIA, optional</span></label>
                      <input type="number" value={form.qualPropBasis||0} onChange={upd('qualPropBasis')} placeholder="0" /></div>
                  </div>
                )}
              </div>
            )}
            {/* Advanced income — collapsible to reduce visual noise for simple W-2 clients */}
            <button type="button"
              onClick={() => setShowAdvanced(a => !a)}
              className="ts-link-btn" style={{ marginBottom:6 }}>
              {showAdvanced ? '▾' : '▸'} {showAdvanced ? 'Hide' : 'Show'} additional income sources
              {(() => {
                // Count non-zero advanced fields so CPA knows if any are active when collapsed
                const advFields = ['partnershipK','ltcg','stcg','ordDividends','qualDividends',
                  'interest','rentalNet','pension','socialSecurity','other'];
                const active = advFields.filter(k => +form[k] > 0).length;
                return active > 0 && !showAdvanced
                  ? <span style={{ background:'var(--purple)', color:'#fff', borderRadius:20,
                      fontSize:10, fontWeight:700, padding:'1px 7px', marginLeft:2 }}>
                      {active} active
                    </span>
                  : <span style={{ color:'var(--muted)', fontWeight:400 }}>(dividends, cap. gains, rental, SS, pension)</span>;
              })()}
            </button>
            {showAdvanced && (<>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Long-term cap. gains</label><input type="number" value={form.ltcg} onChange={upd('ltcg')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Short-term cap. gains</label><input type="number" value={form.stcg} onChange={upd('stcg')} placeholder="0" /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Ordinary dividends</label><input type="number" value={form.ordDividends} onChange={upd('ordDividends')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Qualified dividends <span>(subset)</span></label><input type="number" value={form.qualDividends} onChange={upd('qualDividends')} placeholder="0" /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Taxable interest</label><input type="number" value={form.interest} onChange={upd('interest')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Rental income (net)</label><input type="number" value={form.rentalNet} onChange={upd('rentalNet')} placeholder="0" /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Pension / IRA distrib.</label><input type="number" value={form.pension} onChange={upd('pension')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Social Security benefits</label><input type="number" value={form.socialSecurity} onChange={upd('socialSecurity')} placeholder="0" /></div>
            </div>
            <div className="ts-frow"><label className="ts-fl">Other income</label><input type="number" value={form.other} onChange={upd('other')} placeholder="0" /></div>
            </>)}
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Deductions</div>
            <div className="ts-frow"><label className="ts-fl">Deduction type</label>
              <div className="ts-seg">
                <div className={`ts-seg-btn${form.deduction==='standard'?' sel':''}`} onClick={()=>setForm(f=>({...f,deduction:'standard'}))}>Standard</div>
                <div className={`ts-seg-btn${form.deduction==='itemized'?' sel':''}`} onClick={()=>setForm(f=>({...f,deduction:'itemized'}))}>Itemized</div>
              </div>
            </div>
            {form.deduction==='itemized' && (<>
              <div className="ts-input-row">
                <div className="ts-frow"><label className="ts-fl">State income taxes paid</label><input type="number" value={form.saltIncome} onChange={upd('saltIncome')} placeholder="0" /></div>
                <div className="ts-frow"><label className="ts-fl">Property taxes <span>subject to the SALT cap</span></label><input type="number" value={form.propertyTax} onChange={upd('propertyTax')} placeholder="0" /></div>
              </div>
              <div className="ts-input-row">
                <div className="ts-frow"><label className="ts-fl">Mortgage interest</label><input type="number" value={form.mortgage} onChange={upd('mortgage')} placeholder="0" /></div>
                <div className="ts-frow"><label className="ts-fl">Cash charitable contributions</label><input type="number" value={form.charity} onChange={upd('charity')} placeholder="0" /></div>
              </div>
              <div className="ts-frow"><label className="ts-fl">Medical expenses <span>before 7.5% floor</span></label><input type="number" value={form.medical} onChange={upd('medical')} placeholder="0" /></div>
              {((+form.saltIncome||0)+(+form.propertyTax||0)) > 10000 && (() => {
                const saltPaid = (+form.saltIncome||0) + (+form.propertyTax||0);
                const saltCapped = 10000;
                const saltLost = saltPaid - saltCapped;
                const itemizedWithCap = saltCapped + (+form.mortgage||0) + (+form.charity||0);
                const std = liveResult?.standardDeduction || 30000;
                const usingItem = itemizedWithCap > std;
                return (
                  <div style={{background: usingItem ? 'var(--amber-bg)' : 'var(--color-blue-bg)', border:`1px solid ${usingItem ? 'var(--color-amber-border)' : 'var(--color-blue-border)'}`, borderRadius:8, padding:'8px 11px', fontSize:11.5, color: usingItem ? 'var(--color-amber-dark)' : 'var(--color-blue)', marginBottom:8}}>
                    {usingItem
                      ? <><Icon name="warning" /> SALT cap: paid <strong>${saltPaid.toLocaleString()}</strong> in state/local taxes but limited to $10,000 — <strong>${saltLost.toLocaleString()} lost to cap.</strong> Client is still itemizing.</>
                      : <>ℹ️ SALT cap reduced itemized total to <strong>${itemizedWithCap.toLocaleString()}</strong>, below the standard deduction of <strong>${std.toLocaleString()}</strong>. Standard deduction wins — no itemized benefit this year.</>
                    }
                  </div>
                );
              })()}
            </>)}
            <div className="ts-frow"><label className="ts-fl">SE health insurance deduction</label><input type="number" value={form.seHealthInsurance} onChange={upd('seHealthInsurance')} placeholder="0" /></div>
          </div>
          <div className="ts-card">
            <div className="ts-card-title">Payments & credits</div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Federal withholding</label><input type="number" value={form.withholding} onChange={upd('withholding')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Estimated tax payments</label><input type="number" value={form.estimatedPayments} onChange={upd('estimatedPayments')} placeholder="0" /></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl">Children under 17 <span>(CTC)</span></label><input type="number" value={form.children} onChange={upd('children')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">Other dependents <span>($500 credit)</span></label><input type="number" value={form.otherDependents} onChange={upd('otherDependents')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl">EIC qualifying children <span>(if different)</span></label><input type="number" value={form.eicChildren} onChange={upd('eicChildren')} placeholder="same as under 17" /></div>
              <div className="ts-frow" style={{paddingTop:18}}><div className="ts-frow" style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="checkbox" id="aged" checked={form.aged} onChange={e=>setForm(f=>({...f,aged:e.target.checked}))} style={{accentColor:'var(--purple)'}} />
                <label htmlFor="aged" style={{fontSize:12,color:'var(--dark)',cursor:'pointer'}}>Age 65+ <span style={{color:'var(--muted)',fontWeight:400}}>($6,000 senior deduction)</span></label>
              </div></div>
            </div>
            <div className="ts-input-row">
              <div className="ts-frow"><label className="ts-fl" title="The portion of tips already INCLUDED in the Wages above (or in business income). Do not add them again. Deduction: up to $25,000 (not MFS), reduced $100 per $1,000 of income over $150,000 ($300,000 joint). 2025–2028.">Qualified tips (already in income) <span>OBBBA</span></label><input type="number" value={form.tips} onChange={upd('tips')} placeholder="0" /></div>
              <div className="ts-frow"><label className="ts-fl" title="The overtime PREMIUM (the extra half of time-and-a-half) already INCLUDED in the Wages above. Do not add it again. Deduction: up to $12,500 ($25,000 joint, not MFS), reduced $100 per $1,000 of income over $150,000 ($300,000 joint). 2025–2028.">Qualified overtime premium (already in income) <span>OBBBA</span></label><input type="number" value={form.overtime} onChange={upd('overtime')} placeholder="0" /></div>
            </div>
          </div>
          {error && <div className="ts-note ts-alert-danger" role="alert">{error}</div>}
          <div style={{display:'flex',gap:'10px'}}>
            <button className="ts-btn ts-btn-secondary" style={{flex:1}} onClick={()=>setView('list')}>Cancel</button>
            <button className="ts-btn ts-btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving} aria-busy={saving}>{saving?'Saving…':'Calculate & save →'}</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div className="ts-dark-panel">
            <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>Live estimate</div>
            <div className="ts-big-num">{fmt(estTax)}</div>
            <div className="ts-big-label">estimated federal tax</div>
            <ScopeNotice scope={liveResult.scope} dark />
            <div style={{marginTop:'18px'}}>
              {[
                ['Total income', fmt(totalIncome)],
                ['Deduction', `−${fmt(deduction)}`],
                ['Taxable income', fmt(taxableInc)],
                ['Effective rate', `${effRate}%`, 'var(--color-purple-pale)'],
                ['Marginal bracket', `${(margBracket*100).toFixed(0)}%`],
                ['Bracket headroom', `$${Math.round(bracketRoom).toLocaleString()}`],
                ['Withholding', fmt(+form.withholding)],
                [refundOwed >= 0 ? 'Estimated refund' : 'Estimated owed', fmt(Math.abs(refundOwed)), refundOwed >= 0 ? 'var(--color-mint)' : 'var(--color-red-soft)'],
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
            <div className="ts-page-title">{r.clients?.name || cleanFilename(r.file_name) || 'Tax Return'}</div>
            <div className="ts-page-sub">
              Tax year {r.tax_year || pd.tax_year || '—'} · {pd.filing_status || '—'} ·{' '}
              {pd.effective_rate != null
                ? <span className="ts-pill ts-p-green">{pd.effective_rate}% eff. rate</span>
                : <span className="ts-pill ts-p-gray">Rate unavailable</span>}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={async () => {
            // Duplicate = a new projection (metered like any other); done by a function, not a browser insert.
            try {
              const out = await callFunction('save-return', { source: 'copy', copyOf: r.id });
              await fetchReturns();
              const { data: newRec } = await supabase.from('tax_returns').select('*, clients(name,email,type)').eq('id', out.id).single();
              setSelected(newRec); setView('detail');
            } catch (e) { setError(e.message); }
          }}>⧉ Duplicate</button>
          <button className="ts-btn ts-btn-secondary ts-btn-sm"
            title="Choose the PDF again and replace this return's figures"
            onClick={async () => {
              if (!(await confirm({ title: 'Re-import this return?', message: 'Choose the PDF again and the figures will be replaced. Any walkthrough already built from the old figures will need to be regenerated. This does not use another projection.', confirmLabel: 'Choose PDF', danger: false }))) return;
              setReparseId(r.id); setFile(null); setParsePreview(null); setError('');
              setView('new');
              setUploadClientId(r.client_id || '');
            }}><Icon name="refresh" size={14} /> Re-import</button>
          <button className="ts-btn ts-btn-secondary ts-btn-sm" onClick={()=>exportRecords(r)}>Download records</button>
<button className="ts-btn ts-btn-danger ts-btn-sm" onClick={()=>handleDelete(r.id)}>Delete</button>
          {totalCredits > 0
            ? <Link to={`/cpa/video?returnId=${r.id}`} className="ts-btn ts-btn-primary"><Icon name="video" /> Walkthrough</Link>
            : <Link to="/billing" className="ts-btn ts-btn-secondary ts-btn-sm" title={`0 credits remaining`}><Icon name="video" /> Buy credits</Link>
          }
        </div>
      </div>

      <div className="ts-g4" style={{marginBottom:'16px'}}>
        {[
          {l:'Total income',   v: fmt(pd.total_income)},
          {l:'Federal tax',    v: fmt(pd.federal_tax)},
          {l:'Effective rate', v: pd.effective_rate != null ? `${pd.effective_rate}%` : '—'},
          {l: pd.refund_or_owed == null ? 'Refund / Owed'
              : pd.refund_or_owed >= 0  ? 'Refund'
              : 'Owed',
           v: pd.refund_or_owed == null ? '—' : fmt(Math.abs(pd.refund_or_owed))},
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
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<arr.length-1?'1px solid var(--color-purple-faint)':'none',fontWeight:i>=4?600:400}}>
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
              ['Refund / Owed', pd.refund_or_owed == null ? '—'
                : pd.refund_or_owed >= 0 ? `${fmt(pd.refund_or_owed)} refund`
                : `${fmt(Math.abs(pd.refund_or_owed))} owed`],
              ['Parsed on', r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'],
            ].map(([k,v])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--color-purple-faint)',fontSize:'13px'}}>
                <span style={{color:'var(--muted)'}}>{k}</span><span style={{fontWeight:500,color:'var(--dark)'}}>{v||'—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          {/* Next-year projection using taxEngine */}
          {(() => {
            // "Project to": next year by default, or two years out. Years past the latest official tables are planning scenarios (the engine labels them).
            const projYr = (r.tax_year || pd.tax_year || new Date().getFullYear()-1) + (projAdj.yearsOut === 2 ? 2 : 1);
            // Every figure the saved return holds, with the assumptions listed (see utils/projectionInputs.js).
            const { inputs: baseInputs, assumptions: projAssumptions, withholding: priorWithholding, estimatedPayments: priorEstPay } =
              buildProjectionInputs(r.parsed_data || {}, r.tax_year || pd.tax_year);
            // Apply the advisor's what-if adjustments (percent changes and overrides) on top of the carried-forward figures.
            const pct = v => 1 + (Number(v) || 0) / 100;
            const nextInputs = { ...baseInputs };
            for (const k of ['wages', 'spouseWages', 'tipIncome', 'overtimeIncome']) if (nextInputs[k]) nextInputs[k] = Math.round(nextInputs[k] * pct(projAdj.wagePct));
            for (const k of ['businessIncome', 'partnershipKIncome']) if (nextInputs[k]) nextInputs[k] = Math.round(nextInputs[k] * pct(projAdj.bizPct));
            for (const k of ['interestIncome', 'ordinaryDividends', 'qualifiedDividends', 'rentalIncome']) if (nextInputs[k]) nextInputs[k] = Math.round(nextInputs[k] * pct(projAdj.invPct));
            for (const k of ['rmdIncome', 'pensionDistributions', 'socialSecurity']) if (nextInputs[k]) nextInputs[k] = Math.round(nextInputs[k] * pct(projAdj.retPct));
            if (projAdj.capGains !== '' && Number.isFinite(+projAdj.capGains)) { nextInputs.ltcg = +projAdj.capGains; nextInputs.stcg = 0; }
            if (projAdj.children !== '' && Number.isInteger(+projAdj.children) && +projAdj.children >= 0) nextInputs.children = +projAdj.children;
            if (projAdj.capLossCarry !== '' && Number.isFinite(+projAdj.capLossCarry) && +projAdj.capLossCarry >= 0) { nextInputs.capitalLossCarryforward = +projAdj.capLossCarry; nextInputs.capitalLossCarryforwardST = 0; }
            const adjusted = JSON.stringify({ ...projAdj, yearsOut: 1 }) !== JSON.stringify(NO_ADJ);   // the target year is not a what-if
            const nextResult = calcFullFederalTax(nextInputs, projYr, taxOptionsFor(projYr));
            const diff = nextResult.totalFederalTax - (pd.federal_tax || 0);
            const flags = nextResult.flags || {};     // the PROJECTION's flags (it showed the prior year's stored flags under the projection)
            const roth  = analyzeRothConversion(nextResult.taxableIncome, nextResult.agi, pd.filing_status || 'Single', projYr, nextInputs);   // priced on the full return

            const FLAG_DEFS = [
              { key:'amtTriggered',          icon:'warning', label:'AMT triggered',
                ...(FEATURES.planningModules ? { action: 'Run scenario with ISO exercise timing', actionFn: () => { window.location.href = '/cpa/scenarios'; } } : {}),             color:'var(--color-red-soft)', detail: `Alternative minimum tax applies — $${Math.round(nextResult.amtLiability||0).toLocaleString()} liability` },
              { key:'subjectToNIIT',         icon:'planning', label:'NIIT applies (3.8%)',        color:'var(--color-red-soft)', detail: `Net investment income tax on investment income` },
              { key:'saltCapHit',            icon:'home', label:'SALT cap hit',               color:'var(--color-amber-mid)',
                detail: (() => {
                  const saltPaid  = (pd.salt_income || pd.saltIncomeTaxesPaid || 0) + (pd.property_tax || pd.propertyTaxesPaid || 0);
                  const cap       = getBracketsForYear(projYr).saltCap || 10000;
                  const lost      = Math.max(0, saltPaid - cap);
                  const usingItem = nextResult.useItemized;
                  if (!usingItem) {
                    // Client pays >$10K in SALT but standard deduction still wins —
                    // the cap reduced itemized below standard, so no direct dollar loss this year.
                    const itemized = nextResult.totalItemized || 0;
                    const standard = nextResult.standardDeduction || 30000;
                    return `SALT cap reduced itemized deductions to ${fmt(itemized)} — standard deduction of ${fmt(standard)} is better this year. No itemized benefit. If mortgage or charity increases, itemizing may become worthwhile.`;
                  }
                  return lost > 0
                    ? `Itemizing — paid ${fmt(saltPaid)} in state/local taxes but can only deduct ${fmt(cap)}. ${fmt(lost)} of real deductions wiped out by the cap.`
                    : `State/local taxes exceed the ${fmt(cap)} SALT cap.`;
                })() },
              { key:'estimatedParameters',     icon:'warning', label:'Estimated tax tables',       color:'var(--color-amber-mid)', detail: `There are no official tax tables for this year yet, so 2026 figures were used. Treat this result as an estimate.` },
              { key:'seniorDeductionApplies',icon:'senior', label:'Senior deduction applies',   color:'var(--color-mint)', detail: `Additional $6,000 deduction for age 65+ (OBBBA 2025–2028)` },
              { key:'qbiApplies',            icon:'briefcase', label:'QBI deduction applies',      color:'var(--color-mint)', detail: `20% qualified business income deduction §199A` },
              { key:'nearBracketBoundary',   icon:'zap', label:'Near bracket boundary',      color:'var(--color-amber-mid)', detail: `Within ${fmt(roth.bracketHeadroom)} of the next tax bracket — strong Roth conversion or income-shifting window`,
                action: 'View Roth conversion analysis ↓', actionFn: () => document.querySelector('[data-roth-anchor]')?.scrollIntoView({behavior:'smooth'}) },
              { key:'irmaaRisk',             icon:'health', label:'IRMAA Medicare risk',        color:'var(--color-red-soft)',
                detail: (() => {
                  // Engine tables (CMS, verified). IRMAA looks back two years: this year's MAGI sets the premium two years out.
                  const magi = nextResult.agi || 0;
                  const ir = calcIRMAA(magi, nextInputs.filingStatus, projYr + 2);
                  if (!ir.annualSurcharge) return `MAGI ${fmt(magi)} is near an IRMAA threshold; it sets Medicare premiums for ${projYr + 2}.`;
                  return `MAGI ${fmt(magi)} in ${projYr} would add about ${fmt(ir.annualSurcharge)} per person on Medicare to ${projYr + 2} Part B and D premiums.`;
                })() },
              { key:'tipsOrOvertimeDeduction',icon:'success', label:'Tips/overtime deduction',     color:'var(--color-mint)', detail: `OBBBA deduction applied (capped, reduced at higher income) — lowers taxable income, not AGI` },
              { key:'rentalLossSuspended', icon:'rental', label:'Rental loss suspended (§469)', color:'var(--color-amber-mid)',
                detail: (() => {
                  const suspended = nextResult?.rentalPALSuspended || 0;
                  const agi_v = nextResult?.agi || 0;
                  return agi_v > 150000
                    ? `AGI >$150K — §469 allowance fully phased out. ${fmt(suspended)} rental loss suspended, carries forward to offset future rental income or property sale.`
                    : `Rental loss partially limited by §469 — ${fmt(suspended)} suspended and carries forward.`;
                })(),
                ...(FEATURES.planningModules ? { action:'Model rental sale', actionFn:()=>{ window.location.href='/cpa/scenarios'; } } : {}) },
            ].filter(f => flags[f.key]);

            return (
              <>
                {/* Adjust next year — what-if inputs, applied live to everything below */}
                <div className="ts-card" style={{marginBottom:14}}>
                  <div className="ts-card-title">Adjust {projYr}
                    <span className="ts-card-sub">{adjusted ? 'what-if applied — not saved' : 'figures carried forward from the return'}</span>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:10,fontSize:12,color:'var(--muted)'}}>
                    Project to:
                    {[1, 2].map(n => {
                      const y = (r.tax_year || pd.tax_year || new Date().getFullYear()-1) + n;
                      const on = (projAdj.yearsOut === 2 ? 2 : 1) === n;
                      return (
                        <button key={n} onClick={() => setProjAdj(a => ({ ...a, yearsOut: n }))}
                          style={{padding:'5px 12px',borderRadius:8,fontSize:12,fontFamily:'inherit',cursor:'pointer',
                            border:`1px solid ${on ? 'var(--color-purple)' : 'var(--color-border)'}`, background: on ? 'var(--color-purple)' : '#fff', color: on ? '#fff' : 'var(--dark)'}}>
                          {y}{!SUPPORTED_TAX_YEARS.includes(y) ? ' (scenario)' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}>
                    {[
                      ['wagePct',  'Wages change %',             'e.g. 5'],
                      ['bizPct',   'Business income change %',   'e.g. -10'],
                      ['invPct',   'Interest, dividends, rent %', '0'],
                      ['retPct',   'Retirement income change %', 'IRA, pension, SS'],
                      ['capGains', `${projYr} capital gains ($)`, 'carried forward'],
                      ['children', 'Children under 17',          String(baseInputs.children ?? 0)],
                      ['capLossCarry', 'Capital loss carryover ($)', String((baseInputs.capitalLossCarryforward || 0) + (baseInputs.capitalLossCarryforwardST || 0))],
                    ].map(([k, label, ph]) => (
                      <label key={k} style={{fontSize:11,color:'var(--muted)',display:'flex',flexDirection:'column',gap:4}}>
                        {label}
                        <input type="number" value={projAdj[k]} placeholder={ph}
                          onChange={e => setProjAdj(a => ({ ...a, [k]: e.target.value === '' ? (['capGains', 'children', 'capLossCarry'].includes(k) ? '' : 0) : e.target.value }))}
                          style={{padding:'7px 9px',border:'1px solid var(--color-border)',borderRadius:8,fontSize:13,fontFamily:'inherit'}} />
                      </label>
                    ))}
                  </div>
                  {adjusted && (
                    <button onClick={() => setProjAdj(a => ({ ...NO_ADJ, yearsOut: a.yearsOut }))}
                      className="ts-btn ts-btn-secondary ts-btn-sm" style={{ marginTop:10 }}>
                      Reset to carried-forward figures
                    </button>
                  )}
                </div>

                {/* Year-over-year comparison chart */}
                {(() => {
                  const curTax  = pd.federal_tax || 0;
                  const nxtTax  = nextResult.totalFederalTax || 0;
                  if (!curTax || !nxtTax) return null;
                  const maxBar  = Math.max(curTax, nxtTax, 1);
                  const yr0     = r.tax_year || pd.tax_year || 'Prior';
                  const curRate = +(pd.effective_rate||0);
                  const nxtRate = +(nextResult.effectiveRate||0);
                  return (
                    <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:11}}>Year-over-year tax comparison</div>
                      <div style={{display:'flex',gap:12,alignItems:'flex-end',height:68,marginBottom:8}}>
                        {[[`${yr0}`,curTax,'var(--border)','var(--muted)'],[`${projYr}`,nxtTax,nxtTax>curTax?'var(--color-red-light)':'var(--green-bg)',nxtTax>curTax?'var(--color-red-dark)':'var(--green-dark)'],[`Δ`,nxtTax-curTax,'var(--bg)',nxtTax>curTax?'var(--color-red-dark)':'var(--green-dark)']].map(([label,val,bg,color])=>(
                          <div key={label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                            <div style={{fontSize:11,fontWeight:700,color}}>{label==='Δ'?(val>=0?'+':'')+fmt(Math.abs(val)):fmt(val)}</div>
                            <div style={{width:'100%',background:bg,borderRadius:'3px 3px 0 0',height:Math.max(6,Math.round(Math.abs(val)/maxBar*52))}}/>
                            <div style={{fontSize:10,color:'var(--muted)',fontWeight:600}}>{label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,borderTop:'1px solid var(--color-gray-bg)',paddingTop:8}}>
                        <span style={{color:'var(--muted)'}}>Prior eff. rate: <strong>{curRate}%</strong></span>
                        <span style={{color:'var(--muted)'}}>{projYr} eff. rate: <strong style={{color:nxtRate>curRate?'var(--color-red-dark)':'var(--green-dark)'}}>{nxtRate}%</strong></span>
                      </div>
                    </div>
                  );
                })()}

                <div className="ts-dark-panel">
                  <div style={{fontSize:'10px',color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,marginBottom:'14px'}}>{projYr} projection (estimated)</div>
                  <div className="ts-big-num">{fmt(nextResult.totalFederalTax)}</div>
                  <div className="ts-big-label">estimated federal tax</div>
                  <div style={{marginTop:'18px'}}>
                    {[
                      ['vs prior year', diff >= 0 ? `+${fmt(diff)}` : `−${fmt(Math.abs(diff))}`, diff >= 0 ? 'var(--color-red-soft)' : 'var(--color-mint)'],
                      ['Std deduction', fmt(nextResult.standardDeduction)],
                      ['Effective rate', `${nextResult.effectiveRate}%`],
                      ['Marginal bracket', `${(nextResult.marginalRate*100).toFixed(0)}%`],
                      ['Bracket headroom', `$${Math.round(nextResult.bracketHeadroom).toLocaleString()}`],
                    ].map(([k,v,vc])=>(
                      <div className="ts-dr" key={k}><div className="ts-dr-key">{k}</div><div className="ts-dr-val" style={vc?{color:vc}:{}}>{v}</div></div>
                    ))}
                  </div>
                </div>

                <ScopeNotice scope={{ reasons: [
                  ...projAssumptions.map((t, i) => ({ code: `proj_${i}`, level: 'warn', text: t })),
                  { code: 'proj_flat', level: 'info', text: `${projYr} starts from every prior-year income and deduction (change them in “Adjust ${projYr}” above) under ${projYr} tax law. Withholding and estimated payments are assumed to repeat.` },
                  ...(nextResult.scope?.reasons || []),
                ] }} />

                {/* Planning flags — surfaced automatically from engine */}
                {FLAG_DEFS.length > 0 && (
                  <div className="ts-card" style={{border:'1.5px solid var(--color-border)'}}>
                    <div className="ts-card-title">Planning opportunities</div>
                    <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                      {FLAG_DEFS.map(f => (
                        <div key={f.key} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'10px 12px',borderRadius:'8px',background:'var(--bg)',border:'1px solid var(--border)'}}>
                          <span style={{flexShrink:0,marginTop:1,color:'var(--brand)'}}><Icon name={f.icon} size={15} /></span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:'12px',fontWeight:700,color:'var(--dark)'}}>{f.label}</div>
                            <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:1.5}}>{f.detail}</div>
                            {f.action && (
                              <div style={{marginTop:6,fontSize:11,fontWeight:600,color:'var(--purple)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:3}}
                                onClick={f.actionFn || (() => {})}>
                                → {f.action}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Roth conversion analysis */}
                {/* ── Safe harbor calculation — critical for self-employed clients ── */}
                {(() => {
                  const totalPay = (priorWithholding || 0) + (priorEstPay || 0);   // assumes the same withholding and estimates next year
                  const tax = nextResult.totalFederalTax || 0;
                  const priorTax = pd.federal_tax || 0;
                  if (!priorTax && !tax) return null;
                  // §6654(d)(1)(B)/(C): the lesser of 90% of this year's tax or 100% of last year's — 110% when last year's AGI exceeded $150,000
                  // ($75,000 married filing separately). It used 110% for everyone. No penalty if the balance due is under $1,000.
                  const highIncome = (pd.agi || 0) > (/separately/i.test(nextInputs.filingStatus) ? 75000 : 150000);
                  const priorPct = highIncome ? 1.10 : 1.00;
                  const safeHarbor90 = Math.round(tax * 0.90);
                  const safeHarborPrior = Math.round(priorTax * priorPct);
                  const safeHarborAmt = Math.min(safeHarbor90, safeHarborPrior);
                  const shortfall = (tax - totalPay) < 1000 ? 0 : Math.max(0, safeHarborAmt - totalPay);
                  const overpaid  = Math.max(0, totalPay - safeHarborAmt);
                  // Underpayment penalty estimate (§6654 approx: 8% APR on shortfall, 9 months avg)
                  const penaltyEst = shortfall > 1000 ? Math.round(shortfall * 0.08 * 0.75) : 0;
                  // Safe harbor is only relevant for clients who pay estimated taxes:
                  // self-employed, landlords, significant investment income, or anyone
                  // who already makes quarterly payments. Pure W-2 employees with only
                  // withholding don't need this panel — it would confuse them.
                  const hasSEIncome = (pd.business_income || 0) + (pd.partnershipK || 0) + (pd.rental_income || 0) > 0;
                  const hasEstPay   = (pd.estimated_payments || pd.estimatedTaxPayments || 0) > 0;
                  const isSE = hasSEIncome || hasEstPay || (nextInputs.businessIncome || 0) > 0 || (priorEstPay || 0) > 0;   // was also driven by the unrelated new-entry form
                  if (!isSE) return null;  // hide entirely for pure W-2 clients
                  if (!isSE && shortfall === 0) return null;
                  return (
                    <div className="ts-card" style={{border:'1.5px solid var(--color-border)',marginBottom:14}}>
                      <div className="ts-card-title">Estimated tax & safe harbor
                        <span className="ts-card-sub">§6654 analysis</span>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {[
                          ['Safe harbor amount', fmt(safeHarborAmt), null, `Lesser of 90% of ${projYr} tax or ${highIncome ? '110' : '100'}% of prior-year tax`],
                          ['Total payments to date', fmt(totalPay), null, 'Withholding + estimated payments'],
                          shortfall > 0 ? ['Estimated shortfall', fmt(shortfall), 'var(--color-red)', 'Additional estimated payments recommended'] : null,
                          overpaid > 0  ? ['Overpaid (safe)', fmt(overpaid), 'var(--green)', 'No underpayment penalty expected'] : null,
                          penaltyEst > 0 ? ['Est. underpayment penalty', fmt(penaltyEst), 'var(--color-red)', '§6654 approx. at current IRS rate'] : null,
                        ].filter(Boolean).map(([k,v,vc,note]) => (
                          <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'7px 0',borderBottom:'1px solid var(--color-gray-bg)',fontSize:12}}>
                            <div><div style={{color:'var(--muted)'}}>{k}</div><div style={{fontSize:10.5,color:'var(--muted-light)',marginTop:1}}>{note}</div></div>
                            <div style={{fontWeight:700,color:vc||'var(--dark)',flexShrink:0,marginLeft:12}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {shortfall > 1000 && (
                        <div className="ts-note ts-alert-warning ts-note-compact" style={{ marginTop:10 }}>
                          Recommend {fmt(Math.round(shortfall/4))} quarterly estimated payments (Q1–Q4) to meet safe harbor.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {roth.bracketHeadroom > 0 && (
                  <div className="ts-card" style={{border:'1.5px solid var(--purple)'}}>
                    <div className="ts-card-title">Roth conversion analysis
                      <span className="ts-card-sub">{projYr} estimate</span>
                    </div>
                    <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'10px'}}>
                      Current bracket: <strong>{(roth.currentMarginalRate*100).toFixed(0)}%</strong> · Headroom before next bracket: <strong>${Math.round(roth.bracketHeadroom).toLocaleString()}</strong>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                      {roth.scenarios.filter(s=>s.amount>0&&s.amount<=500000).slice(0,3).map(s => (
                        <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:'8px',background: s.crossesBracket ? 'var(--amber-bg)' : 'var(--purple3)',border:`1px solid ${s.crossesBracket ? 'var(--color-amber-border)' : 'var(--color-purple-5)'}`}}>
                          <div>
                            <div style={{fontSize:'12px',fontWeight:600,color:'var(--dark)'}}>{s.label}</div>
                            <div style={{fontSize:'10px',color:'var(--muted)'}}>{s.crossesBracket ? `crosses to ${(s.newMarginalRate*100).toFixed(0)}% bracket` : `stays in ${(roth.currentMarginalRate*100).toFixed(0)}% bracket`}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:'13px',fontWeight:700,color:'var(--dark)'}}>{fmt(s.taxCost)}</div>
                            <div style={{fontSize:'10px',color:'var(--muted)'}}>{s.effectiveConversionRate}% effective</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ts-card">
                  <div className="ts-card-title">Notes</div>
                  <NoteEditor returnId={r.id} initialNotes={r.notes||''} />
                </div>
                {/* ── Action bar: PDF export + credit-aware walkthrough CTA ── */}
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>

                  {/* PDF summary export — always free, no credit consumed */}
                  <button
                    className="ts-btn ts-btn-secondary"
                    style={{width:'100%',justifyContent:'center'}}
                    onClick={() => {
                      const ok = exportSummaryPDF(r, pd, nextResult, roth, FLAG_DEFS, fmt, firmName);
                      setExportMsg(ok ? '' : 'Your browser blocked the pop-up. Allow pop-ups for this site, then try again.');
                    }}
                  >
                    <Icon name="file" /> Export summary PDF <span style={{fontSize:'11px',fontWeight:400,color:'var(--muted)',marginLeft:'6px'}}>free · no credit</span>
                  </button>
                  {exportMsg && <div role="alert" style={{fontSize:'12px',color:'var(--color-red-dark)',background:'var(--color-red-light)',padding:'8px 12px',borderRadius:'8px'}}>{exportMsg}</div>}

                  {/* Walkthrough CTA — credit-aware */}
                  {totalCredits > 0 ? (
                    <div style={{background:'var(--purple3)',border:'1px solid var(--color-purple-5)',borderRadius:'14px',padding:'18px'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}}>
                        <div style={{fontSize:'14px',fontWeight:700,color:'var(--dark)'}}><Icon name="video" /> Generate walkthrough</div>
                        <span style={{fontSize:'11px',fontWeight:700,padding:'3px 8px',background:'var(--purple)',color:'#fff',borderRadius:'20px'}}>1 credit</span>
                      </div>
                      <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'12px'}}>
                        Personalized 2–3 min narrated video sent directly to your client. <strong style={{color:'var(--dark)'}}>{totalCredits} credit{totalCredits !== 1 ? 's' : ''} remaining.</strong>
                      </div>
                      <Link
                        to={`/cpa/video?returnId=${r.id}`}
                        className="ts-btn ts-btn-primary"
                        style={{width:'100%',justifyContent:'center',textDecoration:'none',display:'flex'}}
                      >
                        Generate walkthrough →
                      </Link>
                    </div>
                  ) : (
                    isBasicTier ? (
                      <div style={{background:'var(--purple3)',border:'1px solid var(--color-purple-5)',borderRadius:'14px',padding:'18px'}}>
                        <div style={{fontSize:'14px',fontWeight:700,color:'var(--dark)',marginBottom:'6px'}}><Icon name="video" /> Walkthroughs are included with Pro</div>
                        <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:1.5}}>
                          Your plan doesn't include walkthrough credits. Upgrade to Pro, or buy a credit pack as you go. You can still send the PDF summary above.
                        </div>
                        <Link to="/billing" className="ts-btn ts-btn-primary" style={{width:'100%',justifyContent:'center',textDecoration:'none',display:'flex'}}>See plans →</Link>
                      </div>
                    ) : (
                    <div style={{background:'var(--color-amber-pale)',border:'1px solid var(--color-amber-border)',borderRadius:'14px',padding:'18px'}}>
                      <div style={{fontSize:'14px',fontWeight:700,color:'var(--color-amber-dark)',marginBottom:'6px'}}><Icon name="video" /> Generate walkthrough</div>
                      <div style={{fontSize:'12px',color:'var(--color-amber-dark)',marginBottom:'12px',lineHeight:1.5}}>
                        You're out of walkthrough credits. Buy a pack to generate a personalized client walkthrough — or share the PDF summary above to start the conversation.
                      </div>
                      <Link
                        to="/billing"
                        className="ts-btn ts-btn-primary"
                        style={{width:'100%',justifyContent:'center',textDecoration:'none',display:'flex',background:'var(--color-amber)',border:'none'}}
                      >
                        Buy credits →
                      </Link>
                    </div>
                    )
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function NoteEditor({ returnId, initialNotes }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState('');
  async function save() {
    const bad = identifierError(notes, 'Notes'); if (bad) { setErr(bad); return; }
    const { error } = await supabase.from('tax_returns').update({ notes }).eq('id', returnId);
    if (error) { setErr(`Could not save notes: ${error.message}`); return; }        // it used to show "saved" even when the write failed
    setErr(''); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  return (
    <>
      <textarea value={notes} onChange={e=>{setNotes(e.target.value);setSaved(false);}} style={{height:'90px',resize:'none'}} placeholder="Add notes about this return…" />
      {err && <div style={{color:'var(--color-red-dark)',fontSize:12,marginTop:6}}>{err}</div>}
      <button className="ts-btn ts-btn-secondary ts-btn-sm" style={{marginTop:'10px'}} onClick={save}>{saved?'Saved ✓':'Save notes'}</button>
    </>
  );
}
