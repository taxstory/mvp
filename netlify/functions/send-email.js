// netlify/functions/send-email.js
// Resend-powered transactional email dispatcher.
// Handles all lifecycle emails: welcome, trial nudge, trial expiry, payment failure.

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM_EMAIL || 'noreply@tellmytaxstory.com';
const APP    = process.env.VITE_APP_URL      || 'https://tellmytaxstory.com';

const TEMPLATES = {
  welcome: (d) => ({
    subject: 'Welcome to TaxStory — your trial has started',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1B2A4A">
        <h1 style="color:#0D7A7A">Welcome to TaxStory</h1>
        <p>Your 14-day free trial is now active. Here's how to get started:</p>
        <ol>
          <li>Upload your first tax return PDF</li>
          <li>Review the extracted financial data</li>
          <li>Generate your AI-powered client video</li>
        </ol>
        <a href="${APP}/dashboard" style="background:#0D7A7A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">
          Go to Dashboard
        </a>
        <p style="color:#6B7280;font-size:14px">Questions? Reply to this email — we read every one.</p>
      </div>
    `,
  }),

  trial_nudge: (d) => ({
    subject: 'Have you tried generating your first video?',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1B2A4A">
        <h2>Your trial is running — have you generated a video yet?</h2>
        <p>You signed up 48 hours ago but haven't generated a video walkthrough yet. It takes under 2 minutes:</p>
        <ol>
          <li>Upload a tax return PDF</li>
          <li>Let our AI parse the financial data</li>
          <li>Generate a personalized 2-minute video for your client</li>
        </ol>
        <a href="${APP}/cpa/video" style="background:#0D7A7A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">
          Generate Your First Video
        </a>
      </div>
    `,
  }),

  trial_expiry: (d) => ({
    subject: 'Your TaxStory trial ends in 2 days',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1B2A4A">
        <h2>Your free trial ends in 2 days</h2>
        <p>Don't lose access to your TaxStory account. Subscribe today to keep generating client videos and projections.</p>
        <a href="${APP}/billing" style="background:#0D7A7A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">
          View Plans & Subscribe
        </a>
        <p>Starting at $49/month. No setup fees. Cancel anytime.</p>
      </div>
    `,
  }),

  payment_failed: (d) => ({
    subject: 'Action required: TaxStory payment failed',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;color:#1B2A4A">
        <h2 style="color:#DC2626">Payment failed</h2>
        <p>We couldn't process your TaxStory subscription payment. Please update your payment method to maintain access.</p>
        <a href="${APP}/billing" style="background:#DC2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">
          Update Payment Method
        </a>
        <p>Your account will remain active while we retry. If payment continues to fail, access will be paused.</p>
      </div>
    `,
  }),
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { to, template, data = {} } = JSON.parse(event.body);

    if (!TEMPLATES[template]) {
      return { statusCode: 400, body: `Unknown template: ${template}` };
    }

    const { subject, html } = TEMPLATES[template](data);

    const result = await resend.emails.send({ from: FROM, to, subject, html });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: result.id }),
    };

  } catch (err) {
    console.error('[send-email] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
