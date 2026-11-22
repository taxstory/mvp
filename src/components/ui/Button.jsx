// src/components/ui/Button.jsx
//
// The app's button. It renders the .ts-btn classes in index.css, so it looks exactly like every other button
// in the product — the classes are the single definition of the look; this is only the convenient way to use them.
//
// Props:
//   variant   'primary' | 'secondary' | 'ghost' | 'danger'   (default 'primary')
//   size      'sm' | 'md'                                     (default 'md'; 'lg' is accepted and treated as 'md')
//   loading   boolean — spinner + busy state; the button is disabled while loading
//   disabled  boolean — looks disabled (.ts-btn:disabled)
//   icon      a lucide-react component (e.g. Plus) or a node — shown before the label
//   iconRight a lucide-react component or node — shown after the label
//   fullWidth boolean
//   as        'button' | 'a' | a router Link component        (default 'button')
//   ...rest   onClick, href, to, type, aria-*, data-*
//
// Usage:
//   import { Plus } from 'lucide-react';
//   <Button icon={Plus} onClick={add}>Add client</Button>
//   <Button variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
//   <Button loading={saving}>Save changes</Button>

import { forwardRef, isValidElement, createElement } from 'react';

const ICON_SIZE = { sm: 14, md: 16 };

function renderIcon(icon, size) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === 'string') return <span aria-hidden="true">{icon}</span>;
  return createElement(icon, { size, 'aria-hidden': true, strokeWidth: 2 });   // a lucide component
}

export const Button = forwardRef(function Button({
  children,
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  disabled  = false,
  icon,
  iconRight,
  fullWidth = false,
  as: Tag   = 'button',
  type,
  className = '',
  ...rest
}, ref) {
  const sz = size === 'sm' ? 'sm' : 'md';
  const cls = ['ts-btn', `ts-btn-${variant}`, sz === 'sm' && 'ts-btn-sm', fullWidth && 'ts-btn-block', className].filter(Boolean).join(' ');
  const isButton = Tag === 'button';
  const inactive = disabled || loading;

  return (
    <Tag
      ref={ref}
      className={cls}
      {...(isButton ? { type: type || 'button', disabled: inactive } : { 'aria-disabled': inactive || undefined, role: Tag === 'a' ? 'button' : undefined })}
      aria-busy={loading || undefined}
      {...rest}
      onClick={inactive && !isButton ? (e) => e.preventDefault() : rest.onClick}
    >
      {!loading && renderIcon(icon, ICON_SIZE[sz])}
      {children}
      {renderIcon(iconRight, ICON_SIZE[sz])}
    </Tag>
  );
});
