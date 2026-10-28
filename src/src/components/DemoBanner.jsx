// src/components/DemoBanner.jsx
// Shown when logged in as the demo account.
// Import and render inside AppLayout.jsx just above <Outlet />.

import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const DEMO_EMAIL = 'demo@tellmytaxstory.com';

export default function DemoBanner() {
  const { user } = useAuth();
  if (user?.email !== DEMO_EMAIL) return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, var(--color-dark) 0%, var(--color-purple-2) 100%)',
      borderBottom: '1.5px solid rgba(255,255,255,0.12)',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          background: 'var(--color-yellow)', color: 'var(--color-dark)',
          fontSize: '9px', fontWeight: 800, padding: '2px 8px',
          borderRadius: '20px', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>Demo</span>
        <span style={{ color: 'rgba(255,255,255,0.7)' }}>
          You're viewing a fully-populated demo account — all data is illustrative.
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link to="/signup" style={{
          background: 'var(--purple)', color: 'white',
          padding: '5px 14px', borderRadius: '8px', fontWeight: 700,
          fontSize: '11px', textDecoration: 'none',
        }}>
          Start Free Trial →
        </Link>
      </div>
    </div>
  );
}
