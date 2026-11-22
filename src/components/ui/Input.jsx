// src/components/ui/Input.jsx
//
// Fields get their look from the global field style in index.css (one style for every input, select and textarea in
// the app, with the focus ring). These components add what CSS can't: the label linked to the field, hint and error
// text wired to aria-describedby, and the red invalid state.
//
//   <Field label="Annual wages" hint="From W-2 box 1" error={errors.wages}>
//     <Input type="number" value={wages} onChange={e => setWages(+e.target.value)} />
//   </Field>
//
//   <Field label="Filing status"><Select value={fs} onChange={…}>…</Select></Field>
//   <Field label="Notes" optional><Textarea rows={4} … /></Field>
//
// Input / Select / Textarea accept every normal attribute plus `error` (boolean) for the invalid state.

import { useId, cloneElement, isValidElement, Children } from 'react';

export function Input({ error, className = '', ...rest }) {
  return <input className={className || undefined} aria-invalid={error ? true : undefined} {...rest} />;
}

export function Select({ error, className = '', children, ...rest }) {
  return <select className={className || undefined} aria-invalid={error ? true : undefined} {...rest}>{children}</select>;
}

export function Textarea({ error, className = '', ...rest }) {
  return <textarea className={className || undefined} aria-invalid={error ? true : undefined} {...rest} />;
}

export function Field({ label, hint, error, required = false, optional = false, children, id: propId, className = '', style }) {
  const auto = useId();
  const id = propId || `ts-field-${auto}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const control = only
    ? cloneElement(only, {
        id: only.props.id || id,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
        error: only.props.error ?? Boolean(error),
      })
    : children;

  return (
    <div className={`ts-field${className ? ` ${className}` : ''}`} style={style}>
      {label && (
        <label className="ts-fl" htmlFor={only ? (only.props.id || id) : undefined}>
          {label}
          {required && <span aria-hidden="true">*</span>}
          {optional && <span>optional</span>}
        </label>
      )}
      {control}
      {hint && !error && <div id={hintId} className="ts-hint">{hint}</div>}
      {error && <div id={errorId} className="ts-field-error" role="alert">{error}</div>}
    </div>
  );
}
