// src/components/Captcha.jsx
// Bot protection for sign-up, sign-in and password reset (Cloudflare Turnstile). OFF until VITE_TURNSTILE_SITE_KEY is set in Netlify;
// with it unset nothing renders and nothing changes. The token is checked on the SERVER by Supabase Auth, which only happens once
// CAPTCHA protection is switched on in Supabase (Authentication → Attack Protection) with the matching secret key. Set the site key
// in Netlify FIRST and deploy, then switch it on in Supabase: the other order makes every sign-in fail until the deploy lands.
import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
export const captchaEnabled = Boolean(SITE_KEY);

let scriptPromise = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { scriptPromise = null; reject(new Error('Security check could not load')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * <Captcha onToken={setToken} resetKey={attempt} />
 * Calls onToken(token) when solved and onToken('') when it expires or fails. Tokens work once: bump resetKey after every submit.
 */
export function Captcha({ onToken, resetKey = 0 }) {
  const box = useRef(null);
  const widget = useRef(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!captchaEnabled) return undefined;
    let cancelled = false;
    loadTurnstile().then((ts) => {
      if (cancelled || !box.current || !ts) return;
      widget.current = ts.render(box.current, {
        sitekey: SITE_KEY,
        callback: (t) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      });
    }).catch(() => cb.current(''));
    return () => { cancelled = true; if (widget.current != null) { try { window.turnstile?.remove(widget.current); } catch { /* already gone */ } widget.current = null; } };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current != null) { cb.current(''); try { window.turnstile?.reset(widget.current); } catch { /* not ready */ } }
  }, [resetKey]);

  if (!captchaEnabled) return null;
  return <div ref={box} style={{ minHeight: 65 }} />;
}
