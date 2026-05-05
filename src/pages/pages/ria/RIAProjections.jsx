// src/pages/ria/RIAProjections.jsx
// Wire to src/utils/taxEngine.js — Full implementation in build guide Phase 3
import { Link } from 'react-router-dom';
export default function RIAProjections() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link to="/dashboard" className="text-sm text-brand-purple hover:underline mb-6 block">← Dashboard</Link>
      <div className="max-w-4xl mx-auto card">
        <h1 className="font-serif text-2xl font-bold text-brand-dark mb-2">RIA Projections</h1>
        <p className="text-gray-500 text-sm">Multi-year tax projection engine. Wire to src/utils/taxEngine.js. Full implementation in the build guide — Phase 3.</p>
      </div>
    </div>
  );
}
