// src/components/marketing/MarketingFooter.jsx
import { Link } from 'react-router-dom';

export default function MarketingFooter() {
  return (
    <footer className="bg-brand-dark text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-purple flex items-center justify-center">
                <span className="text-white font-bold text-sm">TS</span>
              </div>
              <span className="font-serif font-bold text-xl">TaxStory</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              The first AI-powered video platform for tax professionals. Turn completed returns into personalized client walkthroughs — in 90 seconds.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <span className="text-xs bg-white/10 text-gray-300 px-3 py-1 rounded-full">SOC 2 Compliance In Progress</span>
              <span className="text-xs bg-white/10 text-gray-300 px-3 py-1 rounded-full">PII-Free by Design</span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-3">
              <li><Link to="/how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How It Works</Link></li>
              <li><Link to="/pricing"      className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</Link></li>
              <li><Link to="/signup"       className="text-sm text-gray-400 hover:text-white transition-colors">Start Free Trial</Link></li>
              <li><Link to="/login"        className="text-sm text-gray-400 hover:text-white transition-colors">Sign In</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-3">
              <li><Link to="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms"   className="text-sm text-gray-400 hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/dpa"     className="text-sm text-gray-400 hover:text-white transition-colors">Data Processing Agreement</Link></li>
              <li><a href="mailto:hello@tellmytaxstory.com" className="text-sm text-gray-400 hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Lakeside Advisory Group, LLC. All rights reserved.</p>
          <p className="text-xs text-gray-500">Built for CPAs and RIAs who value their clients' time.</p>
        </div>
      </div>
    </footer>
  );
}
