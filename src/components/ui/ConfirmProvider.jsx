// src/components/ui/ConfirmProvider.jsx
//
// Promise-based replacement for window.confirm(), built on the accessible <Modal>.
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: 'Delete client?', message: 'This cannot be undone.' }))) return;
//
// Options: title, message, confirmLabel (default "Delete"), cancelLabel, danger (default true).
// Resolves true on confirm, false on cancel / Escape / overlay click.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal }  from './Modal';
import { Button } from './Button';

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts = {}) => new Promise(resolve => {
    resolver.current = resolve;
    setState({ title: 'Are you sure?', message: '', confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true, ...opts });
  }), []);

  const close = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || ''}
        size="sm"
        footer={state && (
          <>
            <Button variant="ghost" onClick={() => close(false)}>{state.cancelLabel}</Button>
            <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state.confirmLabel}</Button>
          </>
        )}
      >
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-muted)' }}>{state?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
