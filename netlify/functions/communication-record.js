// netlify/functions/communication-record.js — one PDF per walkthrough: what the client was told, which figures were used, who approved any
// figure that was not on the return, and how and when it was delivered and viewed. For an advisor's books and records (e.g. an RIA keeping
// client communications). Built on request from data already stored, returned to the browser, never saved by TaxStory.
//   POST { taxReturnId }  →  { ok, filename, pdfBase64 }
// Everything is read through the CALLER-scoped client (row-level security), after an ownership check. No client name is printed: the
// return's label and the client label are what the advisor chose to enter.
const PDFDocument = require('pdfkit');
const { makeHandler, getTaxReturn, getFirmProfile, audit } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { requireUuid } = require('./_validate');
const { buildFacts } = require('./_scriptFacts');
const { SOURCES } = require('./_scriptTemplates');

exports.config = { timeout: 26 };
const SCEN_LABELS = { base_tax: 'Estimated federal tax — current plan', scenario_tax: 'Estimated federal tax — chosen option', tax_difference: 'Difference', base_rate: 'Effective rate — current plan (%)', scenario_rate: 'Effective rate — chosen option (%)' };
const money = v => (typeof v === 'number' ? (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') : String(v ?? '—'));
const when  = t => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  await rateLimit(supabase, `communication-record:${user.id}`, 60, 3600, 'Too many records requested this hour. Please wait a few minutes.');

  const ret = await getTaxReturn(db, taxReturnId, user.id, 'id, user_id, client_id, file_name, tax_year, status, parsed_data, audio_segments, script_json, video_url, created_at, clients(name)');
  const narration = Array.isArray(ret.audio_segments) && ret.audio_segments.length ? ret.audio_segments : (ret.script_json || []);
  if (!narration.length) throw Object.assign(new Error('There is no walkthrough for this return yet.'), { statusCode: 409 });
  const firm = await getFirmProfile(db, user.id);

  const isScenario = Array.isArray(ret.parsed_data?.scenarios);
  const facts = isScenario ? Object.entries(ret.parsed_data?.walkthrough?.figures || {}).map(([k, v]) => [k, v, /rate/.test(k) ? 'percent' : 'money'])
                           : Object.entries(buildFacts(ret.parsed_data || {}, ret.tax_year).facts).filter(([, f]) => f.kind === 'money' || f.kind === 'percent').map(([k, f]) => [k, f.value, f.kind]);
  const { data: approvals } = await db.from('narration_approvals').select('version, approved_at, kind, note, approved_amounts').eq('tax_return_id', ret.id).order('version');
  const { data: links } = await db.from('video_share_links').select('id, label, created_at, expires_at, is_active').eq('tax_return_id', ret.id).order('created_at');
  const linkIds = (links || []).map(l => l.id);
  const { data: events } = linkIds.length
    ? await db.from('video_view_events').select('share_link_id, event_type, created_at').in('share_link_id', linkIds).order('created_at')
    : { data: [] };

  // ── PDF ──
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 48, left: 54, right: 54 }, info: { Title: 'Client communication record', Creator: 'TaxStory' } });
  const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise(r => doc.on('end', r));
  const L = 54;
  const H = (t) => { doc.x = L; doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#1A1230').text(t, L); doc.moveDown(0.25).font('Helvetica').fontSize(9.5).fillColor('#222'); };
  const row = (a, b) => {                       // two columns; the next line starts below the TALLER of the two, back at the left margin
    const y = doc.y; doc.text(a, L, y, { width: 250 }); const yA = doc.y;
    doc.text(b, 320, y, { width: 238 }); doc.y = Math.max(yA, doc.y); doc.x = L; doc.moveDown(0.15);
  };
  const label = k => SCEN_LABELS[k] || (SOURCES?.[k] ? `${SOURCES[k].split(' — ')[0]} — ${k.replace(/_/g, ' ')}` : k.replace(/_/g, ' '));

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1A1230').text('Client communication record');
  doc.font('Helvetica').fontSize(9).fillColor('#6B698A')
    .text(`${firm.firm_name || 'Advisor'} · prepared with TaxStory · generated ${when(new Date().toISOString())}`);
  H('Walkthrough');
  row('Return / record', ret.file_name || '—');
  row('Client label', ret.clients?.name || '—');
  row('Tax year', String(ret.tax_year ?? '—'));
  row('Type', isScenario ? 'Planning scenario comparison (estimates)' : 'Filed-return walkthrough');
  row('Video', ret.video_url ? 'Rendered and attached to the share link' : 'Audio walkthrough (no rendered video)');

  H('What the client was told (narration, in order)');
  narration.forEach((s, i) => { doc.text(`${i + 1}. ${s.text}`, L, doc.y, { width: 504 }); doc.moveDown(0.15); });

  H(isScenario ? 'Figures used (computed by the advisor\'s scenario; estimates)' : 'Figures used (read from the return)');
  if (!facts.length) doc.text('—', L);
  for (const [k, v, kind] of facts) row(label(k), kind === 'percent' ? `${v}%` : money(v));

  H('Advisor approvals of figures not on the return');
  if (!(approvals || []).length) doc.text('None — every amount narrated was on the return.', L);
  for (const a of approvals || []) {
    row(`Version ${a.version} · ${when(a.approved_at)}`, `${(a.kind || '').replace(/_/g, ' ')}: ${(a.approved_amounts || []).map(money).join(', ') || '—'}`);
    if (a.note) { doc.fillColor('#6B698A').text(`Note: ${a.note}`, L, doc.y, { width: 504 }); doc.fillColor('#222'); }
  }

  H('Delivery and viewing');
  if (!(links || []).length) doc.text('Not shared yet.', L);
  for (const l of links || []) {
    row(`Share link "${l.label || 'untitled'}"`, `created ${when(l.created_at)} · expires ${when(l.expires_at)} · ${l.is_active ? 'active' : 'revoked'}`);
    for (const e of (events || []).filter(x => x.share_link_id === l.id && x.event_type !== 'view_progress'))
      row('   viewing activity', `${e.event_type === 'view_complete' ? 'watched to the end' : e.event_type === 'link_opened' ? 'opened' : e.event_type.replace(/_/g, ' ')} · ${when(e.created_at)}`);
  }
  doc.x = L; doc.moveDown(1).fontSize(8).fillColor('#6B698A').text('Viewing activity lists when each link was opened, started and watched to the end (repeat opens within 30 minutes count once). TaxStory does not store this PDF; keep it with your own records.', { width: 504 });
  doc.end(); await done;

  await audit(supabase, user.id, 'communication_record', `Communication record generated for ${ret.id}.`);
  const filename = `communication-record-${ret.tax_year || 'return'}-${ret.id.slice(0, 8)}.pdf`;
  return { statusCode: 200, body: JSON.stringify({ ok: true, filename, pdfBase64: Buffer.concat(chunks).toString('base64') }) };
});
