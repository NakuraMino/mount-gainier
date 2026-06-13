import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
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
    plugins: [react()],
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
