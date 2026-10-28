// src/components/SignedMedia.jsx
// The `audio` bucket (voiceovers and PDF summaries) is PRIVATE. Rows store storage paths (legacy rows may hold an
// old public URL); the advisor's own session mints a short-lived signed URL, which the owner-read storage policy permits.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const BUCKET = 'audio';

/** Accepts a stored path or a legacy public/signed URL; returns a bucket-relative path or null. */
export function toStoragePath(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${BUCKET}/([^?#]+)`));
  if (m) return decodeURIComponent(m[1]);
  if (/^https?:\/\//i.test(value)) return null;
  return value.replace(/^\/+/, '');
}

/** One-off async signer (for event handlers). Resolves '' when it cannot sign. */
export async function signAudio(value, ttl = 3600) {
  const path = toStoragePath(value);
  if (!path) return '';
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttl);
  return error || !data?.signedUrl ? '' : data.signedUrl;
}

export function useSignedUrl(value, ttl = 3600) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    setUrl('');
    signAudio(value, ttl).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [value, ttl]);
  return url;
}

export function SignedAudio({ value, style, ...rest }) {
  const url = useSignedUrl(value);
  return url
    ? <audio controls src={url} style={{ width: '100%', ...style }} {...rest} />
    : <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>Preparing secure audio…</div>;
}

export function SignedLink({ value, children, ...rest }) {
  const url = useSignedUrl(value);
  return url ? <a href={url} target="_blank" rel="noreferrer" {...rest}>{children}</a> : null;
}
