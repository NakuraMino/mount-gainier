// Supabase service-role client. The server is the only thing that touches the
// app's data tables, and it does so with the service-role key (which bypasses
// Row Level Security). NEVER ship this key to the browser — the frontend only
// ever calls our own /api routes, and uses the public anon key for login.
//
// Credentials come from the environment:
//   - locally:  node --env-file=.env.local ...   (see .env.local.example)
//   - on Vercel: Project Settings -> Environment Variables
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
      'Locally: copy .env.local.example to .env.local and fill them in. ' +
      'On Vercel: add them under Project Settings -> Environment Variables.',
  );
}

// Service-role key: server-side only, bypasses RLS. createClient eagerly
// initializes a realtime client which throws on Node < 22 (no native WebSocket);
// handing it `ws` as the transport keeps Node 20 working too (same trick as
// papers_web). We never persist/refresh a session here — this client acts as the
// service role, and also validates incoming user JWTs via auth.getUser(token).
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
