// netlify/functions/client-message.js
// Receives an inbound message FROM a client and:
//   1. Stores it in the messages table (direction: 'inbound')
//   2. Emails the CPA immediately via Resend
//   3. Returns confirmation to the client
//
// This function is PUBLIC — no JWT required, authenticated by the share token.
// The client proves identity by holding a valid share token.
// Called from VideoViewer.jsx "Reply to advisor" form.

const { makeHandler } = require('./_handler');
const { escapeHtml, clip, safeColor, headerText, isEmail } = require('./_html');
const { siteOrigin } = require('./_site');
const { redactForLog } = require('./_logError');
const { rateLimit, clientIp } = require('./_ratelimit');
const { redactIdentifiers } = require('./_pii');
const crypto = require('crypto');
const { Resend }       = require('resend');

exports.config = { timeout: 26 };

exports.handler = makeHandler([], async (event, { supabase, body }) => {
  const { token, clientName, messageBody } = body;

  if (!token)       throw Object.assign(new Error('token required'), { statusCode: 400 });
  if (typeof token !== 'string' || token.length > 100) throw Object.assign(new Error('Invalid share token'), { statusCode: 401 });
  if (typeof messageBody !== 'string' || !messageBody.trim()) throw Object.assign(new Error('message body required'), { statusCode: 400 });
  if (messageBody.length > 5000) throw Object.assign(new Error('Message is too long (5,000 characters maximum)'), { statusCode: 400 });

  // Abuse controls (this endpoint is public and sends email to the advisor).
  await rateLimit(supabase, `msg-ip:${clientIp(event)}`, 20, 3600, 'You have sent too many messages. Please try again later.');
  await rateLimit(supabase, `msg-token:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 10)}`, 10, 3600, 'You have sent too many messages for this link. Please try again later.');

  // Validate token — client must hold a live share link
  const { data: link, error: linkErr } = await supabase
    .from('video_share_links')
    .select('id, firm_id, tax_return_id, is_active, expires_at, sent_to, label')
    .eq('token', token)
    .single();

  if (linkErr || !link)    throw Object.assign(new Error('Invalid share token'), { statusCode: 401 });
  if (!link.is_active)     throw Object.assign(new Error('Link is no longer active'), { statusCode: 410 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw Object.assign(new Error('Link has expired'), { statusCode: 410 });
  }

  // Fetch firm info and tax return for context
  const [{ data: profile }, { data: taxReturn }] = await Promise.all([
    supabase.from('profiles').select('firm_name, brand_color, phone, website').eq('id', link.firm_id).maybeSingle(),
    supabase.from('tax_returns').select('tax_year, clients(id, name)').eq('id', link.tax_return_id).maybeSingle(),
  ]);

  // Plain-text variants for headers/subjects; escaped variants for HTML. Never mix them.
  const plainFirm   = headerText(profile?.firm_name || 'Your advisor', 100);
  const plainClient = headerText(taxReturn?.clients?.name || clientName || link.label || 'Client', 100);
  const taxYear     = escapeHtml(Number(taxReturn?.tax_year) || '');
  const firmName    = escapeHtml(plainFirm);
  const resolvedClientName = escapeHtml(plainClient);
  const brand       = safeColor(profile?.brand_color);
  const replyAddr    = isEmail(link.sent_to) ? link.sent_to : null;
  // Clients sometimes paste a Social Security / tax ID into a reply. TaxStory must never store or forward one.
  const cleanBody    = redactIdentifiers(messageBody.trim());
  const messageHtml  = escapeHtml(cleanBody).replace(/\r?\n/g, '<br>');

  // Store the inbound message
  const { error: msgErr } = await supabase.from('messages').insert({
    user_id:   link.firm_id,
    client_id: taxReturn?.clients?.id || null,
    direction: 'inbound',
    body:      cleanBody,
    sent_to:   link.sent_to || null,  // email of client, for anonymous message attribution
    read:      false,
    sent_at:   new Date().toISOString(),
  });
  if (msgErr) throw new Error(`Failed to store message: ${msgErr.message}`);

  // Fetch firm email to notify CPA
  const { data: { user: firmUser } } = await supabase.auth.admin
    .getUserById(link.firm_id)
    .catch(() => ({ data: {} }));
  const firmEmail = firmUser?.email;

  // Send notification email to CPA if we have their email and Resend is configured
  let emailSent = false;
  // Check CPA's notification preferences
  const { data: notifPrefs } = await supabase
    .from('profiles')
    .select('notif_message_received')
    .eq('id', link.firm_id)
    .maybeSingle();

  if (notifPrefs?.notif_message_received === false) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, emailSent: false, reason: 'notif_disabled' }) };
  }

  const siteUrl = siteOrigin();
  if (firmEmail && process.env.RESEND_API_KEY && !siteUrl) console.error('client-message: SITE_URL is not set; the message was stored but the notification email was NOT sent.');
  if (firmEmail && process.env.RESEND_API_KEY && siteUrl) {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error: emailErr } = await resend.emails.send({
      from:    `TaxStory <notifications@tellmytaxstory.com>`,
      to:      firmEmail,
      subject: `${plainClient} replied to their${Number(taxReturn?.tax_year) ? ` ${Number(taxReturn.tax_year)}` : ''} walkthrough`,
      replyTo: replyAddr || undefined,
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F7F6FF;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2DFF8">

  <tr><td style="background:${brand};padding:22px 28px">
    <div style="font-size:22px;margin-bottom:6px">💬</div>
    <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#fff">
      ${resolvedClientName} replied to their walkthrough
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px">
      ${taxYear ? `${taxYear} tax walkthrough` : 'Tax walkthrough'} · ${firmName}
    </div>
  </td></tr>

  <tr><td style="padding:28px">
    <div style="background:#F7F6FF;border-left:3px solid ${brand};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:22px;font-size:14px;color:#1A1230;line-height:1.7;font-style:italic">
      "${messageHtml}"
    </div>

    <div style="margin-bottom:22px">
      ${replyAddr ? `
      <a href="mailto:${escapeHtml(replyAddr)}?subject=${encodeURIComponent('Re: Your tax walkthrough')}"
        style="display:inline-block;background:${brand};color:#fff;font-size:14px;font-weight:600;
          padding:12px 24px;border-radius:10px;text-decoration:none">
        Reply to ${resolvedClientName} →
      </a>` : ''}
    </div>

    <a href="${siteUrl}/messages"
      style="font-size:12px;color:${brand};text-decoration:none">
      View all messages in your dashboard →
    </a>
  </td></tr>

  <tr><td style="background:#F7F6FF;padding:14px 28px;text-align:center">
    <p style="font-size:11px;color:#A0A0C0;margin:0">
      ${firmName} · Powered by
      <a href="https://tellmytaxstory.com" style="color:#6B5CE7">TaxStory</a>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`,
    });
    if (!emailErr) emailSent = true;
    else console.error('client-message: email failed', redactForLog(emailErr?.message || emailErr));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, emailSent }),
  };
}, { skipAuth: true });
