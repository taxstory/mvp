// src/pages/app/BillingPage.jsx
import { Link } from 'react-router-dom';
import { useSubscription } from '../../../hooks/useSubscription';

export default function BillingPage() {
  const { tier, isTrialing, subscription } = useSubscription();
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link to="/dashboard" className="text-sm text-brand-purple hover:underline mb-6 block">← Dashboard</Link>
      <div className="max-w-2xl mx-auto card">
        <h1 className="font-serif text-2xl font-bold text-brand-dark mb-4">Billing</h1>
        <p className="text-gray-500 text-sm mb-6">
          Current plan: <strong>{tier || 'None'}</strong> · Status: <strong>{subscription?.status || 'No subscription'}</strong>
        </p>
        {isTrialing && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-yellow-800 font-medium">You're on a free trial. Subscribe before your trial ends to keep access.</p>
          </div>
        )}
        <Link to="/pricing" className="btn-primary inline-block text-sm">View Plans & Subscribe</Link>
      </div>
    </div>
  );
}
