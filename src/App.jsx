import './styles/tokens.css';
import './styles/launch.css';
// src/App.jsx — TaxStory master router (updated Sep 2026)
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase }                              from './lib/supabase';
import { clearAllDrafts }                        from './utils/drafts';
import { AuthProvider, useAuth }                   from './context/AuthContext';
import { SubscriptionProvider }                   from './context/SubscriptionContext';
import { ToastProvider, ToastContainer }          from './components/ui/Toast';
import { ConfirmProvider }                        from './components/ui/ConfirmProvider';

import AppLayout           from './components/AppLayout';
import LandingPage         from './pages/marketing/LandingPage';
import HowItWorksPage      from './pages/marketing/HowItWorksPage';
import PricingPage         from './pages/marketing/PricingPage';
import LoginPage           from './pages/auth/LoginPage';
import SignUpPage          from './pages/auth/SignUpPage';
import ResetPasswordPage   from './pages/auth/ResetPasswordPage';
import CalibratePage       from './pages/app/CalibratePage';
import OnboardingWizard    from './pages/onboarding/OnboardingWizard';
import Dashboard           from './pages/app/Dashboard';
import ClientsPage         from './pages/app/ClientsPage';
import BillingSettings     from './pages/app/BillingSettings';
import MessagesPage        from './pages/app/MessagesPage';
import DocumentsPage       from './pages/app/DocumentsPage';
import ClientIntakePage    from './pages/app/ClientIntakePage';
import ReportsPage         from './pages/app/ReportsPage';
import HelpPage            from './pages/app/HelpPage';
import SettingsPage        from './pages/app/SettingsPage';
import CPAProjections      from './pages/cpa/CPAProjections';
import ScenarioProjections from './pages/cpa/ScenarioProjections';
import CPAVideoGenerator   from './pages/cpa/CPAVideoGenerator';
import RIAProjections      from './pages/ria/RIAProjections';
import { FEATURES }        from './config/features';
import VideoViewer         from './pages/viewer/VideoViewer';
import ClientPortal        from './pages/viewer/ClientPortal';
import PrivacyPolicy       from './pages/legal/PrivacyPolicy';
import TermsOfService      from './pages/legal/TermsOfService';
import DPA                 from './pages/legal/DPA';

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
      </BrowserRouter>
      <ToastContainer />
      </ConfirmProvider>
      </ToastProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
