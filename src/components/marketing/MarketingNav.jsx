import { Link } from 'react-router-dom';

export default function MarketingNav() {
  return (
    <nav className="bg-brand-dark text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
      <Link to="/" className="flex items-center gap-2 flex-shrink-0">
        <img src="/brand/taxstory-lockup-horizontal-primary-on-dark.svg" alt="TaxStory" style={{ height: 32, width: 'auto', display: 'block' }} />
      </Link>

      <div className="flex items-center gap-4 sm:gap-6 whitespace-nowrap">
        <Link to="/how-it-works" className="hidden sm:inline text-sm text-gray-300 hover:text-white transition-colors">
          How It Works
        </Link>
        <Link to="/pricing" className="hidden sm:inline text-sm text-gray-300 hover:text-white transition-colors">
          Pricing
        </Link>
        <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors">
          Sign In
        </Link>
        <Link to="/signup" className="bg-brand-purple hover:bg-brand-purple-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <span className="sm:hidden">Free trial</span><span className="hidden sm:inline">Start Free Trial</span>
        </Link>
      </div>
    </nav>
  );
}
