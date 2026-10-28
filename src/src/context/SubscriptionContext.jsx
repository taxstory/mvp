// src/context/SubscriptionContext.jsx
// Single source of truth for subscription + usage data.
//
// BEFORE: useSubscription() fetched independently in each component.
//         4 pages mounting = 8 Supabase queries for identical data.
//
// AFTER:  Fetch once at app load, share via context. Zero extra queries
//         on navigation. Single Realtime channel pushes updates to all
//         consumers simultaneously. refetch() for post-checkout invalidation.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth }  from './AuthContext';

const PLAN_LIMITS = {
  trial:     { projections: 10,  credits: 3   },
  cpa_basic: { projections: 100, credits: 0   },
  cpa_pro:   { projections: 300, credits: 100 },
  ria_basic: { projections: 100, credits: 0   },
  ria_pro:   { projections: 200, credits: 50  },
  expired:   { projections: 0,   credits: 0   },
};

const TRIAL_DAYS = 14;
const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage,        setUsage]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const fetchedFor = useRef(null);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const [{ data: sub }, { data: usageData }] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('usage_counters').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setSubscription(sub);
    setUsage(usageData);
    setLoading(false);
    fetchedFor.current = user.id;
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    if (fetchedFor.current !== user.id) fetchAll();

    const ch = supabase.channel(`sub-ctx-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usage_counters',
        filter: `user_id=eq.${user.id}` }, ({ new: row }) => setUsage(row))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions',
        filter: `user_id=eq.${user.id}` }, ({ new: row }) => setSubscription(row))
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [user?.id, fetchAll]);

  const trialEndsAt        = user?.created_at
    ? new Date(new Date(user.created_at).getTime() + TRIAL_DAYS * 864e5) : null;
  const trialExpired       = trialEndsAt ? Date.now() > trialEndsAt.getTime() : false;
  const isActive           = subscription?.status === 'active';
  const stripeTrialing     = subscription?.status === 'trialing';
  const stripeTrialExpired = subscription?.trial_end
    ? Date.now() > new Date(subscription.trial_end).getTime() : false;
  const noRow    = !subscription && !!user;
  const isTrialing = (stripeTrialing && !stripeTrialExpired) || (noRow && !trialExpired);
  const isExpired  = (stripeTrialing && stripeTrialExpired)  || (noRow && trialExpired)
    || ['canceled','past_due'].includes(subscription?.status);
  const tier   = isActive ? (subscription?.tier || 'cpa_pro')
    : isTrialing ? 'trial' : isExpired ? 'expired' : 'trial';
  const limits = PLAN_LIMITS[tier] ?? PLAN_LIMITS.trial;

  return (
    <SubscriptionContext.Provider value={{
      subscription, loading, tier, isActive, isTrialing, isExpired,
      trialEndsAt, limits,
      projectionsUsed:      usage?.projections_used || 0,
      projectionsRemaining: Math.max(0, limits.projections - (usage?.projections_used || 0)),
      creditsUsed:          usage?.credits_used || 0,
      creditsRemaining:     Math.max(0, limits.credits - (usage?.credits_used || 0)),
      creditsTotal:         limits.credits,
      packCreditsBalance:   usage?.pack_credits_balance || 0,   // never expire
      packCreditsLifetime:  usage?.pack_credits_lifetime || 0,  // total ever purchased
      refetch:              fetchAll,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// Drop-in replacement — no call sites change
export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}
