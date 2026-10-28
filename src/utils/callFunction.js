// src/utils/callFunction.js — call a Netlify function with the signed-in user's session.
// Throws Error(message) using the server's user-safe error text (never raw vendor/database errors: the server sanitises those).
import { supabase } from '../lib/supabase';

export async function callFunction(name, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Please sign in again.');
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  let json = {}; try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}
