import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LandingPage       from './pages/LandingPage';
import LoginPage         from './pages/auth/LoginPage';
import SignUpPage        from './pages/auth/SignUpPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import Dashboard         from './pages/Dashboard';
import CPAProjections    from './pages/cpa/CPAProjections';
import CPAVideoGenerator from './pages/cpa/CPAVideoGenerator';
import RIAProjections    from './pages/ria/RIAProjections';
import BillingPage       from './pages/BillingPage';
import SettingsPage      from './pages/SettingsPage';
import PrivacyPolicy     from './pages/legal/PrivacyPolicy';
import TermsOfService    from './pages/legal/TermsOfService';
import DPA               from './pages/legal/DPA';

function PrivateRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

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
          {/* Public */}
          <Route path="/"               element={<LandingPage />} />
          <Route path="/privacy"        element={<PrivacyPolicy />} />
          <Route path="/terms"          element={<TermsOfService />} />
          <Route path="/dpa"            element={<DPA />} />

          {/* Auth */}
          <Route path="/login"          element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup"         element={<PublicRoute><SignUpPage /></PublicRoute>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* App — all roles */}
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/billing"   element={<PrivateRoute><BillingPage /></PrivateRoute>} />
          <Route path="/settings"  element={<PrivateRoute><SettingsPage /></PrivateRoute>} />

          {/* CPA-only */}
          <Route path="/cpa/projections"   element={<PrivateRoute allowedRoles={['cpa']}><CPAProjections /></PrivateRoute>} />
          <Route path="/cpa/video"         element={<PrivateRoute allowedRoles={['cpa']}><CPAVideoGenerator /></PrivateRoute>} />

          {/* RIA-only */}
          <Route path="/ria/projections"   element={<PrivateRoute allowedRoles={['ria']}><RIAProjections /></PrivateRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
