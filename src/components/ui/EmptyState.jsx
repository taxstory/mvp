// src/components/ui/EmptyState.jsx
//
// What a list or screen shows when there is nothing in it yet — always with the next step when there is one.
//
//   import { Users } from 'lucide-react';
//   <EmptyState icon={Users} title="No clients yet" body="Add a client to start a projection or walkthrough."
//               action={<Button icon={Plus} onClick={add}>Add client</Button>} />
//
// Props: icon (lucide component or node), title, body, action, size 'sm' | 'md', bordered.

import { createElement, isValidElement } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ icon = Inbox, title, body, action, size = 'md', bordered = false, className = '', style }) {
  const iconNode = !icon ? null : isValidElement(icon) || typeof icon === 'string'
    ? icon
    : createElement(icon, { size: size === 'sm' ? 22 : 28, strokeWidth: 1.75, 'aria-hidden': true });
  return (
    <div className={`ts-empty ts-empty-${size}${bordered ? ' ts-empty-bordered' : ''}${className ? ` ${className}` : ''}`} style={style}>
      {iconNode && <div className="ts-empty-icon" aria-hidden="true">{iconNode}</div>}
      {title && <div className="ts-empty-title">{title}</div>}
      {body && <div className="ts-empty-body">{body}</div>}
      {action && <div className="ts-empty-action">{action}</div>}
    </div>
  );
}
