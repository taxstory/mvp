import { NavLink, Outlet } from 'react-router-dom';
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
    { to: '/messages',  icon: '💬', label: 'Messages', badge: '3', badgeClass: 'ts-b-num' },
    { to: '/intake',    icon: '📋', label: 'Client intake' },
  ]},
  { section: 'Firm', items: [
    { to: '/reports', icon: '📄', label: 'Reports & exports' },
  ]},
  { section: 'Account', items: [
    { to: '/billing',  icon: '💳', label: 'Billing',       badge: 'Pro', badgeClass: 'ts-b-pro' },
    { to: '/settings', icon: '⚙',  label: 'Settings' },
    { to: '/help',     icon: '?',   label: 'Help & support' },
  ]},
];

export default function AppLayout() {
  const { profile } = useAuth();

  const initials = profile?.firm_name
    ? profile.firm_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
    : 'ZL';

  return (
    <>
      <a href="#main-content" className="ts-skip-link">Skip to main content</a>
    <div className="ts-shell">
      {/* ── Sidebar ── */}
      <aside className="ts-sidebar">
        <div className="ts-sidebar-logo">
          <div className="ts-logo-wordmark">TaxStory</div>
          <div className="ts-logo-sub">AI for Tax Professionals</div>
        </div>

        <nav className="ts-nav" aria-label="Main navigation">
          {NAV.map((group, gi) => (
            <div className="ts-nav-section" key={gi}>
              {group.section && (
                <div className="ts-nav-label" id={`nav-group-${gi}`}>
                  {group.section}
                </div>
              )}
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `ts-ni${isActive ? ' ts-active' : ''}`}
                  aria-current={undefined}
                >
                  <span className="ts-ni-ic" aria-hidden="true">{item.icon}</span>
                  {item.label}
                  {item.badge && (
                    <span className={`ts-ni-badge ${item.badgeClass}`} aria-label={item.badgeClass === 'ts-b-num' ? `${item.badge} unread` : item.badge}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="ts-sidebar-footer">
          <div className="ts-user-av" aria-hidden="true">{initials}</div>
          <div>
            <div className="ts-user-name">{profile?.firm_name?.split(' ')[0] || 'Zach'} L.</div>
            <div className="ts-user-firm">
              <span className="ts-status-dot" aria-hidden="true" />
              Pro · {profile?.firm_name || 'Lakeside Advisory'}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ts-main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
    </>
  );
}
