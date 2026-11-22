import './styles/tokens.css';
import './styles/launch.css';
// src/App.jsx — TaxStory master router (updated Sep 2026)
import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase }                              from './lib/supabase';
import { clearAllDrafts }                        from './utils/drafts';
import { AuthProvider, useAuth }                   from './context/AuthContext';
import { SubscriptionProvider }                   from './context/SubscriptionContext';
import { ToastProvider, ToastContainer }          from './components/ui/Toast';
import { ConfirmProvider }                        from './components/ui/ConfirmProvider';

import AppLayout           from './components/AppLayout';
import LandingPage         from './pages/marketing/LandingPage';
const HowItWorksPage = lazyPage(() => import('./pages/marketing/HowItWorksPage'));
const PricingPage = lazyPage(() => import('./pages/marketing/PricingPage'));
const LoginPage = lazyPage(() => import('./pages/auth/LoginPage'));
const SignUpPage = lazyPage(() => import('./pages/auth/SignUpPage'));
const ResetPasswordPage = lazyPage(() => import('./pages/auth/ResetPasswordPage'));
const CalibratePage = lazyPage(() => import('./pages/app/CalibratePage'));
const OnboardingWizard = lazyPage(() => import('./pages/onboarding/OnboardingWizard'));
const Dashboard = lazyPage(() => import('./pages/app/Dashboard'));
const ClientsPage = lazyPage(() => import('./pages/app/ClientsPage'));
const BillingSettings = lazyPage(() => import('./pages/app/BillingSettings'));
const MessagesPage = lazyPage(() => import('./pages/app/MessagesPage'));
const DocumentsPage = lazyPage(() => import('./pages/app/DocumentsPage'));
const ClientIntakePage = lazyPage(() => import('./pages/app/ClientIntakePage'));
const ReportsPage = lazyPage(() => import('./pages/app/ReportsPage'));
const HelpPage = lazyPage(() => import('./pages/app/HelpPage'));
const SettingsPage = lazyPage(() => import('./pages/app/SettingsPage'));
const CPAProjections = lazyPage(() => import('./pages/cpa/CPAProjections'));
const ScenarioProjections = lazyPage(() => import('./pages/cpa/ScenarioProjections'));
const CPAVideoGenerator = lazyPage(() => import('./pages/cpa/CPAVideoGenerator'));
const RIAProjections = lazyPage(() => import('./pages/ria/RIAProjections'));
import { FEATURES }        from './config/features';
const VideoViewer = lazyPage(() => import('./pages/viewer/VideoViewer'));
const ClientPortal = lazyPage(() => import('./pages/viewer/ClientPortal'));
const PrivacyPolicy = lazyPage(() => import('./pages/legal/PrivacyPolicy'));
const TermsOfService = lazyPage(() => import('./pages/legal/TermsOfService'));
const DPA = lazyPage(() => import('./pages/legal/DPA'));

// Pages load on demand: the landing page and the client video link no longer download the whole app first.
// If a page's file is missing because a new version was deployed while this tab was open, reload once to pick up the new version.
function lazyPage(load) {
  return lazy(() => load().then(
    (m) => { try { sessionStorage.removeItem('ts-chunk-reload'); } catch {} return m; },
    (err) => {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem('ts-chunk-reload') === '1'; sessionStorage.setItem('ts-chunk-reload', '1'); } catch {}
      if (!reloaded) { window.location.reload(); return new Promise(() => {}); }
      throw err;
    }
  ));
}

function PageLoading() {
  return <div className="ts-loading" role="status" style={{ minHeight: '60vh' }}>Loading…</div>;
}

// One title per page (tabs, bookmarks, search results). Client-facing pages set their own (firm / client name).
const TITLES = {
  '/': 'TaxStory — Client video walkthroughs of their tax return',
  '/how-it-works': 'How it works · TaxStory', '/pricing': 'Pricing · TaxStory',
  '/privacy': 'Privacy policy · TaxStory', '/terms': 'Terms of service · TaxStory', '/dpa': 'Data processing agreement · TaxStory',
  '/login': 'Sign in · TaxStory', '/signup': 'Start your free trial · TaxStory', '/reset-password': 'Reset password · TaxStory',
  '/onboarding': 'Set up your practice · TaxStory', '/dashboard': 'Dashboard · TaxStory', '/clients': 'Clients · TaxStory',
  '/billing': 'Billing · TaxStory', '/messages': 'Messages · TaxStory', '/settings': 'Settings · TaxStory', '/help': 'Help · TaxStory',
  '/cpa/projections': 'Tax projections · TaxStory', '/cpa/scenarios': 'Scenario projections · TaxStory',
  '/cpa/video': 'Video generator · TaxStory', '/ria/projections': 'Investment planning · TaxStory',
};
function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/portal/')) return;                       // the portal titles itself with the client's name
    if (pathname.startsWith('/view/')) { document.title = 'Your tax return walkthrough'; return; }
    document.title = TITLES[pathname.replace(/\/+$/, '') || '/'] || 'TaxStory';
  }, [pathname]);
  return null;
}

function PrivateRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--color-purple)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  // Redirect new users to onboarding before they reach any app page
  if (profile && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />;
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

// Shown above every page when the sign-in service (Supabase) cannot be reached, instead of a blank screen.
function BackendNotice() {
  const { backendDown } = useAuth();
  if (!backendDown) return null;
  return (
    <div role="alert" style={{ background:'#FEF3C7', color:'#78350F', padding:'10px 16px', fontSize:13, textAlign:'center' }}>
      TaxStory can't reach its sign-in service right now, so signing in won't work. Please try again in a few minutes.
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (   // was `null`: a blank page while the session check ran (forever, if the sign-in service was unreachable)
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--color-muted)', fontSize:13 }}>Loading…</div>
  );
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  // Wipe locally stored drafts on EVERY sign-out (button, session expiry, another tab), whichever way the real auth module ends the session.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(evt => { if (evt === 'SIGNED_OUT') clearAllDrafts(); });
    return () => data?.subscription?.unsubscribe?.();
  }, []);
  return (
    <AuthProvider>
      <SubscriptionProvider>
      <ToastProvider>
      <ConfirmProvider>
      <BrowserRouter>
        <BackendNotice />
        <TitleManager />
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* Marketing */}
          <Route path="/"             element={<LandingPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/pricing"      element={<PricingPage />} />
          <Route path="/privacy"      element={<PrivacyPolicy />} />
          <Route path="/terms"        element={<TermsOfService />} />
          <Route path="/dpa"          element={<DPA />} />

          {/* Public video viewer — no account needed */}
          <Route path="/view/:token"    element={<VideoViewer />} />
          <Route path="/portal/:clientToken" element={<ClientPortal />} />

          {/* Auth */}
          <Route path="/login"          element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup"         element={<PublicRoute><SignUpPage /></PublicRoute>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Onboarding — authenticated but pre-completion */}
          <Route path="/onboarding" element={<OnboardingWizard />} />

          {/* Authenticated app — nested under AppLayout (sidebar + demo banner) */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard"       element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/clients"         element={<PrivateRoute><ClientsPage /></PrivateRoute>} />
            <Route path="/billing"         element={<PrivateRoute><BillingSettings /></PrivateRoute>} />
            <Route path="/messages"        element={<PrivateRoute><MessagesPage /></PrivateRoute>} />
            <Route path="/documents"       element={<PrivateRoute><DocumentsPage /></PrivateRoute>} />
            <Route path="/intake"          element={<PrivateRoute><ClientIntakePage /></PrivateRoute>} />
            <Route path="/reports"         element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
            <Route path="/help"            element={<PrivateRoute><HelpPage /></PrivateRoute>} />
            <Route path="/calibrate"       element={<PrivateRoute><CalibratePage /></PrivateRoute>} />   {/* internal: reader calibration, not in the nav */}
            <Route path="/settings"        element={<PrivateRoute><SettingsPage /></PrivateRoute>} />

            {/* Tax projection tools (previously CPA-labelled) */}
            <Route path="/cpa/projections" element={<PrivateRoute><CPAProjections /></PrivateRoute>} />
            {FEATURES.planningModules && <Route path="/cpa/scenarios"   element={<PrivateRoute><ScenarioProjections /></PrivateRoute>} />}
            <Route path="/cpa/video"       element={<PrivateRoute><CPAVideoGenerator /></PrivateRoute>} />

            {/* Investment planning (previously RIA-labelled) */}
            {FEATURES.planningModules && <Route path="/ria/projections" element={<PrivateRoute><RIAProjections /></PrivateRoute>} />}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <ToastContainer />
      </ConfirmProvider>
      </ToastProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
