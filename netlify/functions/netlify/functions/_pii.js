// netlify/functions/_pii.js — identifier tripwire. Mirrors looks_like_identifier() in 13_pii_minimization_and_metering.sql.
// TaxStory must never store taxpayer identifiers. The architecture prevents them from arriving (returns are parsed in the
// browser and only validated numbers are sent); this is the backstop for free-text fields (notes, names, messages).
const SSN_RE = /(?<![0-9])[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}(?![0-9])/g;   // SSN/ITIN with separators
const EIN_RE = /(?<![0-9])[0-9]{2}-[0-9]{7}(?![0-9])/g;                    // EIN

const looksLikeIdentifier = (t) => typeof t === 'string' && (new RegExp(SSN_RE.source).test(t) || new RegExp(EIN_RE.source).test(t));
const redactIdentifiers   = (t) => String(t ?? '').replace(SSN_RE, '[removed]').replace(EIN_RE, '[removed]');

/** Throw 400 if a user-supplied free-text value looks like an SSN/EIN. */
function assertNoIdentifier(value, fieldLabel) {
  if (looksLikeIdentifier(value)) {
    throw Object.assign(new Error(`${fieldLabel} looks like it contains a Social Security or tax ID number. TaxStory does not need these — please remove it.`), { statusCode: 400 });
  }
}

/** A client LABEL is a nickname. It must not be contact data (mirrors guard_client_contact() in 14_labels_only_mode.sql). */
function assertClientLabel(label) {
  if (/@/.test(label) || /[0-9][0-9 ().+-]{5,}[0-9]/.test(label)) {
    throw Object.assign(new Error('A client label should be a nickname or initials — please do not enter an email address or phone number.'), { statusCode: 400 });
  }
}

module.exports = { looksLikeIdentifier, redactIdentifiers, assertNoIdentifier, assertClientLabel };
