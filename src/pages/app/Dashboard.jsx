import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';

export default function Dashboard() {
  const { profile, signOut } = useAuth();
  const { tier, isTrialing, projectionsRemaining, creditsRemaining } = useSubscription();
  const role = profile?.role ?? 'cpa';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-purple flex items-center justify-center">
            <span className="text-white font-bold text-xs">TS</span>
          </div>
          <span className="font-serif font-bold text-lg text-brand-dark">TaxStory</span>
        </div>
        <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {isTrialing && (
          <div className="bg-brand-purple/10 border border-brand-purple/20 rounded-xl px-5 py-4 mb-8 flex items-center justify-between">
            <p className="text-sm text-brand-purple font-medium">
              ⭐ You're on a free trial ·{' '}
              <Link to="/billing" className="underline">Upgrade to keep access</Link>
            </p>
          </div>
        )}

        <h1 className="font-serif text-3xl font-bold text-brand-dark mb-2">
          Welcome back{profile?.firm_name ? `, ${profile.firm_name}` : ''}
        </h1>
        <p className="text-gray-500 mb-10">
          {tier} plan · {projectionsRemaining} projections remaining · {creditsRemaining} video credits remaining
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {role === 'cpa' && <>
            <Link to="/cpa/projections" className="card hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">📄</div>
              <h3 className="font-semibold text-brand-dark text-lg mb-1">CPA Projections</h3>
              <p className="text-sm text-gray-500">Upload and parse tax returns, run projections.</p>
            </Link>
            <Link to="/cpa/video" className="card hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">🎬</div>
              <h3 className="font-semibold text-brand-dark text-lg mb-1">Video Generator</h3>
              <p className="text-sm text-gray-500">Generate AI video walkthroughs for clients.</p>
            </Link>
          </>}
          {role === 'ria' && (
            <Link to="/ria/projections" className="card hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="font-semibold text-brand-dark text-lg mb-1">RIA Projections</h3>
              <p className="text-sm text-gray-500">Multi-year tax projections and scenario modeling.</p>
            </Link>
          )}
          <Link to="/billing" className="card hover:shadow-md transition-shadow">
            <div className="text-3xl mb-3">💳</div>
            <h3 className="font-semibold text-brand-dark text-lg mb-1">Billing</h3>
            <p className="text-sm text-gray-500">Manage your subscription and payment method.</p>
          </Link>
          <Link to="/settings" className="card hover:shadow-md transition-shadow">
            <div className="text-3xl mb-3">⚙️</div>
            <h3 className="font-semibold text-brand-dark text-lg mb-1">Settings</h3>
            <p className="text-sm text-gray-500">Update your firm details and preferences.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
