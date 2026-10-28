// Browser-side drafts of in-progress forms. Convenience only: they hold FIGURES (never the client's name), they EXPIRE after 24 hours, and they are wiped when the user signs out.
// (Before: the figures were kept in localStorage indefinitely, readable by anyone who next used the browser.) A draft written by the old code has no timestamp and is discarded.
export const DRAFT_KEYS = ['taxstory_projection_draft', 'taxstory_ria_draft'];
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveDraft(key, data) { try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* storage full or disabled: drafts are optional */ } }
export function loadDraft(key, maxAgeMs = MAX_AGE_MS) {
  try {
    const raw = localStorage.getItem(key); if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || typeof v.savedAt !== 'number' || Date.now() - v.savedAt > maxAgeMs || Date.now() < v.savedAt - 60000) { localStorage.removeItem(key); return null; }
    return v.data ?? null;
  } catch { return null; }
}
export function clearDraft(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
export function clearAllDrafts() {
  DRAFT_KEYS.forEach(clearDraft);
  try { Object.keys(localStorage).filter(k => k.startsWith('taxstory_') && /draft/i.test(k)).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}
