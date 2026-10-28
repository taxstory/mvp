// netlify/functions/report-bug.js
// Receives a bug/feedback report from an authenticated CPA and:
//   1. Stores it in the feedback table
//   2. Emails the TaxStory team (Zach) via Resend with full context
//
// Triggered by the "Report a bug / share feedback" panel in AppLayout.

const { makeHandler } = require('./_handler');
const { escapeHtml, headerText } = require('./_html');
const { siteOrigin } = require('./_site');
const { redactIdentifiers } = require('./_pii');
const { rateLimit } = require('./_ratelimit');
const { Resend }       = require('resend');

exports.config = { timeout: 26 };

exports.handler = makeHandler([], async (event, { supabase, user, body }) => {
  await rateLimit(supabase, `report-bug:${user.id}`, 10, 3600, 'You have sent a lot of reports. Please try again in an hour.');
  const TYPES = ['bug', 'feature', 'ux', 'other'], SEVERITIES = ['low', 'medium', 'high'];
  const type     = TYPES.includes(body.type) ? body.type : 'bug';
  const severity = SEVERITIES.includes(body.severity) ? body.severity : 'medium';
  const title    = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const pageUrl  = typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : null;
  const description = typeof body.description === 'string' ? redactIdentifiers(body.description) : body.description;   // never forward a pasted SSN/EIN

  if (typeof description !== 'string' || !description.trim()) {
    throw Object.assign(new Error('description required'), { statusCode: 400 });
  }
  if (description.length > 5000) throw Object.assign(new Error('Description is too long (5,000 characters maximum)'), { statusCode: 400 });

  // Store in DB
  const { error: dbErr } = await supabase.from('feedback').insert({
    user_id:     user.id,
    type:        type     || 'bug',
    title:       title    || 'Untitled',
    description: description.trim(),
    page_url:    pageUrl  || null,
    severity:    severity || 'medium',
    status:      'open',
    created_at:  new Date().toISOString(),
  });
  if (dbErr) throw new Error(`Failed to store feedback: ${dbErr.message}`);

  // Email the team
  if (process.env.RESEND_API_KEY && process.env.TAXSTORY_TEAM_EMAIL) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const typeEmoji = { bug: '🐛', feature: '💡', ux: '👁', other: '📝' }[type] || '📝';
    const sevColor  = { low: '#6B698A', medium: '#F59E0B', high: '#E24B4A' }[severity] || '#6B698A';

    await resend.emails.send({
      from:    'TaxStory Feedback <notifications@tellmytaxstory.com>',
      to:      process.env.TAXSTORY_TEAM_EMAIL,
      subject: `${typeEmoji} [${severity.toUpperCase()}] ${headerText(title || description.trim(), 80)}`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F6FF;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E2DFF8">
  <tr><td style="background:#1A1230;padding:18px 24px;display:flex;align-items:center;gap:10">
    <span style="font-size:24px">${typeEmoji}</span>
    <div>
      <div style="font-size:16px;font-weight:700;color:#fff">${escapeHtml(title || 'Feedback received')}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">
        ${escapeHtml(type.toUpperCase())} · <span style="color:${sevColor};font-weight:700">${escapeHtml(severity.toUpperCase())}</span>
      </div>
    </div>
  </td></tr>
  <tr><td style="padding:20px 24px">
    <div style="font-size:13px;color:#6B698A;margin-bottom:6px;font-weight:600">Description</div>
    <div style="font-size:14px;color:#1A1230;line-height:1.7;padding:12px 14px;background:#F9F8FF;border-radius:8px;border-left:3px solid #6B5CE7;margin-bottom:16px">
      ${escapeHtml(description.trim()).replace(/\r?\n/g, '<br>')}
    </div>
    <div style="font-size:12px;color:#6B698A">
      <strong>User:</strong> ${escapeHtml(user.email)}<br>
      <strong>Page:</strong> ${escapeHtml(pageUrl || 'unknown')}<br>
      <strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
    </div>
  </td></tr>
  <tr><td style="background:#F7F6FF;padding:12px 24px;text-align:center">
    ${siteOrigin() ? `<a href="${siteOrigin()}/admin/feedback" style="font-size:12px;color:#6B5CE7;text-decoration:none">View all feedback →</a>` : ''}
  </td></tr>
</table>
</td></tr></table></body></html>`,
    }).catch(e => console.error('report-bug email failed:', e.message));
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
