import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import App from './App';
import './index.css';

// ── Sentry error monitoring ───────────────────────────────
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
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

// ── PostHog analytics ─────────────────────────────────────
posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
  // PII-free: never capture personal identifiers
  sanitize_properties(properties) {
    const blocklist = ['email', 'name', 'phone', 'ssn', 'address'];
    blocklist.forEach(k => { if (properties[k]) properties[k] = '[redacted]'; });
    return properties;
  },
  autocapture: false, // Controlled capture only
  capture_pageview: true,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
