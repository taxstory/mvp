// netlify/functions/stripe-webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.config = { timeout: 26 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TIER_CREDITS = { cpa_basic: 0, cpa_pro: 100, ria_basic: 0, ria_pro: 25 };
const TIER_PROJECTIONS = { cpa_basic: 100, cpa_pro: 300, ria_basic: 50, ria_pro: 150 };

// Safe insert — delete first to avoid relying on a unique constraint that
// doesn't exist on subscriptions.user_id. Matches the pattern already
// established and commented in create-checkout.js.
async function upsertSubscription(payload) {
  await supabase.from('subscriptions').delete().eq('user_id', payload.user_id);
  return supabase.from('subscriptions').insert(payload);
}

async function upsertUsageCounters(userId, resetValues = {}) {
  await supabase.from('usage_counters').delete().eq('user_id', userId);
  return supabase.from('usage_counters').insert({
    user_id: userId,
    credits_used: 0,
    projections_used: 0,
    ...resetValues,
  });
}

function logError(context, err) {
  // Centralized error surface point for backend monitoring.
  // TODO: wire to Sentry or another alerting service — see audit finding
  // "No Backend Error Monitoring". For now this guarantees every failure
  // path is at least consistently logged with structured context.
  console.error(`[stripe-webhook] ${context}:`, err?.message || err);
}

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logError('signature verification failed', err);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub  = stripeEvent.data.object;
        const uid  = sub.metadata?.supabase_user_id;
        const tier = sub.metadata?.tier;
        if (!uid) break;

        const { error: subErr } = await upsertSubscription({
          user_id:                uid,
          stripe_subscription_id: sub.id,
          stripe_customer_id:     sub.customer,
          status:                 sub.status,
          tier:                   tier || 'cpa_pro',
          current_period_end:     new Date(sub.current_period_end * 1000).toISOString(),
        });
        if (subErr) logError(`subscription upsert failed for user ${uid}`, subErr);

        if (tier) {
          const { error: usageErr } = await upsertUsageCounters(uid);
          if (usageErr) logError(`usage_counters reset failed for user ${uid}`, usageErr);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        const uid = sub.metadata?.supabase_user_id;
        if (!uid) break;
        const { error } = await supabase.from('subscriptions').update({ status: 'canceled' }).eq('user_id', uid);
        if (error) logError(`subscription cancel failed for user ${uid}`, error);
        break;
      }

      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        if (session.mode !== 'payment') break; // subscriptions handled above

        const uid          = session.metadata?.supabase_user_id;
        const creditsToAdd = parseInt(session.metadata?.credits_to_add || '0', 10);
        if (!uid || !creditsToAdd) break;

        const { data: usage, error: fetchErr } = await supabase
          .from('usage_counters').select('credits_used').eq('user_id', uid).maybeSingle();
        if (fetchErr) { logError(`usage_counters fetch failed for user ${uid}`, fetchErr); break; }

        const currentUsed = usage?.credits_used || 0;
        const newUsed      = Math.max(0, currentUsed - creditsToAdd);

        const { error: updateErr } = await upsertUsageCounters(uid, { credits_used: newUsed });
        if (updateErr) { logError(`credit pack apply failed for user ${uid}`, updateErr); break; }

        console.log(`Added ${creditsToAdd} credits for user ${uid}. credits_used: ${currentUsed} → ${newUsed}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = stripeEvent.data.object;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const sub  = await stripe.subscriptions.retrieve(invoice.subscription);
        const uid  = sub.metadata?.supabase_user_id;
        const tier = sub.metadata?.tier;
        if (!uid) break;

        const { error: usageErr } = await upsertUsageCounters(uid);
        if (usageErr) logError(`annual renewal reset failed for user ${uid}`, usageErr);

        const { error: subErr } = await supabase.from('subscriptions').update({
          status:             'active',
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq('user_id', uid);
        if (subErr) logError(`renewal period_end update failed for user ${uid}`, subErr);
        break;
      }

      default:
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    logError('unhandled webhook error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
