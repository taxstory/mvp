import { Link } from 'react-router-dom';

export default function MarketingNav() {
  return (
    <nav className="bg-brand-dark text-white px-6 py-4 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-purple flex items-center justify-center">
          <span className="text-white font-bold text-xs">TS</span>
        </div>
        <span className="font-serif font-bold text-lg">TaxStory</span>
      </Link>

      <div className="flex items-center gap-6">
        <Link to="/how-it-works" className="text-sm text-gray-300 hover:text-white transition-colors">
          How It Works
        </Link>
        <Link to="/pricing" className="text-sm text-gray-300 hover:text-white transition-colors">
          Pricing
        </Link>
        <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors">
          Sign In
        </Link>
        <Link to="/signup" className="bg-brand-purple hover:bg-purple-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          Start Free Trial
        </Link>
      </div>
    </nav>
  );
}
