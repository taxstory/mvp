// netlify/functions/parse-return.js
// PII-free PDF parser for Form 1040 and common schedules.
//
// Security model:
//   1. Allowlist  — only whitelisted camelCase keys can appear in output
//   2. Blocklist  — SSN / EIN / name / address patterns throw immediately
//   3. Threshold  — values under $100 are discarded (eliminates line numbers,
//                   form codes, page numbers misread as dollar amounts)
//   4. Audit log  — every parse attempt logged to Supabase (no payload)

const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── PII blocklist ─────────────────────────────────────────────────────────────
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,                       // SSN
  /\b\d{2}-\d{7}\b/,                              // EIN
  /\d{1,5}\s+[A-Z][a-z]+\s+(St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl)\b/i, // Street address
];

// ── Allowlist ─────────────────────────────────────────────────────────────────
const ALLOWED_KEYS = new Set([
  'taxYear', 'filingStatus',
  'wages', 'taxableInterest', 'qualifiedDividends', 'ordinaryDividends',
  'iraDistributions', 'taxableIRA', 'pensionsAnnuities', 'taxablePensions',
  'socialSecurityBenefits', 'taxableSocialSecurity', 'capitalGainLoss',
  'scheduleC_netProfit', 'scheduleE_netIncome', 'otherIncome',
  'totalIncome', 'adjustmentsToIncome', 'agi',
  'standardDeduction', 'itemizedDeductions', 'qbiDeduction',
  'taxableIncome', 'regularTax', 'alternativeMinTax',
  'selfEmploymentTax', 'totalTax', 'totalPayments',
  'federalWithheld', 'estimatedTaxPayments', 'refund', 'amountOwed',
  'effectiveRate', 'marginalRate', 'numberOfDependents',
]);

// ── Filing status normalization ───────────────────────────────────────────────
const FILING_STATUS_MAP = {
  'single':                       'Single',
  'married filing jointly':        'Married filing jointly',
  'married filing separately':     'Married filing separately',
  'head of household':             'Head of household',
  'qualifying surviving spouse':   'Qualifying surviving spouse',
  'qualifying widow':              'Qualifying surviving spouse',
};

// ── Line patterns — maps 1040 line labels to our field keys ──────────────────
// Each entry: [fieldKey, ...regexPatterns]
// Patterns match text immediately before a dollar amount on that line.
const LINE_PATTERNS = [
  // Income section
  ['wages',              /\b1[az][\s.]*(?:total\s+)?(?:wages?|w-?2)\b/i,
                         /wages,?\s+salaries,?\s+tips/i],
  ['taxableInterest',    /\b2b[\s.]*taxable\s+interest/i],
  ['ordinaryDividends',  /\b3b[\s.]*ordinary\s+dividends/i],
  ['qualifiedDividends', /\b3a[\s.]*qualified\s+dividends/i],
  ['taxableIRA',         /\b4b[\s.]*taxable\s+amount/i,
                         /ira\s+distributions.*taxable/i],
  ['taxablePensions',    /\b5b[\s.]*taxable\s+amount/i,
                         /pensions.*taxable/i],
  ['taxableSocialSecurity', /\b6b[\s.]*taxable\s+amount/i,
                         /social\s+security.*taxable/i],
  ['capitalGainLoss',    /\b7a[\s.]*capital\s+gain/i],
  ['otherIncome',        /\b8[\s.]*additional\s+income/i,
                         /schedule\s+1.*line\s+10/i],
  ['totalIncome',        /\b9[\s.]*(?:this\s+is\s+your\s+)?total\s+income/i,
                         /add\s+lines.*1z.*8\b/i],
  // Adjustments
  ['adjustmentsToIncome',/\b10[\s.]*adjustments\s+to\s+income/i],
  ['agi',                /\b11a[\s.]*(?:subtract|adjusted\s+gross)/i,
                         /adjusted\s+gross\s+income/i],
  // Deductions
  ['standardDeduction',  /\b12e[\s.]*standard\s+deduction/i,
                         /standard\s+deduction\s+or\s+itemized/i],
  ['qbiDeduction',       /\b13a[\s.]*qualified\s+business/i],
  ['taxableIncome',      /\b15[\s.]*(?:this\s+is\s+your\s+)?taxable\s+income/i,
                         /subtract\s+line\s+14/i],
  // Tax & credits
  ['regularTax',         /\b16[\s.]*tax\b/i],
  ['alternativeMinTax',  /\b17[\s.]*(?:amount\s+from\s+schedule\s+2|alternative\s+minimum)/i],
  ['totalTax',           /\b24[\s.]*(?:this\s+is\s+your\s+)?total\s+tax/i,
                         /add\s+lines\s+22\s+and\s+23/i],
  // Payments
  ['federalWithheld',    /\b25d[\s.]*(?:add\s+lines|federal\s+income\s+tax\s+withheld)/i,
                         /federal\s+(?:income\s+)?tax\s+withheld/i],
  ['estimatedTaxPayments',/\b26[\s.]*estimated\s+tax/i],
  ['selfEmploymentTax',  /\bself.?employment\s+tax/i],
  // Refund / owed
  ['refund',             /\b35a[\s.]*(?:amount.*refunded|refund)/i,
                         /\b34[\s.]*(?:amount\s+you\s+)?overpaid/i],
  ['amountOwed',         /\b37[\s.]*(?:amount\s+you\s+)?owe/i],
];

// ── Dollar amount extraction ──────────────────────────────────────────────────
// Matches: 1,234  or  1,234.00  or  (1,234)  — with or without $ sign
// Negative amounts can appear in parens on tax forms
const DOLLAR_RE = /\(?([\d,]+(?:\.\d{1,2})?)\)?/;

// Minimum meaningful dollar value — filters out line numbers, codes, page numbers
const MIN_VALUE = 100;

function extractAmount(text, startIdx) {
  const slice = text.slice(startIdx, startIdx + 200);
  const m = DOLLAR_RE.exec(slice);
  if (!m) return null;
  const raw = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(raw) || raw < MIN_VALUE) return null;
  // Check if wrapped in parens = negative
  const isNeg = slice[m.index - 1] === '(';
  return isNeg ? -raw : raw;
}

// ── Filing status detection ───────────────────────────────────────────────────
function detectFilingStatus(text) {
  const lower = text.toLowerCase();
  // Order matters — check more specific first
  for (const [key, label] of Object.entries(FILING_STATUS_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (lower.includes(key)) return label;
  }
  return null;
}

// ── Tax year detection ────────────────────────────────────────────────────────
function detectTaxYear(text) {
  // Look for "Form 1040 ... 20XX" or "tax year ... 20XX"
  const m = text.match(/(?:form\s+1040|tax\s+year|for\s+the\s+year)[^\d]*(\b20\d{2}\b)/i);
  if (m) return parseInt(m[1]);
  // Fallback: first 4-digit year starting with 20
  const m2 = text.match(/\b(20\d{2})\b/);
  return m2 ? parseInt(m2[1]) : new Date().getFullYear() - 1;
}

// ── Main parser ───────────────────────────────────────────────────────────────
function parseReturnText(text) {
  const result = {};
  const lower  = text.toLowerCase();

  // PII check — throw immediately if any PII found in raw text
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`PII_DETECTED: Blocked field matched security pattern ${pattern}`);
    }
  }

  // Tax year and filing status
  const taxYear = detectTaxYear(text);
  if (taxYear) result.taxYear = taxYear;

  const filingStatus = detectFilingStatus(text);
  if (filingStatus) result.filingStatus = filingStatus;

  // Scan each line pattern
  for (const [fieldKey, ...patterns] of LINE_PATTERNS) {
    for (const pattern of patterns) {
      const idx = lower.search(pattern);
      if (idx === -1) continue;
      const amount = extractAmount(text, idx);
      if (amount !== null) {
        result[fieldKey] = amount;
        break; // first match wins
      }
    }
  }

  // Compute derived fields if not directly parsed
  if (!result.totalIncome && (result.wages || result.ordinaryDividends || result.capitalGainLoss)) {
    result.totalIncome = (result.wages || 0)
      + (result.ordinaryDividends || 0)
      + (result.taxableIRA || 0)
      + (result.taxablePensions || 0)
      + (result.taxableSocialSecurity || 0)
      + (result.capitalGainLoss || 0)
      + (result.otherIncome || 0);
  }

  if (!result.agi && result.totalIncome) {
    result.agi = result.totalIncome - (result.adjustmentsToIncome || 0);
  }

  // Effective rate
  if (result.totalTax && result.agi && result.agi > 0) {
    result.effectiveRate = parseFloat((result.totalTax / result.agi * 100).toFixed(1));
  }

  // Strip any key not on allowlist
  for (const key of Object.keys(result)) {
    if (!ALLOWED_KEYS.has(key)) delete result[key];
  }

  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let taxReturnId, storagePath;
  try {
    ({ taxReturnId, storagePath } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Audit log — start (no payload logged)
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'parse_attempt',
    description: `Parse started for return ${taxReturnId}`,
  }).catch(() => {});

  try {
    // Download PDF from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('tax-returns')
      .download(storagePath);
    if (dlErr) throw new Error(`Storage download failed: ${dlErr.message}`);

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { text } = await pdfParse(buffer);

    if (!text || text.trim().length < 100) {
      throw new Error('PDF contains no readable text. Please use a digitally-generated PDF, not a scanned image.');
    }

    // Parse
    const parsedData = parseReturnText(text);

    // Validate — must have at least one meaningful financial field
    const financialKeys = ['wages','totalIncome','agi','taxableIncome','totalTax','federalWithheld','refund','amountOwed'];
    const hasData = financialKeys.some(k => parsedData[k] != null && parsedData[k] !== 0);

    if (!hasData) {
      // Update status to reflect empty parse
      await supabase.from('tax_returns').update({
        status: 'parsed',
        parsed_data: parsedData,
        tax_year: parsedData.taxYear || null,
      }).eq('id', taxReturnId);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          warning: 'Limited data extracted. The PDF may be a blank template, scanned image, or use an unsupported format. Try uploading a completed, digitally-generated tax return.',
          data: parsedData,
        }),
      };
    }

    // Save to DB
    await supabase.from('tax_returns').update({
      status: 'parsed',
      parsed_data: parsedData,
      tax_year: parsedData.taxYear || null,
    }).eq('id', taxReturnId);

    // Audit log — success
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'parse_success',
      description: `Parse complete for return ${taxReturnId} — ${Object.keys(parsedData).length} fields extracted`,
    }).catch(() => {});

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: parsedData }),
    };

  } catch (err) {
    // Update status to error
    await supabase.from('tax_returns').update({ status: 'error' }).eq('id', taxReturnId).catch(() => {});

    // Audit log — failure
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'parse_error',
      description: `Parse failed for return ${taxReturnId}: ${err.message}`,
    }).catch(() => {});

    console.error('parse-return error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
