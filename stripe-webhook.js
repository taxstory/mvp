// netlify/functions/stripe-webhook.js
//
// Guarantees (see tests/security/webhook.test.mjs and billing.test.mjs):
//   * Authenticated by Stripe's signature over the RAW body.
//   * Idempotent: every event id is claimed in `stripe_events`; redeliveries are acknowledged without re-processing.
//   * Retry-safe: any failure releases the claim and returns 500 so Stripe redelivers (previously failures were
//     logged and the endpoint still answered 200, so a paid-for credit pack could be lost forever).
//   * Order-safe: subscription state is applied only if the event is not older than what is stored.
//   * The plan is derived from the Stripe PRICE ID. It never defaults to a paid tier.
//   * Usage allowances are ANNUAL: a monthly invoice never resets them (roll_usage_period resets only after a year).
//   * Purchased credits are granted through `grant_pack_credits`, idempotent on the event id.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { logError } = require('./_logError');

exports.config = { timeout: 26 };

const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TIERS = ['cpa_basic', 'cpa_pro', 'ria_basic', 'ria_pro'];
const PRICE_ENV = { cpa_basic: 'STRIPE_PRICE_CPA_BASIC', cpa_pro: 'STRIPE_PRICE_CPA_PRO', ria_basic: 'STRIPE_PRICE_RIA_BASIC', ria_pro: 'STRIPE_PRICE_RIA_PRO' };
const PACKS = { credits_10: 10, credits_25: 25, credits_50: 50 };

function priceToTier() {
  const m = {};
  for (const [tier, env] of Object.entries(PRICE_ENV)) if (process.env[env]) m[process.env[env]] = tier;
  return m;
}

/** Plan from the subscription's price id. Metadata is a fallback ONLY when no price ids are configured. Never defaults. */
function tierOf(sub) {
  const map = priceToTier();
  for (const item of sub.items?.data || []) { const t = map[item.price?.id]; if (t) return t; }
  if (Object.keys(map).length === 0 && TIERS.includes(sub.metadata?.tier)) return sub.metadata.tier;
  throw new Error(`Cannot determine plan for subscription ${sub.id}: price not recognised`);
}

async function userOf(sub) {
  if (sub.metadata?.supabase_user_id) return sub.metadata.supabase_user_id;
  const { data } = await supabase.from('subscriptions').select('user_id').eq('stripe_customer_id', sub.customer).maybeSingle();
  if (data?.user_id) return data.user_id;
  try { const c = await stripe.customers.retrieve(sub.customer); return c?.metadata?.supabase_user_id || null; } catch { return null; }
}

const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);
const periodEnd = (sub) => iso(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data;
}

async function applySubscription(stripeEvent) {
  const sub = stripeEvent.data.object;
  const uid = await userOf(sub);
  if (!uid) { logError('stripe-webhook', new Error(`No user linked to subscription ${sub.id} (event ${stripeEvent.id})`), {}); return; }   // nothing a retry can fix
  const tier = tierOf(sub);
  const applied = await rpc('apply_subscription_state', {
    p_user: uid, p_sub_id: sub.id, p_customer: sub.customer, p_status: stripeEvent.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
    p_tier: tier, p_period_end: periodEnd(sub), p_event_created: stripeEvent.created,
  });
  // A brand-new subscription starts a fresh annual allowance. Updates and renewals never reset it.
  if (applied && stripeEvent.type === 'customer.subscription.created') {
    await rpc('roll_usage_period', { p_user: uid, p_period_start: iso(sub.start_date || stripeEvent.created), p_key: `sub-start:${sub.id}`, p_force: true });
  }
}

async function applyCreditPack(stripeEvent) {
  const session = stripeEvent.data.object;
  if (session.mode !== 'payment') return;                                   // subscriptions arrive via customer.subscription.*
  if (session.payment_status !== 'paid') return;                            // only grant once the money has actually arrived
  const uid = session.metadata?.supabase_user_id;
  const pack = session.metadata?.credit_pack;
  const credits = PACKS[pack];
  if (!uid || !credits || String(credits) !== String(session.metadata?.credits_to_add)) {
    throw new Error(`Credit pack session ${session.id} has invalid metadata`);   // loud: a customer paid and we cannot credit them
  }
  await rpc('grant_pack_credits', { p_user: uid, p_credits: credits, p_event_id: stripeEvent.id });
}

async function applyInvoicePaid(stripeEvent) {
  const invoice = stripeEvent.data.object;
  if (invoice.billing_reason !== 'subscription_cycle' || !invoice.subscription) return;
  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
  const uid = await userOf(sub);
  if (!uid) return;
  const start = invoice.lines?.data?.[0]?.period?.start || invoice.period_end || invoice.created;
  // Allowances are per YEAR while invoices are monthly: this resets only when a full year has elapsed.
  await rpc('roll_usage_period', { p_user: uid, p_period_start: iso(start), p_key: `invoice:${invoice.id}`, p_force: false });
}

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logError('stripe-webhook signature verification failed', err);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let claim;
  try { claim = await rpc('claim_stripe_event', { p_id: stripeEvent.id, p_type: stripeEvent.type }); }
  catch (err) { logError('stripe-webhook claim failed', err, { eventId: stripeEvent.id }); return { statusCode: 500, body: JSON.stringify({ error: 'Temporarily unavailable' }) }; }
  if (claim === 'duplicate')   return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
  if (claim === 'in_progress') return { statusCode: 409, body: JSON.stringify({ error: 'Event is being processed' }) };   // Stripe will retry

  try {
    switch (stripeEvent.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': await applySubscription(stripeEvent); break;
      case 'checkout.session.completed':    await applyCreditPack(stripeEvent);   break;
      case 'invoice.paid':                  await applyInvoicePaid(stripeEvent);  break;
      default: break;
    }
    await rpc('finish_stripe_event', { p_id: stripeEvent.id, p_ok: true });
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    logError('stripe-webhook processing failed', err, { eventId: stripeEvent.id, type: stripeEvent.type });
    try { await rpc('finish_stripe_event', { p_id: stripeEvent.id, p_ok: false }); } catch (e) { logError('stripe-webhook release failed', e, {}); }
    return { statusCode: 500, body: JSON.stringify({ error: 'Processing failed; will be retried' }) };   // never echo err.message to Stripe/logs consumers
  }
};
