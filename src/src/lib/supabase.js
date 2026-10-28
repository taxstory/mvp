// STAND-IN (scaffold) — NOT your real file. It exists only so this snapshot can build and run. In your real repository keep YOUR version; the merge script never copies this one.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).');

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-anon-key', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
