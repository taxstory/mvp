// src/components/ui/PageHeader.jsx
//
// The title row at the top of every app page: title (Playfair 22px), subtitle, and actions on the right.
// On phones the actions drop below the title (handled in launch.css for .ts-hrow).
//
//   <PageHeader title="Client list" sub="Everyone you prepare returns or plans for"
//               actions={<Button icon={Plus} onClick={add}>Add client</Button>} />

export function PageHeader({ title, sub, actions, children }) {
  return (
    <div className="ts-hrow">
      <div>
        <h1 className="ts-page-title">{title}</h1>
        {sub && <div className="ts-page-sub">{sub}</div>}
        {children}
      </div>
      {actions && <div className="ts-hactions">{actions}</div>}
    </div>
  );
}
