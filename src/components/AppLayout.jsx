// src/components/AppLayout.jsx
// Sidebar nav now driven by live subscription state — no hardcoded "Pro" badges.

import { useState, useEffect } from 'react';
import { FEATURES } from '../config/features';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { supabase } from '../lib/supabase';
import DemoBanner     from './DemoBanner';
import FeedbackModal  from './FeedbackModal';

// NAV is a function of live state so badges can never disagree with Billing or the data.
// The only badges are live ones: client count, unread messages, and the account's actual plan on Billing.
function buildNav({ isPaid, planLabel, unreadCount, clientCount }) {
  const planBadge = isPaid
    ? { badge: planLabel || 'Pro', badgeClass: 'ts-b-pro' }
    : { badge: 'Trial', badgeClass: 'ts-b-new' };
  const count = n => (n > 0 ? { badge: String(n), badgeClass: 'ts-b-num' } : {});

  return [
    { section: 'Overview', items: [
      { to: '/dashboard', icon: '⊞', label: 'Dashboard' },
    ]},
    { section: 'Tools', items: [
      { to: '/cpa/projections', icon: '📊', label: 'Tax Projections' },
      ...(FEATURES.planningModules ? [
        { to: '/cpa/scenarios',   icon: '⚖',  label: 'Scenario Projections' },
        { to: '/ria/projections', icon: '📈', label: 'Investment Planning' },
      ] : []),
      { to: '/cpa/video',       icon: '🎬', label: 'Video Generator' },
    ]},
    { section: 'Clients', items: [
      { to: '/clients',   icon: '👤', label: 'Client list', ...count(clientCount) },
      { to: '/messages',  icon: '💬', label: 'Messages',    ...count(unreadCount) },
    ]},
    { section: 'Account', items: [
      { to: '/billing',  icon: '💳', label: 'Billing', ...planBadge },
      { to: '/settings', icon: '⚙',  label: 'Settings' },
      { to: '/help',     icon: '?',   label: 'Help & support' },
    ]},
  ];
}

const PLAN_LABELS = {
  cpa_basic: 'Tax Basic', cpa_pro: 'Tax Pro', ria_basic: 'Investment Basic', ria_pro: 'Investment Pro',
};

export default function AppLayout() {
  const { user, profile } = useAuth();
  const { isActive, tier, loading: subLoading } = useSubscription();
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [clientCount,  setClientCount]  = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [navOpen,      setNavOpen]      = useState(false); // mobile sidebar toggle

  useEffect(() => {
    if (!user) return;
    // Fetch live unread count and subscribe to realtime changes
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('direction', 'inbound')
        .eq('read', false);
      setUnreadCount(count || 0);
    };
    fetchUnread();
    // Client list badge: number of clients on the account (head-only count, no rows fetched)
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setClientCount(count || 0));
    const channel = supabase.channel(`messages-unread-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, fetchUnread)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  const isPaid    = isActive === true;
  const planLabel = PLAN_LABELS[tier] || null;
  const NAV = buildNav({ isPaid, planLabel, unreadCount, clientCount });

  const initials = profile?.firm_name
    ? profile.firm_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
    : 'TS';

  // Single source of truth for the account-chip status text —
  // matches exactly what Billing page would show for the same state.
  const statusText = subLoading ? '…' : isPaid ? (planLabel || 'Pro') : 'Free Trial';

  return (
    <>
      <a href="#main-content" className="ts-skip-link">Skip to main content</a>
      <div className="ts-shell">
        {/* Sidebar */}
        {/* Mobile overlay — tapping it closes the nav */}
      {navOpen && (
        <div onClick={() => setNavOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:199,
            display:'none' }}
          className="ts-mobile-overlay" />
      )}

      {/* Hamburger button — only visible on mobile via CSS */}
      <button
        onClick={() => setNavOpen(n => !n)}
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={navOpen}
        className="ts-hamburger"
        style={{ display:'none', position:'fixed', top:12, left:12, zIndex:300,
          width:40, height:40, borderRadius:10, background:'var(--color-dark)',
          border:'none', cursor:'pointer', alignItems:'center', justifyContent:'center',
          flexDirection:'column', gap:5 }}>
        <span style={{ display:'block', width:20, height:2, background:'#fff', borderRadius:2 }} />
        <span style={{ display:'block', width:20, height:2, background:'#fff', borderRadius:2 }} />
        <span style={{ display:'block', width:20, height:2, background:'#fff', borderRadius:2 }} />
      </button>

      <aside className={`ts-sidebar${navOpen ? ' ts-sidebar--open' : ''}`}>
          <div className="ts-sidebar-logo">
            <img
              src="/brand/taxstory-lockup-horizontal-one-color-white.svg"
              alt="TaxStory"
              style={{ height: 28, width: 'auto', display: 'block' }}
            />
          </div>
          <nav className="ts-nav" aria-label="Main navigation">
            {NAV.map((group, gi) => (
              <div className="ts-nav-section" key={gi}>
                {group.section && <div className="ts-nav-label">{group.section}</div>}
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) => `ts-ni${isActive ? ' ts-active' : ''}`}
                  >
                    <span className="ts-ni-ic" aria-hidden="true">{item.icon}</span>
                    {item.label}
                    {item.badge && (
                      <span className={`ts-ni-badge ${item.badgeClass}`}
                        aria-label={item.badgeClass === 'ts-b-num' ? `${item.badge} unread` : item.badge}>
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

      {/* Feedback / Bug report — always visible at sidebar bottom */}
      <button
        onClick={() => setShowFeedback(true)}
        style={{ margin:'0 12px 12px', padding:'8px 10px', background:'transparent',
          border:'1px solid rgba(255,255,255,.1)', borderRadius:9,
          color:'rgba(255,255,255,.4)', fontSize:11, fontWeight:500,
          cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center',
          gap:6, width:'calc(100% - 24px)', textAlign:'left' }}>
        🐛 Report a bug · Share feedback
      </button>

      <div className="ts-sidebar-footer">
            <div className="ts-user-av" aria-hidden="true">{initials}</div>
            <div>
              <div className="ts-user-name">{profile?.firm_name?.split(' ')[0] || 'User'}</div>
              <div className="ts-user-firm">
                <span className="ts-status-dot" aria-hidden="true" style={!isPaid ? { background: 'var(--amber)' } : undefined} />
                {statusText} · {profile?.firm_name || 'TaxStory'}
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DemoBanner />
          <main className="ts-main" id="main-content" tabIndex={-1}>
            <Outlet />
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
          </main>
        </div>
      </div>
    </>
  );
}
