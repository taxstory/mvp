import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';

// Pages
import Dashboard         from './pages/app/Dashboard';
import CPAProjections    from './pages/cpa/CPAProjections';
import CPAVideoGenerator from './pages/cpa/CPAVideoGenerator';
import RIAProjections    from './pages/ria/RIAProjections';
import { BillingPage }   from './pages/app/BillingSettings';
import { SettingsPage }  from './pages/app/BillingSettings';
import { ClientsPage, DocumentsPage, MessagesPage, IntakePage, ESignPage, ReportsPage, InvoicesPage, HelpPage } from './pages/app/PlaceholderPages';

// Auth pages
import LoginPage         from './pages/auth/LoginPage';
import SignUpPage        from './pages/auth/SignUpPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Marketing
import LandingPage       from './pages/marketing/LandingPage';
import HowItWorksPage    from './pages/marketing/HowItWorksPage';
import PricingPage       from './pages/marketing/PricingPage';
import PrivacyPolicy     from './pages/legal/PrivacyPolicy';
import TermsOfService    from './pages/legal/TermsOfService';
import DPA               from './pages/legal/DPA';

function PrivateRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();
  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:'32px',height:'32px',borderRadius:'50%',border:'3px solid #EEEAFF',borderTopColor:'#6B5CE7',animation:'spin 0.7s linear infinite'}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && profile && !allowedRoles.includes(profile.role))
    return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Marketing */}
          <Route path="/"              element={<LandingPage />} />
          <Route path="/how-it-works"  element={<HowItWorksPage />} />
          <Route path="/pricing"       element={<PricingPage />} />
          <Route path="/privacy"       element={<PrivacyPolicy />} />
          <Route path="/terms"         element={<TermsOfService />} />
          <Route path="/dpa"           element={<DPA />} />

          {/* Auth */}
          <Route path="/login"          element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup"         element={<PublicRoute><SignUpPage /></PublicRoute>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* App shell with sidebar */}
          <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
            <Route path="/dashboard"       element={<Dashboard />} />
            <Route path="/cpa/projections" element={<CPAProjections />} />
            <Route path="/cpa/video"       element={<CPAVideoGenerator />} />
            <Route path="/ria/projections" element={<RIAProjections />} />
            <Route path="/clients"         element={<ClientsPage />} />
            <Route path="/documents"       element={<DocumentsPage />} />
            <Route path="/messages"        element={<MessagesPage />} />
            <Route path="/intake"          element={<IntakePage />} />
            <Route path="/esign"           element={<ESignPage />} />
            <Route path="/reports"         element={<ReportsPage />} />
            <Route path="/invoices"        element={<InvoicesPage />} />
            <Route path="/billing"         element={<BillingPage />} />
            <Route path="/settings"        element={<SettingsPage />} />
            <Route path="/help"            element={<HelpPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
