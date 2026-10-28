import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Netlify runs `npm run build` and publishes dist/ (see netlify.toml). Functions are built separately from netlify/functions.
// Supported browsers: Safari 16.4+, Chrome/Edge 90+, Firefox 90+ (the PDF parser uses regex lookbehind, which older Safari cannot parse).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, target: ['es2020', 'chrome90', 'firefox90', 'safari16.4'] },
  server: { port: 5173 },
  test: { env: { VITE_ENABLE_PLANNING: 'true' }, environment: 'jsdom', setupFiles: ['tests/ui/setup.js'], include: ['tests/ui/**/*.test.jsx'], css: false, testTimeout: 20000 },
});
