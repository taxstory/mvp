// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session for a given price ID.
// Attaches the Supabase user ID as metadata for webhook reconciliation.

const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { priceId, userId, successPath = '/dashboard', cancelPath = '/billing' } = JSON.parse(event.body);

    // Validate user exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!profile) return { statusCode: 403, body: 'Forbidden' };

    const appUrl = process.env.VITE_APP_URL;

    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      line_items:         [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { supabase_user_id: userId },
      },
      metadata: { supabase_user_id: userId },
      success_url: `${appUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}${cancelPath}`,
      allow_promotion_codes: true,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('[create-checkout] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
