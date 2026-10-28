// src/remotion/compositions/Form1040Layout.jsx
// Pixel-faithful HTML recreation of Form 1040 key sections.
// Used as the visual background in TaxStoryComposition.
// No PII is shown — only financial figures from parsed_data.

import React from 'react';
import { AbsoluteFill, Img } from 'remotion';

// Brand colors
const BRAND = {
  dark:    '#1A1230',
  purple:  '#6B5CE7',
  purple3: '#EEEAFF',
  muted:   '#6B698A',
  border:  '#E2DFF8',
  bg:      '#F4F2FF',
  white:   '#FFFFFF',
  green:   '#22C55E',
  red:     '#EF4444',
  amber:   '#F59E0B',
  highlight: 'rgba(251, 235, 4, 0.45)',
  highlightBorder: '#F59E0B',
};

// Which 1040 section each field_ref belongs to
const FIELD_SECTION = {
  intro:             'cover',
  wages:             'income',
  interest:          'income',
  dividends:         'income',
  ira_distributions: 'income',
  pensions:          'income',
  social_security:   'income',
  capital_gains:     'income',
  schedule_c:        'income',
  other_income:      'income',
  total_income:      'income',
  agi:               'income',
  standard_deduction:'deductions',
  qbi_deduction:     'deductions',
  taxable_income:    'deductions',
  total_tax:         'tax',
  withholding:       'tax',
  refund:            'result',
  amount_owed:       'result',
  effective_rate:    'summary',
  bracket:           'summary',
  planning_tip:      'planning',
  outro:             'cover',
};

function fmt(n) {
  if (n == null) return '—';
  const num = Math.round(Number(n));
  if (isNaN(num)) return '—';
  return num < 0
    ? `(${Math.abs(num).toLocaleString()})`
    : num.toLocaleString();
}

// A single row in the 1040 table
function FormRow({ lineNum, label, value, fieldRef, activeField, note }) {
  const isActive = activeField === fieldRef;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '6px 8px',
      borderBottom: `1px solid ${BRAND.border}`,
      background: isActive ? BRAND.highlight : 'transparent',
      borderLeft: isActive ? `3px solid ${BRAND.highlightBorder}` : '3px solid transparent',
      borderRadius: isActive ? '3px' : '0',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <div style={{ width: '36px', fontSize: '11px', color: BRAND.muted, fontWeight: 600, flexShrink: 0 }}>
        {lineNum}
      </div>
      <div style={{ flex: 1, fontSize: '12px', color: isActive ? BRAND.dark : BRAND.muted }}>
        {label}
        {note && <span style={{ fontSize: '10px', color: BRAND.muted, marginLeft: '6px' }}>{note}</span>}
      </div>
      {value != null && (
        <div style={{
          fontSize: '13px', fontWeight: isActive ? 700 : 500,
          color: isActive ? BRAND.dark : BRAND.muted,
          fontFamily: 'monospace',
          minWidth: '90px', textAlign: 'right',
        }}>
          ${fmt(value)}
        </div>
      )}
      {isActive && (
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: BRAND.amber, marginLeft: '8px', flexShrink: 0,
        }} />
      )}
    </div>
  );
}

// Section header
function SectionHeader({ title, isActive }) {
  return (
    <div style={{
      padding: '8px 8px 4px',
      borderBottom: `2px solid ${isActive ? BRAND.purple : BRAND.dark}`,
      marginBottom: '2px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isActive ? BRAND.purple : BRAND.dark }}>
        {title}
      </div>
      {isActive && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: BRAND.purple }} />}
    </div>
  );
}

export default function Form1040Layout({ parsedData: pd, activeField, year, firmName, firmColor }) {
  const accentColor = firmColor || BRAND.purple;
  const activeSection = FIELD_SECTION[activeField] || 'income';

  const showIncome     = ['cover','income','deductions','tax','result','summary','planning'].includes(activeSection);
  const showDeductions = ['deductions','tax','result','summary','planning'].includes(activeSection);
  const showTax        = ['tax','result','summary','planning'].includes(activeSection);
  const showResult     = ['result','summary','planning'].includes(activeSection);

  const refundOrOwed = pd?.refund_or_owed ?? (pd?.refund != null ? pd.refund : pd?.amountOwed != null ? -pd.amountOwed : null);
  const isRefund = refundOrOwed >= 0;

  return (
    <AbsoluteFill style={{ background: BRAND.bg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header bar */}
      <div style={{
        background: accentColor,
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 700, color: BRAND.white }}>
            {firmName || 'TaxStory'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
            Form 1040 · Tax Year {year} · Client Summary
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Powered by</div>
          <Img src="/brand/taxstory-lockup-horizontal-one-color-white.svg" style={{ height: 18, width: 'auto' }} />
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', gap: '16px', padding: '16px 28px', flex: 1, overflow: 'hidden' }}>

        {/* Left column — 1040 form recreation */}
        <div style={{ flex: 1, background: BRAND.white, borderRadius: '12px', border: `1px solid ${BRAND.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '12px', borderBottom: `1px solid ${BRAND.border}`, background: BRAND.dark }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: BRAND.white, letterSpacing: '0.04em' }}>
              U.S. Individual Income Tax Return — {year}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
              Filing Status: {pd?.filing_status || pd?.filingStatus || 'Single'}
            </div>
          </div>

          <div style={{ padding: '8px 4px', maxHeight: 'calc(100% - 48px)', overflowY: 'auto' }}>
            {/* Income section */}
            {showIncome && (
              <>
                <SectionHeader title="Income" isActive={activeSection === 'income'} />
                {(pd?.wages || pd?.totalWages) &&
                  <FormRow lineNum="1z" label="Wages, salaries, tips" value={pd.wages || pd.totalWages} fieldRef="wages" activeField={activeField} />}
                {(pd?.taxableInterest) &&
                  <FormRow lineNum="2b" label="Taxable interest" value={pd.taxableInterest} fieldRef="interest" activeField={activeField} />}
                {(pd?.ordinaryDividends || pd?.qualifiedDividends) &&
                  <FormRow lineNum="3b" label="Ordinary dividends" value={pd.ordinaryDividends} fieldRef="dividends" activeField={activeField} />}
                {(pd?.taxableIRA || pd?.iraDistributions) &&
                  <FormRow lineNum="4b" label="IRA distributions (taxable)" value={pd.taxableIRA} fieldRef="ira_distributions" activeField={activeField} />}
                {(pd?.taxablePensions || pd?.pensionsAnnuities) &&
                  <FormRow lineNum="5b" label="Pensions / annuities" value={pd.taxablePensions} fieldRef="pensions" activeField={activeField} />}
                {(pd?.taxableSocialSecurity || pd?.socialSecurity) &&
                  <FormRow lineNum="6b" label="Social security benefits" value={pd.taxableSocialSecurity || pd.socialSecurity} fieldRef="social_security" activeField={activeField} />}
                {(pd?.capital_gains || pd?.capitalGainLoss) &&
                  <FormRow lineNum="7a" label="Capital gain or loss" value={pd.capital_gains || pd.capitalGainLoss} fieldRef="capital_gains" activeField={activeField} />}
                {(pd?.business_income || pd?.scheduleC_netProfit) &&
                  <FormRow lineNum="Sch C" label="Business income / loss" value={pd.business_income || pd.scheduleC_netProfit} fieldRef="schedule_c" activeField={activeField} />}
                {(pd?.otherIncome || pd?.other_income) &&
                  <FormRow lineNum="8" label="Additional income" value={pd.other_income || pd.otherIncome} fieldRef="other_income" activeField={activeField} />}
                <FormRow lineNum="9" label="Total income" value={pd.total_income || pd.totalIncome} fieldRef="total_income" activeField={activeField} />
                <FormRow lineNum="11a" label="Adjusted gross income" value={pd.agi} fieldRef="agi" activeField={activeField} />
              </>
            )}

            {/* Deductions section */}
            {showDeductions && (
              <>
                <SectionHeader title="Deductions" isActive={activeSection === 'deductions'} />
                <FormRow lineNum="12" label="Standard / itemized deduction" value={pd.standard_deduction || pd.standardDeduction} fieldRef="standard_deduction" activeField={activeField} />
                {(pd?.qbi_deduction || pd?.qbiDeduction) &&
                  <FormRow lineNum="13" label="QBI deduction (§199A)" value={pd.qbi_deduction || pd.qbiDeduction} fieldRef="qbi_deduction" activeField={activeField} note="20% pass-through" />}
                <FormRow lineNum="15" label="Taxable income" value={pd.taxable_income || pd.taxableIncome} fieldRef="taxable_income" activeField={activeField} />
              </>
            )}

            {/* Tax section */}
            {showTax && (
              <>
                <SectionHeader title="Tax & Payments" isActive={activeSection === 'tax'} />
                <FormRow lineNum="24" label="Total tax" value={pd.federal_tax || pd.totalTax || pd.regularTax} fieldRef="total_tax" activeField={activeField} />
                <FormRow lineNum="25d" label="Federal income tax withheld" value={pd.withholding || pd.federalWithheld} fieldRef="withholding" activeField={activeField} />
                {(pd?.estimated_payments || pd?.estimatedTaxPayments) &&
                  <FormRow lineNum="26" label="Estimated tax payments" value={pd.estimated_payments || pd.estimatedTaxPayments} fieldRef="withholding" activeField={activeField} />}
              </>
            )}

            {/* Refund / owed */}
            {showResult && refundOrOwed != null && (
              <>
                <SectionHeader title={isRefund ? 'Refund' : 'Amount You Owe'} isActive={activeSection === 'result'} />
                <FormRow
                  lineNum={isRefund ? '35a' : '37'}
                  label={isRefund ? 'Amount of refund' : 'Amount you owe'}
                  value={Math.abs(refundOrOwed)}
                  fieldRef={isRefund ? 'refund' : 'amount_owed'}
                  activeField={activeField}
                />
              </>
            )}
          </div>
        </div>

        {/* Right column — dynamic context panel */}
        <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Summary KPIs */}
          <div style={{ background: BRAND.dark, borderRadius: '12px', padding: '14px', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Key figures
            </div>
            {[
              { label: 'Total income',   value: fmt(pd?.total_income || pd?.totalIncome),    prefix: '$' },
              { label: 'Federal tax',    value: fmt(pd?.federal_tax || pd?.totalTax),         prefix: '$' },
              { label: 'Effective rate', value: pd?.effective_rate != null ? `${pd.effective_rate}%` : pd?.effectiveRate != null ? `${(pd.effectiveRate < 1 ? pd.effectiveRate * 100 : pd.effectiveRate).toFixed(1)}%` : '—', prefix: '' },
              { label: isRefund ? 'Refund' : 'Owed',
                value: refundOrOwed != null ? `$${fmt(Math.abs(refundOrOwed))}` : '—',
                prefix: '', color: isRefund ? BRAND.green : BRAND.red },
            ].map(kpi => (
              <div key={kpi.label} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>{kpi.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Georgia, serif', color: kpi.color || BRAND.white, lineHeight: 1 }}>
                  {kpi.prefix}{kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Active field callout */}
          {activeField && activeField !== 'intro' && activeField !== 'outro' && (
            <div style={{
              background: BRAND.white, borderRadius: '12px',
              border: `2px solid ${BRAND.amber}`,
              padding: '12px', flexShrink: 0,
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: BRAND.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Now discussing
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: BRAND.dark }}>
                {activeField.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </div>
            </div>
          )}

          {/* Planning tip panel */}
          {activeField === 'planning_tip' && (
            <div style={{
              background: accentColor, borderRadius: '12px', padding: '14px', flex: 1,
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Planning opportunity
              </div>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>💡</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                Ask your advisor about strategies that could reduce your tax bill for next year.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subtitles bar at bottom */}
      <div style={{
        background: 'rgba(26, 18, 48, 0.92)',
        padding: '12px 28px',
        minHeight: '52px',
        display: 'flex', alignItems: 'center',
      }}>
        {/* Subtitle text is injected by the parent composition */}
        <div id="subtitle-slot" />
      </div>
    </AbsoluteFill>
  );
}
