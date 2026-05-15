// netlify/functions/create-checkout.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_PRICE_IDS = {
  cpa_basic: process.env.STRIPE_PRICE_CPA_BASIC,
  cpa_pro:   process.env.STRIPE_PRICE_CPA_PRO,
  ria_basic: process.env.STRIPE_PRICE_RIA_BASIC,
  ria_pro:   process.env.STRIPE_PRICE_RIA_PRO,
};

const CREDIT_PACK_PRICE_IDS = {
  credits_10: process.env.STRIPE_PRICE_CREDITS_10,
  credits_25: process.env.STRIPE_PRICE_CREDITS_25,
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,
};

const CREDIT_PACK_QUANTITIES = {
  credits_10: 10,
  credits_25: 25,
  credits_50: 50,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { tier, creditPack } = body;

    // Get profile and existing subscription
    const { data: profile } = await supabase
      .from('profiles').select('firm_name').eq('id', user.id).single();
    const { data: sub } = await supabase
      .from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();

    // Get or create Stripe customer — use DELETE+INSERT to avoid upsert constraint issue
    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     profile?.firm_name || user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Safe insert — delete first to avoid any constraint issues
      await supabase.from('subscriptions').delete().eq('user_id', user.id);
      await supabase.from('subscriptions').insert({
        user_id:            user.id,
        stripe_customer_id: customerId,
        status:             sub?.status || 'trialing',
        tier:               sub?.tier   || 'trial',
      });
    }

    const baseUrl    = process.env.URL || 'https://tellmytaxstory.com';
    const successUrl = `${baseUrl}/billing?success=true`;
    const cancelUrl  = `${baseUrl}/billing`;

    // ── Credit pack (one-time) ───────────────────────────────────────
    if (creditPack) {
      const priceId = CREDIT_PACK_PRICE_IDS[creditPack];
      if (!priceId) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Stripe price not configured for ${creditPack}. Add STRIPE_PRICE_CREDITS_10, _25, _50 to Netlify env vars.`
          })
        };
      }

      const session = await stripe.checkout.sessions.create({
        customer:    customerId,
        mode:        'payment',
        line_items:  [{ price: priceId, quantity: 1 }],
        success_url: `${successUrl}&pack=${creditPack}`,
        cancel_url:  cancelUrl,
        metadata: {
          supabase_user_id: user.id,
          credit_pack:      creditPack,
          credits_to_add:   String(CREDIT_PACK_QUANTITIES[creditPack] || 0),
        },
      });
      return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
    }

    // ── Plan subscription ────────────────────────────────────────────
    if (tier) {
      const priceId = PLAN_PRICE_IDS[tier];
      if (!priceId) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Stripe price not configured for plan "${tier}". Add STRIPE_PRICE_CPA_BASIC, _CPA_PRO, _RIA_BASIC, _RIA_PRO to Netlify env vars.`
          })
        };
      }

      // Already has active subscription — update it inline
      if (sub?.stripe_subscription_id) {
        try {
          const existing = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
          await stripe.subscriptions.update(sub.stripe_subscription_id, {
            items: [{ id: existing.items.data[0].id, price: priceId }],
            proration_behavior: 'always_invoice',
            metadata: { supabase_user_id: user.id, tier },
          });
          await supabase.from('subscriptions').update({ tier }).eq('user_id', user.id);
          return { statusCode: 200, body: JSON.stringify({ url: successUrl }) };
        } catch (stripeErr) {
          // Subscription may be stale — fall through to new checkout
          console.warn('Could not update existing subscription, starting new checkout:', stripeErr.message);
        }
      }

      // New subscription
      const session = await stripe.checkout.sessions.create({
        customer:              customerId,
        mode:                  'subscription',
        line_items:            [{ price: priceId, quantity: 1 }],
        subscription_data:     { trial_period_days: 14, metadata: { supabase_user_id: user.id, tier } },
        success_url:           successUrl,
        cancel_url:            cancelUrl,
        allow_promotion_codes: true,
        metadata:              { supabase_user_id: user.id, tier },
      });
      return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Must provide tier or creditPack' }) };

  } catch (err) {
    console.error('create-checkout error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
