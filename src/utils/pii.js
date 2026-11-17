// Browser-side identifier check for free text the browser writes directly (notes, client labels, messages, scenario labels).
// Mirrors netlify/functions/_pii.js. It is the friendly early warning; the database guards are the enforcement.
const SSN_RE   = /(?<![0-9])[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}(?![0-9])/;
const EIN_RE   = /(?<![0-9])[0-9]{2}-[0-9]{7}(?![0-9])/;
const BARE9_RE = /(?<![0-9$,.])[0-9]{9}(?![0-9,.])/;

export const looksLikeIdentifier = (t) => typeof t === 'string' && (SSN_RE.test(t) || EIN_RE.test(t) || BARE9_RE.test(t));

/** Returns an error message to show, or '' when the text is fine. */
export function identifierError(text, label = 'This field') {
  return looksLikeIdentifier(text)
    ? `${label} looks like it contains a Social Security or tax ID number. TaxStory does not need these — please remove it.`
    : '';
}
