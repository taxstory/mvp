// netlify/functions/send-email.js
// Resend-powered lifecycle emails: welcome, trial nudge, trial expiry, payment failure. Branded per the TaxStory logo guide v1.0.
//
// SECURITY: this endpoint sends mail from our domain to an arbitrary address, so it is INTERNAL ONLY. Callers must send
// header x-internal-key equal to INTERNAL_API_KEY. If INTERNAL_API_KEY is unset the endpoint refuses everything (fails closed).
// It was previously unauthenticated, i.e. an open relay for our sending domain.

const crypto = require('crypto');
const { Resend } = require('resend');
const { siteOrigin } = require('./_site');

const FROM = process.env.RESEND_FROM_EMAIL || 'TaxStory <noreply@tellmytaxstory.com>';
const VIOLET = '#6B5CE7', MIDNIGHT = '#1A1230', MIST = '#F4F2FF', MUTED = '#6B698A', RED = '#DC2626';

function layout(app, { heading, body, cta, ctaHref, ctaColor = VIOLET, footnote = '' }) {
  return `
  <div style="background:${MIST};padding:24px 0;font-family:Inter,Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;color:${MIDNIGHT}">
      <div style="background:${MIDNIGHT};padding:20px 28px">
        <img src="${app}/brand/taxstory-email-header-on-dark.png" alt="TaxStory" height="32" style="height:32px;width:auto;display:block;border:0" />
      </div>
      <div style="padding:28px">
        <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;margin:0 0 12px;color:${ctaColor === RED ? RED : MIDNIGHT}">${heading}</h1>
        ${body}
        <a href="${ctaHref}" style="background:${ctaColor};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0;font-weight:600">${cta}</a>
        ${footnote ? `<p style="color:${MUTED};font-size:13px;margin:8px 0 0">${footnote}</p>` : ''}
      </div>
    </div>
  </div>`;
}

const TEMPLATES = {
  welcome: (app) => ({
    subject: 'Welcome to TaxStory — your trial has started',
    html: layout(app, {
      heading: 'Welcome to TaxStory',
      body: `<p>Your 14-day free trial is active. Here's how to get started:</p>
        <ol><li>Upload your first completed tax return PDF</li><li>Review and approve the figures</li><li>Generate a client video walkthrough</li></ol>`,
      cta: 'Go to Dashboard', ctaHref: `${app}/dashboard`,
      footnote: 'Questions? Reply to this email. We read every one.',
    }),
  }),
  trial_nudge: (app) => ({
    subject: 'Have you made your first client walkthrough?',
    html: layout(app, {
      heading: 'Your first walkthrough takes about two minutes',
      body: `<p>You haven't generated a client walkthrough yet. Upload a completed return, approve the figures, and TaxStory turns it into a video your client can watch.</p>`,
      cta: 'Open Video Generator', ctaHref: `${app}/cpa/video`,
    }),
  }),
  trial_expiry: (app) => ({
    subject: 'Your TaxStory trial ends in 2 days',
    html: layout(app, {
      heading: 'Your free trial ends in 2 days',
      body: `<p>Subscribe to keep generating client walkthroughs and projections. Plans start at $79/month. No setup fees. Cancel anytime.</p>`,
      cta: 'View plans', ctaHref: `${app}/billing`,
    }),
  }),
  payment_failed: (app) => ({
    subject: 'Action required: TaxStory payment failed',
    html: layout(app, {
      heading: 'Payment failed',
      body: `<p>We couldn't process your TaxStory subscription payment. Please update your payment method to keep access.</p>`,
      cta: 'Update payment method', ctaHref: `${app}/billing`, ctaColor: RED,
      footnote: 'Your account stays active while we retry. If payment keeps failing, access will be paused.',
    }),
  }),
};

function authorized(event) {
  const expected = process.env.INTERNAL_API_KEY;
  const got = event.headers?.['x-internal-key'] || '';
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!authorized(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  const app = siteOrigin();
  if (!app) return { statusCode: 500, body: JSON.stringify({ error: 'SITE_URL is not configured' }) };
  if (!process.env.RESEND_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'RESEND_API_KEY is not configured' }) };

  try {
    const { to, template } = JSON.parse(event.body || '{}');
    if (!TEMPLATES[template]) return { statusCode: 400, body: JSON.stringify({ error: 'Unknown template' }) };
    if (typeof to !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'A valid recipient address is required' }) };
    }
    const { subject, html } = TEMPLATES[template](app);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) throw new Error(error.message || 'Email send failed');
    return { statusCode: 200, body: JSON.stringify({ success: true, id: data?.id }) };
  } catch (err) {
    console.error('[send-email] Error:', err.message);   // no recipient or body in logs
    return { statusCode: 500, body: JSON.stringify({ error: 'Email send failed' }) };
  }
};
