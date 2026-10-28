// STAND-IN (scaffold) — NOT your real file. It exists only so this snapshot can build and run. In your real repository keep YOUR version; the merge script never copies this one.
import { Link } from 'react-router-dom';

export default function PricingPage() {
  return (
    <main style={{ maxWidth: 720, margin: '10vh auto', padding: 24 }}>
      <h1 style={{ fontSize: 26 }}>Pricing</h1>
      <p style={{ fontSize: 13, opacity: .7 }}>Stand-in page — replace with your real content.</p>
      <p><Link to="/">Home</Link></p>
    </main>
  );
}
