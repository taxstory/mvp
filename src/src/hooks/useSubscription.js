// src/hooks/useSubscription.js
// Backward-compatible re-export.
// The subscription state is now managed in SubscriptionContext.jsx (shared
// across all pages — one fetch, zero duplicate queries on navigation).
// This file exists so import paths don't need updating across the codebase.
export { useSubscription } from '../context/SubscriptionContext';
