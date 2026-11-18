import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);   // the sign-in service could not be reached

  useEffect(() => {
    // If the sign-in service cannot be reached (project paused, wrong URL, network down), getSession keeps retrying a token refresh and never
    // settles — every page then rendered NOTHING. After 8 seconds we stop waiting and show the app with a clear notice instead.
    const giveUp = setTimeout(() => { setBackendDown(true); setLoading(false); }, 8000);
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      clearTimeout(giveUp);
      if (error) { console.error('[auth] session check failed:', error.message); setBackendDown(/fetch|network/i.test(error.message || '')); }
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id).catch(e => console.error('[auth] profile read failed:', e.message));   // fetchProfile now throws; never leave it unhandled
      else setLoading(false);
    }).catch(e => { clearTimeout(giveUp); console.error('[auth] session check failed:', e.message); setBackendDown(true); setLoading(false); });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id).catch(e => console.error('[auth] profile read failed:', e.message));
      else { setProfile(null); setLoading(false); }
    });

    return () => { clearTimeout(giveUp); subscription.unsubscribe(); };
  }, []);

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) { setLoading(false); throw error; }
    setProfile(data);
    setLoading(false);
    return data;
  }

  async function signUp({ email, password, role, firmName }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, firm_name: firmName },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL}/auth/callback`,
      },
    });
    return { data, error };
  }

  async function signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  async function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,   // must match the /reset-password route
    });
  }

  const refreshProfile = () => user ? fetchProfile(user.id) : Promise.resolve(null);
  const value = { user, profile, loading, backendDown, refreshProfile, signUp, signIn, signOut, resetPassword };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
