// src/hooks/useSubscription.js
// Reads live subscription + usage data from Supabase.
// Returns credit and projection counts so all pages stay in sync.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// Credit and projection limits per plan tier
const PLAN_LIMITS = {
  cpa_basic:  { projections: 100,  credits: 0   },
  cpa_pro:    { projections: 300,  credits: 100 },
  ria_basic:  { projections: 50,   credits: 0   },
  ria_pro:    { projections: 150,  credits: 25  },
  trial:      { projections: 10,   credits: 3   },
  expired:    { projections: 0,    credits: 0   },
};

const TRIAL_LENGTH_DAYS = 14;

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage]               = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchAll();

    const channel = supabase.channel('usage')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'usage_counters',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        setUsage(payload.new);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  async function fetchAll() {
    setLoading(true);
    const [{ data: sub }, { data: usageData }] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('usage_counters').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setSubscription(sub);
    setUsage(usageData);
    setLoading(false);
  }

  // ── Trial expiration ────────────────────────────────────────────────
  // A user with no subscription row is NOT indefinitely trialing — they
  // get a real, time-bounded trial computed from their auth account's
  // creation date. Once that window closes, they're "expired" (zero
  // access) rather than silently retaining trial-tier limits forever.
  // This also distinguishes "brand new, no row yet" from "something
  // went wrong provisioning the row" — both look the same in the DB,
  // but the trial clock is anchored to account creation either way,
  // so an indefinite free ride is no longer possible in either case.
  const accountCreatedAt = user?.created_at ? new Date(user.created_at) : null;
  const trialEndsAt = accountCreatedAt
    ? new Date(accountCreatedAt.getTime() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const trialExpired = trialEndsAt ? Date.now() > trialEndsAt.getTime() : false;

  // ── Derive tier ───────────────────────────────────────────────────────
  const isActive = subscription?.status === 'active';

  // Explicit "trialing" status from Stripe (has a real trial_end on the
  // subscription row) takes precedence when present.
  const stripeTrialing = subscription?.status === 'trialing';
  const stripeTrialEnd = subscription?.trial_end ? new Date(subscription.trial_end) : null;
  const stripeTrialExpired = stripeTrialEnd ? Date.now() > stripeTrialEnd.getTime() : false;

  // No subscription row at all → fall back to the account-creation-based
  // trial window instead of treating absence as permanent trial access.
  const noSubscriptionRow = !subscription && !!user;

  const isTrialing =
    (stripeTrialing && !stripeTrialExpired) ||
    (noSubscriptionRow && !trialExpired);

  const isExpired =
    (stripeTrialing && stripeTrialExpired) ||
    (noSubscriptionRow && trialExpired) ||
    (subscription?.status === 'canceled') ||
    (subscription?.status === 'past_due');

  const tier = isActive
    ? (subscription?.tier || 'cpa_pro')
    : isTrialing
      ? 'trial'
      : isExpired
        ? 'expired'
        : 'trial'; // loading/unknown state — default to trial limits, never undefined

  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.trial;

  const projectionsUsed      = usage?.projections_used || 0;
  const creditsUsed          = usage?.credits_used      || 0;
  const projectionsRemaining = Math.max(0, limits.projections - projectionsUsed);
  const creditsRemaining     = Math.max(0, limits.credits     - creditsUsed);
  const creditsTotal         = limits.credits;

  return {
    subscription,
    loading,
    tier,
    isActive,
    isTrialing,
    isExpired,
    trialEndsAt,
    projectionsUsed,
    projectionsRemaining,
    creditsUsed,
    creditsRemaining,
    creditsTotal,
    limits,
    refetch: fetchAll,
  };
}
