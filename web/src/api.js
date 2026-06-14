// Thin API client. Every request carries the current Supabase access token as a
// Bearer header; the Express server validates it and scopes data to that user.
import { supabase } from './supabaseClient.js';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  workouts: (limit) => j(`/api/workouts${limit ? `?limit=${limit}` : ''}`),
  workout: (id) => j(`/api/workouts/${id}`),
  createWorkout: (b) => post('/api/workouts', b),
  updateWorkout: (id, b) => put(`/api/workouts/${id}`, b),
  deleteWorkout: (id) => del(`/api/workouts/${id}`),

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
