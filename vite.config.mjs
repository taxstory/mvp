import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Netlify runs `npm run build` and publishes dist/ (see netlify.toml). Functions are built separately from netlify/functions.
// Supported browsers: Safari 16.4+, Chrome/Edge 90+, Firefox 90+ (the PDF parser uses regex lookbehind, which older Safari cannot parse).

// The public pages search engines should know about. App pages and client links are excluded on purpose.
const PUBLIC_PAGES = ['/', '/how-it-works', '/pricing', '/privacy', '/terms', '/dpa'];
// Never crawled: private client links (tokens in the URL) and signed-in app pages. netlify.toml also sends noindex for these.
const PRIVATE_PREFIXES = ['/view/', '/portal/', '/dashboard', '/clients', '/billing', '/messages', '/settings', '/onboarding', '/cpa/', '/ria/',
  '/help', '/calibrate', '/documents', '/intake', '/reports', '/reset-password'];

function siteOrigin(env) {
  // VITE_APP_URL if set, else Netlify's own build variable URL (the site's primary address, custom domain included).
  for (const raw of [env.VITE_APP_URL, process.env.URL]) {
    try { const u = new URL(String(raw || '').trim()); if (u.protocol === 'https:') return u.origin; } catch { /* next */ }
  }
  return null;
}

// robots.txt, sitemap.xml and absolute social-card URLs, built from the deployment's real address.
function seoFiles(origin) {
  return {
    name: 'taxstory-seo',
    transformIndexHtml(html) {
      if (!origin) return html;
      return html
        .replace('content="/og-image.png"', `content="${origin}/og-image.png"`)
        .replace('<meta name="twitter:card"', `<meta property="og:url" content="${origin}/" />\n    <meta name="twitter:card"`);
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...PRIVATE_PREFIXES.map(p => `Disallow: ${p}`)];
      if (origin) robots.push('', `Sitemap: ${origin}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' });
      if (origin) {
        const urls = PUBLIC_PAGES.map(p => `  <url><loc>${origin}${p === '/' ? '/' : p}</loc></url>`).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), seoFiles(siteOrigin(env))],
    build: { outDir: 'dist', sourcemap: false, target: ['es2020', 'chrome90', 'firefox90', 'safari16.4'] },
    server: { port: 5173 },
    test: { env: { VITE_ENABLE_PLANNING: 'true' }, environment: 'jsdom', setupFiles: ['tests/ui/setup.js'], include: ['tests/ui/**/*.test.jsx'], css: false, testTimeout: 20000 },
  };
});
