// Thin API client. Every request carries the current Supabase access token as a
// Bearer header; the Express server validates it and scopes data to that user.
import { supabase } from './supabaseClient.js';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// Cache the access token instead of calling supabase.auth.getSession() on every
// request — getSession() takes an internal Web Lock, which serializes the burst of
// requests we fire on startup. onAuthStateChange keeps the cache fresh (login,
// logout, and the ~hourly TOKEN_REFRESHED). We still fall back to getSession()
// when the cache is empty or within 60s of expiry, so the token never goes stale
// on the wire (getSession refreshes it when needed).
let cached = null; // { token, expiresAt } | null  (expiresAt = epoch seconds)
supabase.auth.onAuthStateChange((_event, session) => {
  cached = session ? { token: session.access_token, expiresAt: session.expires_at } : null;
});

async function authHeader() {
  const now = Math.floor(Date.now() / 1000);
  if (!cached?.token || (cached.expiresAt && cached.expiresAt - now < 60)) {
    const { data } = await supabase.auth.getSession();
    const s = data?.session;
    cached = s ? { token: s.access_token, expiresAt: s.expires_at } : null;
  }
  return cached?.token ? { Authorization: `Bearer ${cached.token}` } : {};
}

async function j(url, opts = {}) {
  const headers = { ...(opts.headers || {}), ...(await authHeader()) };
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const body = (method) => (url, b) =>
  j(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
const post = body('POST');
const put = body('PUT');
const del = (url) => j(url, { method: 'DELETE' });

export const api = {
  me: () => j('/api/me'),

  categories: () => j('/api/categories'),
  log: (category) => j(`/api/log?category=${encodeURIComponent(category || '')}`),

  exercises: (category) => j(`/api/exercises${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  addExercise: (b) => post('/api/exercises', b),
  updateExercise: (id, b) => put(`/api/exercises/${id}`, b),
  deleteExercise: (id) => del(`/api/exercises/${id}`),
  exerciseHistory: (id) => j(`/api/exercises/${id}/history`),

  // opts: { since: 'YYYY-MM-DD', offset, limit }. Returns { workouts, total }.
  workouts: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.since) qs.set('since', opts.since);
    if (opts.offset != null) qs.set('offset', opts.offset);
    if (opts.limit != null) qs.set('limit', opts.limit);
    const q = qs.toString();
    return j(`/api/workouts${q ? `?${q}` : ''}`);
  },
  // Lightweight calendar feed: { days: [{ date, category }] }, no sets loaded.
  workoutDays: () => j('/api/workout-days'),
  workout: (id) => j(`/api/workouts/${id}`),
  createWorkout: (b) => post('/api/workouts', b),
  updateWorkout: (id, b) => put(`/api/workouts/${id}`, b),
  deleteWorkout: (id) => del(`/api/workouts/${id}`),

  // Saved routines. templates() -> { templates: [{ id, name, category, exercises: [{exercise_id, name, category}] }] }
  templates: () => j('/api/templates'),
  createTemplate: (b) => post('/api/templates', b),
  templateFromWorkout: (workoutId, b) => post(`/api/templates/from-workout/${workoutId}`, b),
  updateTemplate: (id, b) => put(`/api/templates/${id}`, b),
  deleteTemplate: (id) => del(`/api/templates/${id}`),

  progress: (exerciseId, range) => j(`/api/progress/${exerciseId}?range=${encodeURIComponent(range || 'all')}`),
  stats: () => j('/api/stats'),
  mainLifts: () => j('/api/main-lifts'),

  prefs: () => j('/api/prefs'),
  setPrefs: (b) => post('/api/prefs', b),

  // CSV needs the auth header, so fetch it as a blob and let the caller download it.
  exportCsv: async () => {
    const res = await fetch('/api/export.csv', { headers: await authHeader() });
    if (!res.ok) throw new Error('export failed');
    return res.blob();
  },
};
