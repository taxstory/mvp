// src/components/ui/Toast.jsx
//
// Lightweight toast notification system.
// useToast() returns { toast } — call toast(message, options) from anywhere.
// <ToastContainer /> renders the active toasts; mount it once in App.jsx.
//
// toast(message, options):
//   message   string
//   options   { variant: 'success'|'danger'|'warning'|'info', duration: number (ms) }
//
// Replaces every setSaved / setReplySent / presetToast / setCopied pattern in the app.
// Each is a one-line replacement: toast('Settings saved', { variant: 'success' })
//
// Usage (in App.jsx):
//   import { ToastProvider, ToastContainer } from './components/ui/Toast';
//   <ToastProvider><App /></ToastProvider>
//   // somewhere in the layout: <ToastContainer />
//
// Usage (in any component):
//   import { useToast } from './components/ui/Toast';
//   const { toast } = useToast();
//   toast('Settings saved', { variant: 'success' });
//   toast('Something went wrong', { variant: 'danger', duration: 6000 });

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ToastCtx = createContext(null);

let _toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, { variant = 'success', duration = 3500 } = {}) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message, variant, duration }]);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast, dismiss, toasts }}>
      {children}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// Individual toast item — self-dismisses after duration
function ToastItem({ id, message, variant, duration, onDismiss }) {
  const timerRef = useRef(null);

  const VARIANTS = {
    success: { bg: 'var(--color-green-dark)',  icon: '✓'  },
    danger:  { bg: 'var(--color-red-dark)',    icon: '✕'  },
    warning: { bg: 'var(--color-amber-dark)',   icon: '⚠' },
    info:    { bg: 'var(--color-blue)',         icon: 'ℹ' },
  };
  const v = VARIANTS[variant] || VARIANTS.info;

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timerRef.current);
  }, [id, duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        padding:      '12px 16px',
        borderRadius: 'var(--radius-lg)',
        background:   v.bg,
        color:        '#fff',
        fontSize:     13,
        fontWeight:   500,
        boxShadow:    '0 4px 20px rgba(0,0,0,.25)',
        animation:    'ts-toast-in .2s ease',
        maxWidth:     '360px',
        width:        'max-content',
        cursor:       'default',
      }}
      onClick={() => onDismiss(id)}
    >
      <span aria-hidden="true" style={{ fontSize: 15 }}>{v.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(id); }}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,.7)',
          cursor: 'pointer', fontSize: 13, padding: '0 2px', fontFamily: 'inherit',
        }}
      >✕</button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useContext(ToastCtx) || { toasts: [], dismiss: () => {} };

  if (!toasts.length) return null;

  return createPortal(
    <div
      aria-label="Notifications"
      style={{
        position:      'fixed',
        bottom:        24,
        right:         24,
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        alignItems:    'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'all' }}>
          <ToastItem {...t} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body
  );
}

if (typeof document !== 'undefined' && !document.getElementById('ts-toast-kf')) {
  const style = document.createElement('style');
  style.id    = 'ts-toast-kf';
  style.textContent = '@keyframes ts-toast-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }';
  document.head.appendChild(style);
}
