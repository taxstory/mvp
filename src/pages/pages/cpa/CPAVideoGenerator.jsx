// src/pages/cpa/CPAVideoGenerator.jsx
// Full implementation: see TaxStory_Technical_Implementation_Guide.docx — Phase 2
import { Link } from 'react-router-dom';
export default function CPAVideoGenerator() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link to="/dashboard" className="text-sm text-brand-purple hover:underline mb-6 block">← Dashboard</Link>
      <div className="max-w-4xl mx-auto card">
        <h1 className="font-serif text-2xl font-bold text-brand-dark mb-2">Video Generator</h1>
        <p className="text-gray-500 text-sm">Generate AI-powered client video walkthroughs. Full implementation in the build guide — Phase 2.</p>
      </div>
    </div>
  );
}
