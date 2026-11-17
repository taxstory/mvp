// netlify/functions/generate-pdf-summary.js
// Generates a branded one-page PDF companion for a completed walkthrough.
// Uses PDFKit (pure JS, no binaries — works in Netlify SES sandbox).
// Output stored in Supabase audio bucket; URL saved to tax_returns.pdf_summary_url.

const { makeHandler, getFirmProfile } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { requireUuid } = require('./_validate');
const { signedUrl } = require('./_storage');
const { safeColor, clip } = require('./_html');

exports.config = { timeout: 26 };

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  await rateLimit(supabase, `pdf-summary:${user.id}`, 60, 3600, 'Too many PDF summaries this hour. Please wait a few minutes.');

  const [{ data: taxReturn, error: retErr }, profile] = await Promise.all([
    db.from('tax_returns')
      .select('id, tax_year, parsed_data, script_json, audio_segments, clients(name)')
      .eq('id', taxReturnId).eq('user_id', user.id).single(),
    getFirmProfile(db, user.id),
  ]);

  if (retErr || !taxReturn) throw Object.assign(new Error('Return not found'), { statusCode: 404 });

  // Everything below is stored data a user can influence (a colour typed into Settings, a script edited in the app): validate and BOUND it before it reaches the PDF library. A non-string colour,
  // a non-array script or a 200,000-character segment used to crash the handler (500) or keep it busy for 38 seconds — longer than the function's own time limit.
  const text1 = (v, max, fallback) => { const t = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').trim() : ''; return t ? clip(t, max) : fallback; };
  const hex6  = c => (c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c);       // #fff → #ffffff (the channel maths below needs six digits)
  const pd         = taxReturn.parsed_data && typeof taxReturn.parsed_data === 'object' && !Array.isArray(taxReturn.parsed_data) ? taxReturn.parsed_data : {};
  const rawSegs    = Array.isArray(taxReturn.script_json) ? taxReturn.script_json : Array.isArray(taxReturn.audio_segments) ? taxReturn.audio_segments : [];
  const segments   = rawSegs.filter(x => x && typeof x === 'object').slice(0, 40)
    .map(x => ({ section: typeof x.section === 'string' ? x.section : '', field_ref: typeof x.field_ref === 'string' ? x.field_ref : '', text: typeof x.text === 'string' ? clip(x.text, 600) : '' }));
  const firmName   = text1(profile.firm_name, 80, 'Your Tax Advisor');
  const brand      = hex6(safeColor(profile.brand_color));
  const clientName = text1(taxReturn.clients?.name, 80, 'Client');
  const yr         = Number(taxReturn.tax_year);
  const year       = Number.isInteger(yr) && yr >= 1990 && yr <= 2100 ? yr : new Date().getFullYear() - 1;

  const PDFDocument = require('pdfkit');
  const chunks = [];
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 48, left: 54, right: 54 },
    info: { Title: `${year} Tax Return Summary — ${clientName}`, Author: firmName, Creator: 'TaxStory' } });
  doc.on('data', c => chunks.push(c));

  const pageW = 612 - 108;
  const fmt   = n => (n == null || !Number.isFinite(Number(n))) ? '—' : '$' + Math.abs(Math.round(Number(n))).toLocaleString('en-US');
  const fmtP  = n => (n == null || !Number.isFinite(Number(n))) ? '—' : `${Number(n).toFixed(1)}%`;
  const [r, g, b] = [parseInt(brand.slice(1,3),16), parseInt(brand.slice(3,5),16), parseInt(brand.slice(5,7),16)];

  // Header band
  doc.rect(0, 0, 612, 72).fill(brand);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text(firmName, 54, 20, { width: pageW * 0.65 });
  doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(10)
    .text(`${year} Tax Return Summary · Prepared for ${clientName}`, 54, 42);
  doc.fillColor([r,g,b,0.2]).rect(512, 12, 72, 48).fill();
  doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text(String(year), 512, 24, { width: 62, align: 'center' });
  doc.y = 92;

  // Key figures grid
  doc.fillColor('#1A1230').font('Helvetica-Bold').fontSize(11).text('Key Figures', 54, doc.y);
  doc.moveDown(0.3);

  const figures = [
    ['Total Income',   fmt(pd.total_income  || pd.totalIncome)],
    ['Federal Tax',    fmt(pd.federal_tax   || pd.totalTax)],
    ['Effective Rate', fmtP(pd.effective_rate || pd.effectiveRate)],
    ['Adjusted Gross Income', fmt(pd.agi)],
    ['Standard / Itemized Deduction', fmt(pd.standard_deduction || pd.standardDeduction)],
    [pd.refund_or_owed >= 0 || pd.refund != null ? 'Refund' : 'Amount Owed',
      fmt(pd.refund_or_owed ?? pd.refund ?? pd.amountOwed)],
  ];
  const figY = doc.y, cellW = (pageW - 12) / 2, cellH = 38;
  figures.forEach(([label, value], i) => {
    const col = i % 2 === 0 ? 54 : 54 + cellW + 12;
    const y   = figY + Math.floor(i / 2) * (cellH + 6);
    doc.fillColor('#F7F6FF').rect(col, y, cellW, cellH).fill();
    doc.fillColor('#6B698A').font('Helvetica').fontSize(8).text(label.toUpperCase(), col + 10, y + 8, { width: cellW - 20 });
    doc.fillColor('#1A1230').font('Helvetica-Bold').fontSize(16).text(value, col + 10, y + 18, { width: cellW - 20 });
  });
  doc.y = figY + 3 * (cellH + 6) + 14;

  doc.strokeColor(brand).lineWidth(2).moveTo(54, doc.y).lineTo(54 + pageW, doc.y).stroke();
  doc.moveDown(0.8);

  // Walkthrough summary
  doc.fillColor('#1A1230').font('Helvetica-Bold').fontSize(11).text('Your Walkthrough — At a Glance');
  doc.moveDown(0.4);
  segments.filter(s => !['intro','outro'].includes(s.field_ref || s.section)).slice(0, 6)
    .forEach(seg => {
      const first = (seg.text || '').split(/\.\s/)[0].replace(/\.$/, '');
      const label = (seg.field_ref || seg.section || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      doc.fillColor(brand).font('Helvetica-Bold').fontSize(8.5).text(`${label}  `, 54, doc.y, { continued: true, width: pageW });
      doc.fillColor('#6B698A').font('Helvetica').fontSize(8.5).text(first + '.', { width: pageW });
      doc.moveDown(0.3);
    });

  // Planning flags
  const planSegs = segments.filter(s => s.field_ref === 'planning_tip' || s.section === 'planning');
  if (planSegs.length) {
    doc.moveDown(0.5);
    doc.strokeColor(brand).lineWidth(2).moveTo(54, doc.y).lineTo(54 + pageW, doc.y).stroke();
    doc.moveDown(0.8);
    doc.fillColor('#1A1230').font('Helvetica-Bold').fontSize(11).text('Planning Opportunities');
    doc.moveDown(0.4);
    planSegs.forEach((seg, i) => {
      doc.fillColor(brand).font('Helvetica-Bold').fontSize(9).text(`${i + 1}.  `, 54, doc.y, { continued: true });
      doc.fillColor('#1A1230').font('Helvetica').fontSize(9).text(seg.text || '', { width: pageW - 20 });
      doc.moveDown(0.4);
    });
  }

  // Footer
  const footerY = 720;
  doc.strokeColor('#E2DFF8').lineWidth(1).moveTo(54, footerY).lineTo(54 + pageW, footerY).stroke();
  doc.fillColor('#6B698A').font('Helvetica').fontSize(8)
    .text(`Questions? Contact ${firmName}${text1(profile.phone, 40, '') ? ' · ' + text1(profile.phone, 40, '') : ''}${text1(profile.website, 120, '') ? ' · ' + text1(profile.website, 120, '') : ''}`, 54, footerY + 10, { width: pageW * 0.75 });
  doc.fillColor('#C0BDD8').fontSize(7)
    .text('Prepared with TaxStory AI · For informational purposes only · Not tax advice', 54, footerY + 24, { width: pageW });
  doc.end();

  const pdfBuffer = await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pdfPath = `${user.id}/${taxReturnId}/summary.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('audio').upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) throw new Error(`Failed to store PDF: ${uploadErr.message}`);

  // Private bucket: store the PATH; hand back a short-lived signed URL.
  await supabase.from('tax_returns').update({ pdf_summary_url: pdfPath }).eq('id', taxReturnId).eq('user_id', user.id);
  const pdfUrl = await signedUrl(supabase, pdfPath, 3600, { ownerId: user.id });

  return { statusCode: 200, body: JSON.stringify({ ok: true, pdfUrl }) };
});
