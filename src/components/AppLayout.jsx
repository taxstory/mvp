import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';

const NAV = [
  { section: null, items: [
    { to: '/dashboard', icon: '⊞', label: 'Overview' },
  ]},
  { section: 'Tools', items: [
    { to: '/cpa/projections', icon: '📊', label: 'CPA Projections' },
    { to: '/ria/projections', icon: '📈', label: 'RIA Projections' },
    { to: '/cpa/video',       icon: '🎬', label: 'Video Generator', badge: 'Pro', badgeClass: 'ts-b-pro' },
  ]},
  { section: 'Clients', items: [
    { to: '/clients',   icon: '👤', label: 'Client list' },
    { to: '/documents', icon: '🗂',  label: 'Documents' },
    { to: '/messages',  icon: '💬', label: 'Messages',      badge: '3', badgeClass: 'ts-b-num' },
    { to: '/intake',    icon: '📋', label: 'Client intake' },
    { to: '/esign',     icon: '✍',  label: 'E-signatures' },
  ]},
  { section: 'Firm', items: [
    { to: '/reports',  icon: '📄', label: 'Reports & exports' },
    { to: '/invoices', icon: '💰', label: 'Invoicing' },
  ]},
  { section: 'Account', items: [
    { to: '/billing',  icon: '💳', label: 'Billing',       badge: 'Pro', badgeClass: 'ts-b-pro' },
    { to: '/settings', icon: '⚙',  label: 'Settings' },
    { to: '/help',     icon: '?',   label: 'Help & support' },
  ]},
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const { creditsRemaining } = useSubscription();
  const navigate = useNavigate();

  const initials = profile?.firm_name
    ? profile.firm_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
    : 'ZL';

  return (
    <div className="ts-shell">
      {/* ── Sidebar ── */}
      <aside className="ts-sidebar">
        <div className="ts-sidebar-logo">
          <div className="ts-logo-wordmark">TaxStory</div>
          <div className="ts-logo-sub">AI for Tax Professionals</div>
        </div>

        <nav className="ts-nav">
          {NAV.map((group, gi) => (
            <div className="ts-nav-section" key={gi}>
              {group.section && <div className="ts-nav-label">{group.section}</div>}
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `ts-ni${isActive ? ' ts-active' : ''}`}
                >
                  <span className="ts-ni-ic">{item.icon}</span>
                  {item.label}
                  {item.badge && (
                    <span className={`ts-ni-badge ${item.badgeClass}`}>{item.badge}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="ts-sidebar-footer">
          <div className="ts-user-av">{initials}</div>
          <div>
            <div className="ts-user-name">{profile?.firm_name?.split(' ')[0] || 'Zach'} L.</div>
            <div className="ts-user-firm">
              <span className="ts-status-dot" />
              Pro · {profile?.firm_name || 'Lakeside Advisory'}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ts-main">
        <Outlet />
      </main>
    </div>
  );
}
