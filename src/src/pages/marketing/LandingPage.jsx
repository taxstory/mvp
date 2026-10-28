// STAND-IN (scaffold) — NOT your real file. It exists only so this snapshot can build and run. In your real repository keep YOUR version; the merge script never copies this one.
import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <main style={{ maxWidth: 720, margin: '10vh auto', padding: 24, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 30 }}>TaxStory</h1>
      <p>Explain the return before the client calls.</p>
      <p><Link className="ts-btn ts-btn-primary" to="/signup">Create an account</Link> · <Link to="/login">Sign in</Link> · <Link to="/pricing">Pricing</Link> · <Link to="/how-it-works">How it works</Link></p>
      <p style={{ fontSize: 12, opacity: .7 }}>Stand-in landing page.</p>
    </main>
  );
}
