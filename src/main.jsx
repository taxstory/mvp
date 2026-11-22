import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';            // base styles + Tailwind first; App's tokens.css / launch.css load after and take precedence
import App from './App';

// ── Secret scrubbing for third parties ──
// URLs in this app carry bearer secrets: share tokens (/view/<token>, ?token=), client-portal tokens (/portal/<token>), and Supabase auth
// tokens in the hash after a password-reset or sign-up link (#access_token=…&refresh_token=…). Analytics page views, error reports and
// network breadcrumbs would otherwise send them to PostHog and Sentry, where anyone with dashboard access could open a client's return.
export function scrubUrl(u) {
  if (typeof u !== 'string' || !u) return u;
  return u
    .replace(/#.*$/, '')                                                         // auth tokens live in the hash
    .replace(/\/(view|portal)\/[^/?#]+/g, '/$1/[token]')
    .replace(/([?&](?:token|access_token|refresh_token|code|key)=)[^&#]*/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]');
}
const CLIENT_FACING = /^\/(view|portal)\//.test(window.location.pathname);   // taxpayers, not our users

// ── Sentry error monitoring (no-op when VITE_SENTRY_DSN is unset, e.g. local dev) ──
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // PII scrubbing — never send personal data to Sentry
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      if (event.request) { event.request.url = scrubUrl(event.request.url); delete event.request.query_string; delete event.request.cookies; delete event.request.headers; }
      if (event.transaction) event.transaction = scrubUrl(event.transaction);
      return event;
    },
    beforeBreadcrumb(crumb) {                                                   // navigation + fetch/XHR breadcrumbs carry full URLs
      if (crumb.data) for (const k of ['url', 'from', 'to']) if (crumb.data[k]) crumb.data[k] = scrubUrl(crumb.data[k]);
      if (crumb.category === 'console') return null;                            // console text can contain figures or names
      return crumb;
    },
  });
}

// ── PostHog analytics (no-op when VITE_POSTHOG_KEY is unset) ──
// Not on the client viewer or portal: those visitors are taxpayers who never agreed to our analytics.
// Loaded after the page instead of before it (it is a third of the app's startup code otherwise).
if (import.meta.env.VITE_POSTHOG_KEY && !CLIENT_FACING) {
  import('posthog-js').then(({ default: posthog }) => posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    // PII-free: never capture personal identifiers
    sanitize_properties(properties) {
      const blocklist = ['email', 'name', 'phone', 'ssn', 'address'];
      blocklist.forEach(k => { if (properties[k]) properties[k] = '[redacted]'; });
      for (const k of ['$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_referrer', '$initial_pathname'])
        if (properties[k]) properties[k] = scrubUrl(properties[k]);
      return properties;
    },
    persistence: 'memory',        // no PostHog cookie or localStorage identifier on the advisor's machine
    ip: false,
    autocapture: false,          // controlled capture only
    capture_pageview: 'history_change',   // every in-app page change, not just the first load
    disable_session_recording: true,
  })).catch(() => {});                     // analytics must never break the app (ad blockers block it)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong. Please refresh the page.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
