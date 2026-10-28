// src/components/ui/Modal.jsx
//
// Accessible modal dialog with focus trap, scroll lock, and keyboard dismiss.
// Renders into a portal so z-index stacking is never a problem.
//
// Props:
//   open      boolean              — controls visibility
//   onClose   () => void           — called on ✕, overlay click, or Escape
//   title     string               — dialog label (aria-labelledby)
//   size      'sm' | 'md' | 'lg'  (default: 'md')
//   hideClose boolean              — omit the close button
//   footer    ReactNode            — rendered in a footer below the content
//
// Accessibility:
//   role="dialog" + aria-modal="true" + aria-labelledby on the container
//   Focus moves to dialog on open; returns to trigger on close
//   Escape key dismisses
//   Overlay click dismisses (unless hideClose)
//   Body scroll locked while open
//   Tab is trapped inside the dialog
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <Button onClick={() => setOpen(true)}>Open</Button>
//   <Modal open={open} onClose={() => setOpen(false)} title="Confirm delete"
//     footer={<><Button variant="danger" onClick={doDelete}>Delete</Button>
//              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></>}
//   >
//     Are you sure you want to delete this client?
//   </Modal>

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const MODAL_SIZES = {
  sm: { width: '380px', padding: '22px 24px' },
  md: { width: '520px', padding: '26px 28px' },
  lg: { width: '720px', padding: '30px 32px' },
};

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  size      = 'md',
  hideClose = false,
  footer,
  style     = {},
}) {
  const dialogRef  = useRef(null);
  const triggerRef = useRef(null);
  const s = MODAL_SIZES[size] || MODAL_SIZES.md;

  // Store the element that opened the modal so we can return focus
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      // Lock scroll
      document.body.style.overflow = 'hidden';
      // Move focus into dialog on next frame
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelector(FOCUSABLE);
        first ? first.focus() : dialogRef.current?.focus();
      });
    } else {
      document.body.style.overflow = '';
      triggerRef.current?.focus();
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Keyboard: Escape closes; Tab traps focus
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { onClose?.(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])];
    if (!focusable.length) { e.preventDefault(); return; }
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }, [onClose]);

  if (!open) return null;

  return createPortal(
    <div
      aria-hidden="false"
      style={{
        position:  'fixed',
        inset:     0,
        zIndex:    1000,
        display:   'flex',
        alignItems:'center',
        justifyContent:'center',
        padding:   '16px',
        background:'rgba(26,18,48,.55)',
        backdropFilter:'blur(3px)',
        animation: 'ts-fade-in .15s ease',
      }}
      onClick={(e) => { if (!hideClose && e.target === e.currentTarget) onClose?.(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'ts-modal-title' : undefined}
        tabIndex={-1}
        style={{
          background:   'var(--color-white)',
          borderRadius: 'var(--radius-xl)',
          boxShadow:    '0 24px 64px rgba(26,18,48,.22)',
          width:        '100%',
          maxWidth:     s.width,
          maxHeight:    '90vh',
          overflow:     'auto',
          padding:      s.padding,
          position:     'relative',
          animation:    'ts-slide-up .18s ease',
          ...style,
        }}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: title ? 18 : 0 }}>
            {title && (
              <h2
                id="ts-modal-title"
                style={{ margin:0, fontSize:16, fontWeight:700, color:'var(--color-dark)', fontFamily:'var(--font-serif)' }}
              >
                {title}
              </h2>
            )}
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close dialog"
                style={{
                  marginLeft:'auto', background:'none', border:'none', cursor:'pointer',
                  color:'var(--color-muted)', fontSize:18, lineHeight:1, padding:'2px 4px',
                  borderRadius:6, fontFamily:'inherit',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-dark)' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            marginTop:  20,
            paddingTop: 16,
            borderTop:  '1px solid var(--color-border)',
            display:    'flex',
            gap:        8,
            justifyContent:'flex-end',
            flexWrap:   'wrap',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Animation keyframes
if (typeof document !== 'undefined' && !document.getElementById('ts-modal-kf')) {
  const style = document.createElement('style');
  style.id    = 'ts-modal-kf';
  style.textContent = `
    @keyframes ts-fade-in   { from { opacity:0 } to { opacity:1 } }
    @keyframes ts-slide-up  { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
  `;
  document.head.appendChild(style);
}
