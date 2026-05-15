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
};

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage]               = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchAll();

    // Subscribe to realtime changes on usage_counters
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

  // Derive tier
  const isActive    = subscription?.status === 'active';
  const isTrialing  = subscription?.status === 'trialing' || (!subscription && !!user);
  const tier        = isActive ? (subscription?.tier || 'cpa_pro') : isTrialing ? 'trial' : null;
  const limits      = PLAN_LIMITS[tier] || PLAN_LIMITS.trial;

  const projectionsUsed    = usage?.projections_used    || 0;
  const creditsUsed        = usage?.credits_used        || 0;
  const projectionsRemaining = Math.max(0, limits.projections - projectionsUsed);
  const creditsRemaining     = Math.max(0, limits.credits     - creditsUsed);
  const creditsTotal         = limits.credits;

  return {
    subscription,
    loading,
    tier,
    isActive,
    isTrialing,
    projectionsUsed,
    projectionsRemaining,
    creditsUsed,
    creditsRemaining,
    creditsTotal,
    limits,
    refetch: fetchAll,
  };
}
