// src/hooks/usePrivacyMode.js — the firm's privacy mode. 'labels_only' (the default) means TaxStory stores client NICKNAMES only:
// no client emails or phone numbers, no saved recipient addresses. The database enforces it; this hook lets the UI match.
// Until the setting has loaded the hook reports labels-only, so contact fields are never shown (or collected) by mistake.
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export function usePrivacyMode() {
  const { user } = useAuth();
  const [mode, setMode] = useState('labels_only');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('privacy_mode').eq('id', user.id).maybeSingle();
    setMode(data?.privacy_mode || 'labels_only'); setLoading(false);
  }, [user]);
  useEffect(() => { refresh(); }, [refresh]);
  return { mode, labelsOnly: mode === 'labels_only', loading, refresh };
}
