// netlify/functions/create-checkout.js
// Stripe Checkout sessions for plan subscriptions, credit packs, and billing portal.
// Price IDs come from env vars (STRIPE_PRICE_CPA_BASIC, _CPA_PRO, _RIA_BASIC, _RIA_PRO,
// _CREDITS_10, _CREDITS_25, _CREDITS_50). STRIPE_FOUNDING_COUPON for 45% lifetime discount.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { makeHandler } = require('./_handler');
const { rateLimit } = require('./_ratelimit');
const { requireSiteOrigin } = require('./_site');

exports.config = { timeout: 26 };

// The return/redirect origin comes from SITE_URL with no default (see _site.js): a staging site must never send customers back to production.

const PRICE_IDS = {
  cpa_basic:  process.env.STRIPE_PRICE_CPA_BASIC,
  cpa_pro:    process.env.STRIPE_PRICE_CPA_PRO,
  ria_basic:  process.env.STRIPE_PRICE_RIA_BASIC,
  ria_pro:    process.env.STRIPE_PRICE_RIA_PRO,
  credits_10: process.env.STRIPE_PRICE_CREDITS_10,
  credits_25: process.env.STRIPE_PRICE_CREDITS_25,
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,
};

const CREDIT_PACK_AMOUNTS = { credits_10: 10, credits_25: 25, credits_50: 50 };
const PLAN_TIERS = ['cpa_basic', 'cpa_pro', 'ria_basic', 'ria_pro'];   // allow-lists: a plan key can never be used as a pack and vice versa

exports.handler = makeHandler(['STRIPE_SECRET_KEY'], async (event, { supabase, db, user, body }) => {
  const { tier, creditPack, portalSession } = body;
  await rateLimit(supabase, `checkout:${user.id}`, 20, 3600, 'Too many checkout attempts. Please wait a few minutes.');
  if (tier !== undefined && !PLAN_TIERS.includes(tier)) throw Object.assign(new Error('Unknown plan'), { statusCode: 400 });
  if (creditPack !== undefined && !(creditPack in CREDIT_PACK_AMOUNTS)) throw Object.assign(new Error('Unknown credit pack'), { statusCode: 400 });

  // ── Billing portal ────────────────────────────────────────────────
  if (portalSession) {
    const { data: sub } = await db.from('subscriptions')
      .select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (!sub?.stripe_customer_id) {
      throw Object.assign(new Error('No active subscription found'), { statusCode: 400 });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id, return_url: `${requireSiteOrigin()}/billing`,
    });
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  }

  // Get or create Stripe customer
  const [{ data: profile }, { data: existingSub }] = await Promise.all([
    db.from('profiles').select('firm_name, founding_member').eq('id', user.id).maybeSingle(),
    db.from('subscriptions').select('stripe_customer_id, stripe_subscription_id, status').eq('user_id', user.id).maybeSingle(),
  ]);

  let customerId = existingSub?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email, name: profile?.firm_name || user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
  }

  // ── Plan subscription ─────────────────────────────────────────────
  if (tier) {
    // One live subscription per account: changing plans or payment details goes through the billing portal.
    if (existingSub?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(existingSub.status)) {
      throw Object.assign(new Error('You already have a subscription. Use "Manage subscription" to change plans.'), { statusCode: 409 });
    }
    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      throw Object.assign(
        new Error(`No price configured for tier: ${tier}. Set STRIPE_PRICE_${tier.toUpperCase()} in Netlify.`),
        { statusCode: 400 }
      );
    }
    const params = {
      customer: customerId, mode: 'subscription', payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      // The 14-day trial is offered once per account; cancelling and resubscribing must not restart it.
      subscription_data: { ...(existingSub?.stripe_subscription_id ? {} : { trial_period_days: 14 }), metadata: { tier, supabase_user_id: user.id } },
      metadata: { tier, supabase_user_id: user.id },
      success_url: `${requireSiteOrigin()}/billing?checkout=success&tier=${tier}`,
      cancel_url:  `${requireSiteOrigin()}/billing?checkout=cancelled`,
    };
    // Stripe rejects a session that sets both `discounts` and `allow_promotion_codes` (founding members' checkout used to fail).
    if (profile?.founding_member && process.env.STRIPE_FOUNDING_COUPON) {
      params.discounts = [{ coupon: process.env.STRIPE_FOUNDING_COUPON }];
    } else {
      params.allow_promotion_codes = true;
    }
    const session = await stripe.checkout.sessions.create(params);
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  }

  // ── Credit pack ───────────────────────────────────────────────────
  if (creditPack) {
    const priceId = PRICE_IDS[creditPack];
    if (!priceId) {
      throw Object.assign(
        new Error(`No price configured for: ${creditPack}. Set STRIPE_PRICE_${creditPack.toUpperCase()}.`),
        { statusCode: 400 }
      );
    }
    const session = await stripe.checkout.sessions.create({
      customer: customerId, mode: 'payment', payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { supabase_user_id: user.id, credit_pack: creditPack, credits_to_add: String(CREDIT_PACK_AMOUNTS[creditPack] || 0) },
      success_url: `${requireSiteOrigin()}/billing?checkout=credits_success&pack=${creditPack}`,
      cancel_url:  `${requireSiteOrigin()}/billing?checkout=cancelled`,
    });
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  }

  throw Object.assign(new Error('Provide tier, creditPack, or portalSession:true'), { statusCode: 400 });
});
