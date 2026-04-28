import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Tier limits (must match Stripe products and server-side enforcement)
 * Projection limits are per-year; credit limits are annual video credits.
 */
const TIER_LIMITS = {
  cpa_basic:  { projections: 100,  credits: 0   },
  cpa_pro:    { projections: 300,  credits: 100  },
  ria_basic:  { projections: 50,   credits: 0   },
  ria_pro:    { projections: 150,  credits: 25  },
};

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage]               = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchSubscription();
    fetchUsage();
  }, [user]);

  async function fetchSubscription() {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setSubscription(data);
  }

  async function fetchUsage() {
    const { data } = await supabase
      .from('usage_counters')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setUsage(data);
    setLoading(false);
  }

  const tier        = subscription?.tier ?? null;
  const limits      = tier ? TIER_LIMITS[tier] : null;
  const isTrialing  = subscription?.status === 'trialing';
  const isActive    = ['active', 'trialing'].includes(subscription?.status);

  const canProject  = isActive && limits && (usage?.projections_used ?? 0) < limits.projections;
  const canGenVideo = isActive && limits && (usage?.credits_used ?? 0) < limits.credits;

  const projectionsRemaining = limits
    ? Math.max(0, limits.projections - (usage?.projections_used ?? 0))
    : 0;
  const creditsRemaining = limits
    ? Math.max(0, limits.credits - (usage?.credits_used ?? 0))
    : 0;

  return {
    subscription,
    usage,
    loading,
    tier,
    limits,
    isActive,
    isTrialing,
    canProject,
    canGenVideo,
    projectionsRemaining,
    creditsRemaining,
    refresh: () => { fetchSubscription(); fetchUsage(); },
  };
}
