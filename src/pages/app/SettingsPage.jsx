// src/pages/app/SettingsPage.jsx
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function SettingsPage() {
  const { profile } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link to="/dashboard" className="text-sm text-brand-purple hover:underline mb-6 block">← Dashboard</Link>
      <div className="max-w-2xl mx-auto card">
        <h1 className="font-serif text-2xl font-bold text-brand-dark mb-4">Settings</h1>
        <p className="text-gray-500 text-sm mb-2">Role: <strong>{profile?.role}</strong></p>
        <p className="text-gray-500 text-sm">Firm: <strong>{profile?.firm_name}</strong></p>
      </div>
    </div>
  );
}
