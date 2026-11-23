import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('[TaxStory] Missing Supabase environment variables. Check your .env.local file.');
}

// A password-reset email link lands on /reset-password with "type=recovery" (or an error, if the link expired) in the URL. The client below
// reads the URL and then clears it, so capture it first: ResetPasswordPage uses these to show "choose a new password".
const landingUrl = typeof window !== 'undefined' ? `${window.location.hash}&${window.location.search}` : '';
export const openedFromRecoveryLink = /[#&?]type=recovery(&|$)/.test(landingUrl);
// The error text in the URL is not shown (anyone can craft a link carrying any text); only the fact that the link failed is used.
export const authLinkFailed = /[#&?]error(_code)?=/.test(landingUrl);

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
