// netlify/functions/stripe-webhook.js
// SOC 2 Control: Stripe signature verified before any processing.
// Handles: subscription create, update, cancel, payment failure, dunning.

const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // Bypasses RLS — server only
);
const resend = new Resend(process.env.RESEND_API_KEY);

// Map Stripe price IDs → TaxStory tier names
const PRICE_TO_TIER = {
  [process.env.VITE_STRIPE_CPA_BASIC_MONTHLY]:  'cpa_basic',
  [process.env.VITE_STRIPE_CPA_BASIC_ANNUAL]:   'cpa_basic',
  [process.env.VITE_STRIPE_CPA_PRO_MONTHLY]:    'cpa_pro',
  [process.env.VITE_STRIPE_CPA_PRO_ANNUAL]:     'cpa_pro',
  [process.env.VITE_STRIPE_RIA_BASIC_MONTHLY]:  'ria_basic',
  [process.env.VITE_STRIPE_RIA_BASIC_ANNUAL]:   'ria_basic',
  [process.env.VITE_STRIPE_RIA_PRO_MONTHLY]:    'ria_pro',
  [process.env.VITE_STRIPE_RIA_PRO_ANNUAL]:     'ria_pro',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  // ── Verify Stripe signature ──────────────────────────────────────
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook signature error: ${err.message}` };
  }

  const data   = stripeEvent.data.object;
  const userId = data.metadata?.supabase_user_id;

  try {
    switch (stripeEvent.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const priceId = data.items.data[0]?.price?.id;
        const tier    = PRICE_TO_TIER[priceId] || 'cpa_basic';

        await supabase.from('subscriptions').upsert({
          user_id:               userId,
          stripe_customer_id:    data.customer,
          stripe_subscription_id: data.id,
          tier,
          status:                data.status,
          current_period_start:  new Date(data.current_period_start * 1000).toISOString(),
          current_period_end:    new Date(data.current_period_end   * 1000).toISOString(),
          trial_end:             data.trial_end ? new Date(data.trial_end * 1000).toISOString() : null,
          updated_at:            new Date().toISOString(),
        }, { onConflict: 'user_id' });

        // Provision usage counter on new subscription
        if (stripeEvent.type === 'customer.subscription.created') {
          await supabase.from('usage_counters').upsert({
            user_id:          userId,
            projections_used: 0,
            credits_used:     0,
            period_start:     new Date().toISOString(),
          }, { onConflict: 'user_id' });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        await supabase.from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', data.id);
        break;
      }

      case 'invoice.payment_failed': {
        // Dunning: notify user of payment failure
        const customer = await stripe.customers.retrieve(data.customer);
        if (customer.email) {
          await resend.emails.send({
            from:    process.env.RESEND_FROM_EMAIL,
            to:      customer.email,
            subject: 'Action required: Payment failed for TaxStory',
            html: `
              <h2>We couldn't process your payment</h2>
              <p>Your TaxStory subscription payment failed. Please update your payment method to keep access.</p>
              <a href="${process.env.VITE_APP_URL}/billing" style="background:#0D7A7A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">
                Update Payment Method
              </a>
              <p>If you have questions, reply to this email.</p>
            `,
          });
        }
        break;
      }

      default:
        // Unhandled event types are fine — just ignore
        break;
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id:  userId,
      action:   `stripe_webhook:${stripeEvent.type}`,
      resource: data.id,
      metadata: { stripe_event_id: stripeEvent.id },
    });

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('[webhook] Processing error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
