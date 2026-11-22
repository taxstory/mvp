// src/components/ui/Card.jsx
//
// Cards render the .ts-card classes in index.css (the single definition of the look).
//
// Card props:
//   variant   'default' | 'selected' | 'flush'   (default 'default')
//             selected = purple outline (a chosen option); flush = tinted, borderless inset
//   as        element type (default 'div')
//   padding   override the standard 18px only when the content genuinely needs it
//   ...rest   className, style, onClick, aria-*
//
// CardTitle props: sub (subtitle), action (node on the right)
//
// Usage:
//   <Card>
//     <CardTitle sub="Based on the 2025 return" action={<Button size="sm">Edit</Button>}>Federal tax</CardTitle>
//     <CardBody>…</CardBody>
//     <CardFooter><Button variant="secondary" size="sm">Details</Button></CardFooter>
//   </Card>

export function Card({ children, variant = 'default', as: Tag = 'div', padding, className = '', style, ...rest }) {
  const cls = ['ts-card', variant !== 'default' && `ts-card-${variant}`, className].filter(Boolean).join(' ');
  return (
    <Tag className={cls} style={padding !== undefined ? { padding, ...style } : style} {...rest}>
      {children}
    </Tag>
  );
}

export function CardTitle({ children, sub, action, as: Tag = 'h2' }) {
  return (
    <div className="ts-card-head">
      <div>
        <Tag className="ts-card-title">{children}</Tag>
        {sub && <div className="ts-card-sub">{sub}</div>}
      </div>
      {action && <div className="ts-card-action">{action}</div>}
    </div>
  );
}

export function CardBody({ children, style }) {
  return <div className="ts-card-body" style={style}>{children}</div>;
}

export function CardFooter({ children, style }) {
  return <div className="ts-card-footer" style={style}>{children}</div>;
}
