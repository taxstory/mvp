// src/components/ui/Alert.jsx
//
// A message on the page: errors, warnings, confirmations, notes. Styled by .ts-alert in index.css.
// For the RESULT of an action ("Saved", "Link copied") use a toast (useToast) instead.
//
//   <Alert variant="danger">{error}</Alert>
//   <Alert variant="success" title="Return read">12 fields found.</Alert>
//   <Alert variant="warning" onDismiss={() => setWarn(null)}>Some amounts need checking.</Alert>
//   <Alert variant="info" compact>Return PDFs never leave this device.</Alert>
//
// Props: variant 'info' | 'success' | 'warning' | 'danger'; title; icon (false hides it, or a lucide component);
//        onDismiss; compact; action (a node shown on the right, e.g. a Button).

import { createElement, isValidElement } from 'react';
import { Info, CircleCheck, TriangleAlert, CircleAlert, X } from 'lucide-react';

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

export function Alert({ children, variant = 'info', title, icon, onDismiss, compact = false, action, className = '', style, role, ...rest }) {
  const Ico = icon === false ? null : (icon || ICONS[variant] || Info);
  const urgent = variant === 'danger';
  return (
    <div
      role={role || (urgent ? 'alert' : 'status')}
      aria-live={urgent ? 'assertive' : 'polite'}
      className={`ts-alert ts-alert-${variant}${compact ? ' ts-alert-compact' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    >
      {Ico && (isValidElement(Ico) ? Ico : createElement(Ico, { size: compact ? 15 : 17, 'aria-hidden': true, className: 'ts-alert-icon' }))}
      <div className="ts-alert-body">
        {title && <div className="ts-alert-title">{title}</div>}
        <div>{children}</div>
      </div>
      {action && <div className="ts-alert-action">{action}</div>}
      {onDismiss && (
        <button type="button" className="ts-alert-x" onClick={onDismiss} aria-label="Dismiss">
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
