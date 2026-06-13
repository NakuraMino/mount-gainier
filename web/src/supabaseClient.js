// Browser Supabase client — used ONLY for auth (login / session / logout). All
// app data goes through our own /api routes, never directly to Supabase. The anon
// key is public by design and safe to ship to the browser.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

export const supabase = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gymtracker.auth' },
});

// Usernames map to a fixed synthetic email (must match the server's
// AUTH_EMAIL_DOMAIN default). So you log in with "mino", not an email address.
const EMAIL_DOMAIN = 'gymtracker.local';
export const usernameToEmail = (username) => `${String(username).trim().toLowerCase()}@${EMAIL_DOMAIN}`;
