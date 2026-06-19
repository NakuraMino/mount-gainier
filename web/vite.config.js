import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// The web app needs the Supabase URL + anon key at build time. We keep a single
// .env.local at the repo root (shared with the server), so we read VITE_* from
// there and from the shell/Vercel process env, and inline them explicitly. This
// avoids a second env file and works the same locally and on Vercel.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, resolve(process.cwd(), '..'), 'VITE_');
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || rootEnv.VITE_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || rootEnv.VITE_SUPABASE_ANON_KEY || '';

  return {
    plugins: [
      react(),
      VitePWA({
        // A new deploy's service worker activates and takes over on the next load,
        // so the installed app never gets stuck on a stale build.
        registerType: 'autoUpdate',
        // We already ship public/manifest.webmanifest (linked from index.html), so
        // don't let the plugin generate/inject a second one.
        manifest: false,
        workbox: {
          // Precache only the app shell — JS/CSS/HTML/SVG. Deliberately excludes the
          // large PNG app icons (and the unused app_icon_old.png) from the precache.
          globPatterns: ['**/*.{js,css,html,svg}'],
          // Offline SPA navigation falls back to index.html, but never for /api/* —
          // those must hit the network (dynamic, per-user data).
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          ],
        },
      }),
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
    },
    // Dev server serves the UI on :5173 and proxies API calls to the Express
    // backend on :8080. Production build goes to dist/ and is served by Express.
    server: {
      port: 5173,
      proxy: { '/api': 'http://localhost:8080' },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
