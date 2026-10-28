# TaxStory Component Library — Usage Guide

Import from the barrel: `import { Button, Card, Alert, ... } from '../components/ui';`

---

## Button

Replaces every `<button className="ts-btn ts-btn-primary ...">` in the codebase.

```jsx
// Before (every page)
<button className="ts-btn ts-btn-primary" onClick={save}
  style={{ opacity: saving ? 0.7 : 1 }} disabled={saving}>
  {saving ? '...' : 'Save'}
</button>

// After
<Button onClick={save} loading={saving}>Save</Button>

// Variants
<Button variant="primary">Save</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="ghost" size="sm">Reset</Button>
<Button variant="danger" size="sm" icon="🗑">Delete</Button>
<Button variant="primary" fullWidth loading={uploading}>Upload & Parse</Button>
<Button as="a" href="/billing" variant="secondary">View billing</Button>
```

---

## Card + CardTitle + CardBody + CardFooter

Replaces `<div className="ts-card">` with composable sub-components.

```jsx
// Before
<div className="ts-card">
  <div className="ts-card-title">
    Federal Tax Summary
    <span className="ts-card-sub">Based on 2025 return</span>
  </div>
  <div>…content…</div>
</div>

// After
<Card>
  <CardTitle sub="Based on 2025 return"
    action={<Button size="sm" variant="secondary">Edit</Button>}>
    Federal Tax Summary
  </CardTitle>
  <CardBody>…content…</CardBody>
  <CardFooter>
    <Button variant="ghost" size="sm">View details</Button>
  </CardFooter>
</Card>

// Variants
<Card variant="outlined">…</Card>   // purple border (for highlighted cards)
<Card variant="elevated">…</Card>   // deeper shadow
<Card variant="flush">…</Card>      // no border, colored bg
<Card loading={isLoading}>…</Card>  // shimmer overlay while loading
```

---

## Badge / Pill

Replaces `<span className="ts-pill ts-p-green">` and all variants.

```jsx
// Before
<span className="ts-pill ts-p-green">Active</span>
<span className="ts-badge ts-b-pro">Pro</span>
<span className="ts-badge ts-b-num">{count}</span>

// After
<Badge variant="success" dot>Active</Badge>
<Badge variant="pro">Pro</Badge>
<Badge variant="num">{count}</Badge>
<Badge variant="warning">Trial</Badge>
<Pill variant="info">Tax Basic</Pill>   // always rounded
```

---

## Input / Field

Replaces raw `<input>` elements and their surrounding label + error markup.

```jsx
// Before (CPAProjections pattern — repeated 20+ times)
<div className="ts-frow">
  <label className="ts-fl">Annual wages <span>W-2 Box 1</span></label>
  <input type="number" value={form.wages} onChange={upd('wages')} placeholder="0" />
</div>

// After
<Field label="Annual wages" hint="W-2 Box 1">
  <Input type="number" value={form.wages} onChange={upd('wages')} />
</Field>

// With error
<Field label="Client email" error={errors.email} required>
  <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
    prefix="✉️" />
</Field>

// Sizes
<Input size="sm" />   // 30px height
<Input size="md" />   // 38px (default)
<Input size="lg" />   // 46px

// With suffix
<Input type="number" suffix="%" value={rate} onChange={e => setRate(+e.target.value)} />
```

---

## Spinner / PageSpinner / Skeleton

Replaces the three hand-rolled spinner divs and all inline loading states.

```jsx
// Inline spinner (in buttons, next to labels)
<Spinner size="sm" />
<Spinner size="md" color="white" />   // white spinner on dark bg

// Full-page loading (route transitions, auth check)
<PageSpinner label="Loading projections…" />

// Content placeholder while data loads
<Skeleton width="40%" />          // single line
<Skeleton lines={3} />            // 3 stacked lines (natural paragraph shape)
<Skeleton width={200} height={80} radius="var(--radius-lg)" />
```

---

## Alert

Replaces all the hand-rolled colored banners (error/success/warning divs).

```jsx
// Before (CPAProjections — repeated 6+ times)
{error && (
  <div style={{ background: 'var(--color-red-light)', color: 'var(--color-red-dark)',
    padding: '10px 14px', borderRadius: 10, fontSize: 12 }}>
    {error}
  </div>
)}

// After
{error && <Alert variant="danger">{error}</Alert>}

// All variants
<Alert variant="danger">{error}</Alert>
<Alert variant="success" title="Return parsed">12 fields extracted.</Alert>
<Alert variant="warning" onDismiss={() => setWarn(null)}>
  Rental loss suspended by §469.
</Alert>
<Alert variant="info" compact>
  🔒 PII is never stored — only financial figures leave this function.
</Alert>
```

---

## EmptyState

Replaces 15+ bespoke empty-state divs across the app.

```jsx
// Before (MessagesPage)
<div style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>
  <div style={{ fontSize: 40 }}>💬</div>
  <div>No messages yet.</div>
</div>

// After
<EmptyState icon="💬" title="No messages yet" />

// With body and CTA
<EmptyState
  icon="👤"
  title="No clients yet"
  body="Add your first client to start generating walkthroughs."
  action={<Button onClick={() => navigate('/clients/new')}>Add client</Button>}
/>

// Sizes
<EmptyState size="sm" icon="📊" title="No data" />     // compact
<EmptyState size="lg" icon="🎬" title="No walkthroughs" bordered />
```

---

## Modal

Replaces the FeedbackModal pattern — fully accessible with focus trap.

```jsx
const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Delete client</Button>

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Confirm deletion"
  size="sm"
  footer={
    <>
      <Button variant="danger" onClick={handleDelete}>Delete</Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </>
  }
>
  This will permanently delete the client and all their returns.
  This action cannot be undone.
</Modal>
```

---

## Toast (replaces setSaved / setReplySent / presetToast / setCopied)

**Setup** — add once to App.jsx:
```jsx
// App.jsx
import { ToastProvider, ToastContainer } from './components/ui';

export default function App() {
  return (
    <ToastProvider>
      <Router>…routes…</Router>
      <ToastContainer />
    </ToastProvider>
  );
}
```

**Usage in any component:**
```jsx
import { useToast } from '../components/ui';
const { toast } = useToast();

// Before (every page has a bespoke pattern)
const [saved, setSaved] = useState(false);
setSaved(true);
setTimeout(() => setSaved(false), 2500);
{saved && <div style={{...}}>✓ Settings saved</div>}

// After — one line anywhere in the app
toast('Settings saved');
toast('Something went wrong', { variant: 'danger' });
toast('Link copied to clipboard', { variant: 'success', duration: 2000 });
toast('Draft saved automatically', { variant: 'info' });
```

---

## Table

Replaces `<table className="ts-tbl">` with built-in sorting, loading, and empty state.

```jsx
const [sort, setSort] = useState({ key: 'name', dir: 'asc' });

<Table
  columns={[
    { key: 'name',    label: 'Client',   sortable: true },
    { key: 'taxYear', label: 'Year',     sortable: true, align: 'center' },
    { key: 'agi',     label: 'AGI',      sortable: true, align: 'right'  },
    { key: 'status',  label: 'Status',   width: '120px' },
  ]}
  data={clients}
  keyField="id"
  loading={loading}
  emptyState={
    <EmptyState icon="👤" title="No clients yet"
      body="Add your first client to start."
      action={<Button size="sm" onClick={addClient}>Add client</Button>}
    />
  }
  sortKey={sort.key}
  sortDir={sort.dir}
  onSort={(key, dir) => setSort({ key, dir })}
  onRowClick={(row) => navigate(`/clients/${row.id}`)}
/>
```

---

## LoadingScreen

Replaces the `if (loading) return <div>loading...</div>` pattern in AuthContext.

```jsx
// App.jsx / route guards
import { LoadingScreen } from './components/ui';

if (authLoading) return <LoadingScreen />;
if (subLoading)  return <LoadingScreen label="Loading your plan…" />;
```
