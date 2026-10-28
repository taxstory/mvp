// src/components/ui/Input.jsx
//
// Input — styled text/number/email/password input.
// Field — label + Input + error/hint, the full form field unit.
//
// Input props:
//   type      string                                     (default: 'text')
//   size      'sm' | 'md' | 'lg'                        (default: 'md')
//   error     boolean | string — red border when truthy
//   prefix    ReactNode — left slot (icons, currency symbol)
//   suffix    ReactNode — right slot (clear button, unit)
//   ...rest   onChange, value, placeholder, disabled, readOnly, aria-*
//
// Field props (wraps Input):
//   label     string | ReactNode — visible label text
//   hint      string — help text below the input
//   error     string — error message (also passes error=true to Input)
//   required  boolean — adds * to label and aria-required
//   id        string — links label to input (auto-generated if omitted)
//
// Usage:
//   <Input type="number" value={wages} onChange={e => setWages(+e.target.value)} />
//
//   <Field label="Annual wages" hint="From W-2 Box 1" error={errors.wages}>
//     <Input type="number" value={wages} onChange={upd('wages')} />
//   </Field>
//
//   <Field label="Client email" required>
//     <Input type="email" prefix="✉️" value={email} onChange={e => setEmail(e.target.value)} />
//   </Field>

import { useId } from 'react';

const INPUT_SIZES = {
  sm: { padding: '6px 10px',  fontSize: '12px', height: '30px', radius: 'var(--radius-sm)' },
  md: { padding: '9px 12px',  fontSize: '13px', height: '38px', radius: 'var(--radius-md)' },
  lg: { padding: '11px 14px', fontSize: '14px', height: '46px', radius: 'var(--radius-lg)' },
};

export function Input({
  type      = 'text',
  size      = 'md',
  error     = false,
  prefix    = null,
  suffix    = null,
  className = '',
  style     = {},
  ...rest
}) {
  const s        = INPUT_SIZES[size] || INPUT_SIZES.md;
  const hasError = Boolean(error);

  if (!prefix && !suffix) {
    return (
      <input
        type={type}
        className={`ts-input${className ? ` ${className}` : ''}`}
        style={{
          width:        '100%',
          height:       s.height,
          padding:      s.padding,
          fontSize:     s.fontSize,
          fontFamily:   'inherit',
          color:        'var(--color-dark)',
          background:   rest.disabled ? 'var(--color-bg)' : 'var(--color-white)',
          border:       `1px solid ${hasError ? 'var(--color-red)' : 'var(--color-border)'}`,
          borderRadius: s.radius,
          outline:      'none',
          transition:   'border-color .15s, box-shadow .15s',
          boxSizing:    'border-box',
          cursor:       rest.disabled ? 'not-allowed' : 'text',
          ...style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = hasError ? 'var(--color-red)' : 'var(--color-purple)';
          e.target.style.boxShadow   = hasError
            ? '0 0 0 3px rgba(226,75,74,.12)'
            : '0 0 0 3px rgba(107,92,231,.12)';
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.target.style.borderColor = hasError ? 'var(--color-red)' : 'var(--color-border)';
          e.target.style.boxShadow   = 'none';
          rest.onBlur?.(e);
        }}
        aria-invalid={hasError ? 'true' : undefined}
        {...rest}
      />
    );
  }

  // With prefix/suffix — wrap in a relative container
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {prefix && (
        <div aria-hidden="true" style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: s.fontSize, color: 'var(--color-muted)', pointerEvents: 'none',
        }}>
          {prefix}
        </div>
      )}
      <input
        type={type}
        className={`ts-input${className ? ` ${className}` : ''}`}
        style={{
          width:        '100%',
          height:       s.height,
          paddingLeft:  prefix ? 32 : s.padding.split(' ')[1],
          paddingRight: suffix ? 32 : s.padding.split(' ')[1],
          paddingTop:   s.padding.split(' ')[0],
          paddingBottom:s.padding.split(' ')[0],
          fontSize:     s.fontSize,
          fontFamily:   'inherit',
          color:        'var(--color-dark)',
          background:   rest.disabled ? 'var(--color-bg)' : 'var(--color-white)',
          border:       `1px solid ${hasError ? 'var(--color-red)' : 'var(--color-border)'}`,
          borderRadius: s.radius,
          outline:      'none',
          boxSizing:    'border-box',
          ...style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = hasError ? 'var(--color-red)' : 'var(--color-purple)';
          e.target.style.boxShadow   = hasError
            ? '0 0 0 3px rgba(226,75,74,.12)'
            : '0 0 0 3px rgba(107,92,231,.12)';
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.target.style.borderColor = hasError ? 'var(--color-red)' : 'var(--color-border)';
          e.target.style.boxShadow   = 'none';
          rest.onBlur?.(e);
        }}
        aria-invalid={hasError ? 'true' : undefined}
        {...rest}
      />
      {suffix && (
        <div style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: s.fontSize, color: 'var(--color-muted)',
        }}>
          {suffix}
        </div>
      )}
    </div>
  );
}

let _fieldIdCounter = 0;

export function Field({
  label,
  hint,
  error,
  required  = false,
  children,
  style     = {},
  id: propId,
  ...rest
}) {
  // Generate stable id for label→input linkage
  const autoId = useId();
  const id     = propId || `ts-field-${autoId}`;

  // Clone child Input to inject id and aria-describedby
  const hintId  = hint  ? `${id}-hint`  : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const childWithProps = (() => {
    if (!children) return null;
    try {
      const { cloneElement, isValidElement } = require('react');
      if (isValidElement(children)) {
        return cloneElement(children, {
          id,
          'aria-required':    required ? 'true' : undefined,
          'aria-describedby': describedBy,
          error:              Boolean(error),
        });
      }
    } catch {}
    return children;
  })();

  return (
    <div className="ts-field" style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }} {...rest}>
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize:    '11px',
            fontWeight:  700,
            color:       'var(--color-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
          {required && <span aria-hidden="true" style={{ color: 'var(--color-red)', marginLeft: 2 }}>*</span>}
        </label>
      )}
      {childWithProps}
      {hint && !error && (
        <p id={hintId} style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" style={{ fontSize: 11, color: 'var(--color-red)', margin: 0, lineHeight: 1.5 }}>
          {error}
        </p>
      )}
    </div>
  );
}
