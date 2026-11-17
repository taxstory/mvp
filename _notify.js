// netlify/functions/_notify.js — "your client watched their walkthrough" email to the advisor.
//
// This used to be a public HTTP endpoint (notify-view) called fire-and-forget by video-viewer and guarded by a shared
// secret (INTERNAL_WEBHOOK_SECRET). Two problems: (1) a serverless container is frozen as soon as the response is returned,
// so an un-awaited request can be dropped and notifications silently vanish; (2) it was an internet-reachable endpoint
// whose only protection was that secret. It is now an in-process function that the viewer AWAITS. No endpoint, no secret.
const { Resend } = require('resend');
const { escapeHtml, clip, safeColor, headerText } = require('./_html');
const { siteOrigin } = require('./_site');
const { logError } = require('./_logError');

/** Sends at most one email per share link. Never throws into the caller's request (failures are logged). */
async function notifyViewComplete(supabase, { shareLinkId, taxReturnId, firmId, watchPct }) {
  try {
    if (!shareLinkId || !firmId || !process.env.RESEND_API_KEY || !siteOrigin()) return { sent: false, reason: 'not_configured' };   // checked BEFORE the dedupe claim, so a misconfigured site cannot burn the one notification

    const { data: profile } = await supabase.from('profiles').select('firm_name, brand_color, notif_video_complete').eq('id', firmId).maybeSingle();
    if (profile?.notif_video_complete === false) return { sent: false, reason: 'disabled_by_advisor' };

    const { data: existing } = await supabase.from('video_view_notifications').select('id').eq('share_link_id', shareLinkId).maybeSingle();
    if (existing) return { sent: false, reason: 'already_notified' };

    const [{ data: link }, { data: taxReturn }] = await Promise.all([
      supabase.from('video_share_links').select('label').eq('id', shareLinkId).maybeSingle(),
      supabase.from('tax_returns').select('tax_year, clients(name)').eq('id', taxReturnId).maybeSingle(),
    ]);
    const { data: auth } = await supabase.auth.admin.getUserById(firmId).catch(() => ({ data: {} }));
    const firmEmail = auth?.user?.email;
    if (!firmEmail) return { sent: false, reason: 'no_firm_email' };

    // Claim BEFORE sending. A unique index on share_link_id makes concurrent completions safe: only one insert wins.
    const { error: claimErr } = await supabase.from('video_view_notifications')
      .insert({ share_link_id: shareLinkId, firm_id: firmId, sent_to: firmEmail, event_type: 'view_complete' });
    if (claimErr) return { sent: false, reason: claimErr.code === '23505' ? 'already_notified' : 'claim_failed' };

    // Every dynamic value is encoded for its context (HTML text vs mail header). See _html.js.
    const plainClient = headerText(taxReturn?.clients?.name || link?.label || 'Your client', 80);
    const plainFirm   = headerText(profile?.firm_name || 'Your firm', 80);
    const year  = Number(taxReturn?.tax_year) || '';
    const pct   = Math.max(0, Math.min(100, Math.round(Number(watchPct) || 90)));
    const brand = safeColor(profile?.brand_color);
    const client = escapeHtml(clip(plainClient, 80)), firm = escapeHtml(clip(plainFirm, 80));
    const dash  = `${siteOrigin()}/dashboard`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from:    'TaxStory <notifications@tellmytaxstory.com>',
      to:      firmEmail,
      subject: `${plainClient} watched their${year ? ` ${year}` : ''} tax walkthrough`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F6FF;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2DFF8">
  <tr><td style="background:${brand};padding:24px 28px">
    <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#fff">${client} just watched their walkthrough</div>
    <div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:4px">They watched ${pct}% — a good moment to follow up.</div>
  </td></tr>
  <tr><td style="padding:28px">
    <p style="font-size:14px;color:#1A1230;margin:0 0 20px">${year ? `${year} tax walkthrough` : 'Tax walkthrough'} · viewed ${pct}%</p>
    <a href="${escapeHtml(dash)}" style="display:inline-block;background:${brand};color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none">Open your dashboard →</a>
  </td></tr>
  <tr><td style="background:#F7F6FF;padding:14px 28px;text-align:center">
    <p style="font-size:11px;color:#6B698A;margin:0">${firm} · Powered by <a href="https://tellmytaxstory.com" style="color:#6B5CE7">TaxStory</a></p>
  </td></tr>
</table></td></tr></table></body></html>`,
    });
    if (emailError) {
      await supabase.from('video_view_notifications').delete().eq('share_link_id', shareLinkId);   // release the claim so a later view can retry
      throw new Error('Email provider rejected the notification');
    }
    return { sent: true };
  } catch (err) {
    logError('notify-view-complete', err, {});
    return { sent: false, reason: 'error' };
  }
}

module.exports = { notifyViewComplete };
