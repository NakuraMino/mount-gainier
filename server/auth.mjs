// Auth via Supabase Auth. The browser signs in with the anon key
// (supabase.auth.signInWithPassword) and sends the resulting access token (a JWT)
// as `Authorization: Bearer <token>` to our API. Here we validate that token and
// resolve it to a user + profile, and we provide an admin-only account creator.
//
// Supabase Auth is email-based, but the user wants a username/password feel, so
// each username maps to a fixed synthetic email (e.g. mino -> mino@gymtracker.local).
// The real username lives in the `profiles` table.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { supabase } from './supabase.mjs';

const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'gymtracker.local';

export const usernameToEmail = (username) => `${normUser(username)}@${EMAIL_DOMAIN}`;
export const normUser = (username) => String(username || '').trim().toLowerCase();

// Supabase access tokens are JWTs signed with the project's asymmetric key
// (ES256). We verify them locally against the project's public JWKS instead of
// calling supabase.auth.getUser(token) on every request — that's a network
// round-trip to Supabase Auth on the hot path of every API call. createRemoteJWKSet
// fetches the key set once, caches it in memory, and refetches automatically when
// the signing key rotates. Trade-off: a token is trusted until it expires (≤1h),
// so a server-side revocation isn't reflected until then — fine for this private,
// admin-provisioned app with no "sign out everywhere" flow.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const JWKS = SUPABASE_URL ? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)) : null;

// The profile (username / is_admin) rarely changes, so cache it briefly per user
// rather than querying Postgres on every request. Short TTL keeps is_admin
// reasonably fresh — it gates the admin-only route.
const PROFILE_TTL_MS = 60_000;
const profileCache = new Map(); // userId -> { value, expires }

async function getProfile(userId) {
  const hit = profileCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const { data } = await supabase
    .from('profiles')
    .select('username, is_admin')
    .eq('id', userId)
    .maybeSingle();
  profileCache.set(userId, { value: data || null, expires: Date.now() + PROFILE_TTL_MS });
  return data || null;
}

// Express middleware: require a valid Supabase access token. On success sets
// req.userId / req.username / req.isAdmin; otherwise 401.
export async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'not signed in' });
    if (!JWKS) return res.status(500).json({ error: 'auth not configured (SUPABASE_URL missing)' });

    let payload;
    try {
      ({ payload } = await jwtVerify(token, JWKS, {
        issuer: ISSUER,
        audience: 'authenticated',
        algorithms: ['ES256'],
      }));
    } catch {
      return res.status(401).json({ error: 'invalid or expired session' });
    }
    const userId = payload.sub;
    if (!userId) return res.status(401).json({ error: 'invalid or expired session' });

    const profile = await getProfile(userId);
    req.userId = userId;
    req.username = profile?.username || payload.email || '';
    req.isAdmin = !!profile?.is_admin;
    next();
  } catch (err) {
    next(err);
  }
}

// Admin gate — use after requireAuth.
export function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(403).json({ error: 'admin only' });
  next();
}

// Create an account (admin route / seed / CLI). Re-runnable: if the auth user
// already exists we reuse it and reset the password, and the profile is upserted.
// Returns { id, username }.
export async function createAccount({ username, password, isAdmin = false }) {
  const uname = normUser(username);
  if (!uname) throw new Error('username required');
  if (!password || String(password).length < 6) {
    throw new Error('password must be at least 6 characters');
  }
  const email = usernameToEmail(uname);

  let userId;
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: uname },
  });
  if (created.error) {
    if (/already.*(registered|exists)/i.test(created.error.message)) {
      const existing = await findAuthUserByEmail(email);
      if (!existing) throw new Error(created.error.message);
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, { password }); // re-seed password
    } else {
      throw new Error(created.error.message);
    }
  } else {
    userId = created.data.user.id;
  }

  const { error: upErr } = await supabase
    .from('profiles')
    .upsert({ id: userId, username: uname, is_admin: isAdmin }, { onConflict: 'id' });
  if (upErr) throw new Error(upErr.message);

  return { id: userId, username: uname };
}

// The Admin API has no get-by-email, so page through users. Fine for a personal
// app with a handful of accounts.
async function findAuthUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}
