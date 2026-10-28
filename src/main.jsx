import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import './index.css';            // base styles + Tailwind first; App's tokens.css / launch.css load after and take precedence
import App from './App';

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
      return event;
    },
  });
}

// ── PostHog analytics (no-op when VITE_POSTHOG_KEY is unset) ──
if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    // PII-free: never capture personal identifiers
    sanitize_properties(properties) {
      const blocklist = ['email', 'name', 'phone', 'ssn', 'address'];
      blocklist.forEach(k => { if (properties[k]) properties[k] = '[redacted]'; });
      return properties;
    },
    autocapture: false,          // controlled capture only
    capture_pageview: true,
    disable_session_recording: true,
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong. Please refresh the page.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
