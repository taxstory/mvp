// netlify/functions/create-share-link.js
// Creates a tokenized share link for a completed walkthrough.
// Optionally sends a branded delivery email to the client via Resend.

const { makeHandler, getFirmProfile } = require('./_handler');
const { escapeHtml, clip, safeColor, safeHttpsUrl, headerText, isEmail } = require('./_html');
const { requireSiteOrigin } = require('./_site');
const { redactForLog } = require('./_logError');
const { rateLimit } = require('./_ratelimit');
const { requireUuid } = require('./_validate');
const { Resend } = require('resend');

exports.config = { timeout: 26 };

exports.handler = makeHandler([], async (event, { supabase, db, user, body }) => {
  const { taxReturnId, sendTo = null, clientName = null } = body;
  requireUuid(taxReturnId, 'taxReturnId');
  const baseUrl = requireSiteOrigin();   // before anything is written: a misconfigured site must not leave an orphan share link
  // Every option is bounded/allow-listed rather than trusted: values are stored, emailed and used in date arithmetic.
  const sendEmail = body.sendEmail === true;
  const label     = typeof body.label === 'string' ? body.label.trim().slice(0, 100) : undefined;
  const deliveryMethod = ['copied', 'email', 'other'].includes(body.deliveryMethod) ? body.deliveryMethod : 'copied';
  const expiryDays = body.expiryDays == null ? null : Number(body.expiryDays);
  if (expiryDays !== null && (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365)) {
    throw Object.assign(new Error('expiryDays must be a whole number between 1 and 365'), { statusCode: 400 });
  }

  await rateLimit(supabase, `share-link:${user.id}`, 100, 86400, 'Daily share-link limit reached.');
  if (sendEmail) await rateLimit(supabase, `share-email:${user.id}`, 50, 86400, 'Daily email limit reached. Copy the link and send it yourself, or try again tomorrow.');

  // Verify ownership + confirm audio exists
  const { data: taxReturn, error: retErr } = await db
    .from('tax_returns')
    .select('id, tax_year, audio_url, video_url')
    .eq('id', taxReturnId)
    .eq('user_id', user.id)
    .single();

  if (retErr || !taxReturn) throw Object.assign(new Error('Return not found'), { statusCode: 404 });
  if (!taxReturn.audio_url && !taxReturn.video_url) {
    throw Object.assign(new Error('No video or audio ready for this return yet'), { statusCode: 400 });
  }

  // Validate BEFORE creating anything (previously a bad address was rejected only after the link already existed).
  if (sendEmail && sendTo && !isEmail(sendTo)) {
    throw Object.assign(new Error('A valid recipient email address is required'), { statusCode: 400 });
  }
  // Labels-only firms never store a recipient address: it is used once to send the email and discarded. (The database enforces this
  // as well — guard_link_contact — this keeps the function correct on its own.)
  const { data: modeRow } = await db.from('profiles').select('privacy_mode').eq('id', user.id).maybeSingle();
  const labelsOnly = (modeRow?.privacy_mode ?? 'labels_only') === 'labels_only';

  const { data: shareToken, error: linkError } = await supabase.rpc('create_share_link_for', {
    p_user_id:         user.id,          // ownership is re-checked INSIDE the database function
    p_tax_return_id:   taxReturnId,
    p_label:           label || `Shared ${new Date().toLocaleDateString()}`,
    p_expires_days:    expiryDays,
    p_delivery_method: sendEmail ? 'email' : deliveryMethod,
    p_sent_to:         labelsOnly ? null : sendTo,
  });

  if (linkError) throw new Error(`Failed to create share link: ${linkError.message}`);

  const viewerUrl = `${baseUrl}/view/${shareToken}`;

  // Optional email delivery
  let emailSent = false;
  if (sendEmail && sendTo && process.env.RESEND_API_KEY) {
    const profile  = await getFirmProfile(db, user.id);
    const firmName = profile.firm_name || 'Your Tax Advisor';
    const resend   = new Resend(process.env.RESEND_API_KEY);

    const { error: emailError } = await resend.emails.send({
      from:    `${headerText(firmName, 60) || 'Your Tax Advisor'} <noreply@tellmytaxstory.com>`,
      to:      sendTo,
      subject: `Your ${Number(taxReturn.tax_year) || ''} Tax Return Walkthrough — ${headerText(firmName, 60)}`,
      html:    buildClientEmail({ clientName: clientName || 'Client', firmName, brandColor: profile.brand_color || '#6B5CE7', logoUrl: profile.logo_url, taxYear: taxReturn.tax_year, viewerUrl }),
    });
    if (!emailError) emailSent = true;
    else console.error('Email send error:', redactForLog(emailError?.message || emailError));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, token: shareToken, viewerUrl, emailSent,
      expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null,
    }),
  };
});

// ── Email template ─────────────────────────────────────────────────────────
function buildClientEmail(args) {
  // Encode every dynamic value for its context (text, attribute, style, URL). See _html.js.
  const clientName = escapeHtml(clip(args.clientName, 100));
  const firmName   = escapeHtml(clip(args.firmName, 100));
  const brandColor = safeColor(args.brandColor);
  const logoSafe   = safeHttpsUrl(args.logoUrl);
  const logoUrl    = logoSafe ? escapeHtml(logoSafe) : null;
  const taxYear    = escapeHtml(Number(args.taxYear) || '');
  const viewerUrl  = escapeHtml(args.viewerUrl);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F6FF;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
<tr><td align="center"><table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2DFF8">
  <tr><td style="background:${brandColor};padding:24px 28px 20px">
    ${logoUrl ? `<img src="${logoUrl}" height="36" style="margin-bottom:10px;border-radius:6px" alt="${firmName}">` : ''}
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#fff">${firmName}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:4px">Your ${taxYear} Tax Return Walkthrough</div>
  </td></tr>
  <tr><td style="padding:28px">
    <p style="font-size:14px;color:#1A1230;margin:0 0 16px">Hi ${clientName},</p>
    <p style="font-size:14px;color:#1A1230;margin:0 0 20px">Your ${taxYear} tax return walkthrough is ready. Click below to watch — no login required.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td align="center">
        <a href="${viewerUrl}" style="display:inline-block;background:${brandColor};color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none">
          Watch your walkthrough →
        </a>
      </td></tr>
    </table>
    <p style="font-size:12px;color:#6B698A;line-height:1.7">Or paste this link in your browser:<br><a href="${viewerUrl}" style="color:${brandColor}">${viewerUrl}</a></p>
  </td></tr>
  <tr><td style="background:#F7F6FF;padding:14px 28px;text-align:center">
    <p style="font-size:11px;color:#A0A0C0;margin:0">Powered by <a href="https://tellmytaxstory.com" style="color:#6B5CE7">TaxStory</a></p>
  </td></tr>
</table></td></tr></table></body></html>`;
}
