// Express app for the gym tracker. Exported without calling .listen() so it runs
// two ways (same pattern as papers_web):
//   - locally:  server/index.mjs imports it and listens on a port
//   - on Vercel: api/index.mjs mounts it as a serverless function
//
// Every /api route requires a valid Supabase access token (this is a private,
// login-required app). The token is validated by requireAuth, which sets
// req.userId; all data is then scoped to that user.
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { requireAuth, requireAdmin, createAccount } from './auth.mjs';
import {
  listExercises, addExercise, updateExercise, deleteExercise, categoryCounts,
  logScreen, listSessions, createSession, updateSession, getWorkout, deleteWorkout,
  exerciseHistory, progress, stats, getPrefs, setPrefs, exportRows,
} from './db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(HERE, '..', 'web', 'dist');

const app = express();

// Parse JSON bodies. On Vercel the runtime may have already parsed req.body; if
// so, skip re-reading the consumed stream. (Same guard as papers_web.)
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') return next();
  return express.json()(req, res, next);
});

// Wrap an async handler so thrown/rejected errors reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const api = express.Router();
api.use(requireAuth); // every route below is login-gated

// --- session / account -------------------------------------------------------
api.get('/me', (req, res) => res.json({ username: req.username, isAdmin: req.isAdmin }));

// Admin-only: create another account (no public signup).
api.post('/users', requireAdmin, wrap(async (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  const created = await createAccount({ username, password, isAdmin: !!isAdmin });
  res.json({ user: created });
}));

// --- exercise library --------------------------------------------------------
api.get('/exercises', wrap(async (req, res) => {
  res.json({ exercises: await listExercises(req.userId, req.query.category) });
}));
api.post('/exercises', wrap(async (req, res) => {
  res.json({ exercise: await addExercise(req.userId, req.body || {}) });
}));
api.put('/exercises/:id', wrap(async (req, res) => {
  res.json({ exercise: await updateExercise(req.userId, req.params.id, req.body || {}) });
}));
api.delete('/exercises/:id', wrap(async (req, res) => {
  await deleteExercise(req.userId, req.params.id);
  res.json({ ok: true });
}));
api.get('/exercises/:id/history', wrap(async (req, res) => {
  res.json(await exerciseHistory(req.userId, req.params.id));
}));

api.get('/categories', wrap(async (req, res) => {
  res.json({ categories: await categoryCounts(req.userId) });
}));

// The logging screen: a category's exercises + "last time" + suggestions.
api.get('/log', wrap(async (req, res) => {
  res.json(await logScreen(req.userId, req.query.category));
}));

// --- workouts (sessions) -----------------------------------------------------
api.get('/workouts', wrap(async (req, res) => {
  const limit = parseInt(req.query.limit, 10);
  res.json({ workouts: await listSessions(req.userId, { limit: Number.isFinite(limit) ? limit : undefined }) });
}));
api.post('/workouts', wrap(async (req, res) => {
  res.json({ workout: await createSession(req.userId, req.body || {}) });
}));
api.get('/workouts/:id', wrap(async (req, res) => {
  const w = await getWorkout(req.userId, req.params.id);
  if (!w) return res.status(404).json({ error: 'unknown workout' });
  res.json({ workout: w });
}));
api.put('/workouts/:id', wrap(async (req, res) => {
  res.json({ workout: await updateSession(req.userId, req.params.id, req.body || {}) });
}));
api.delete('/workouts/:id', wrap(async (req, res) => {
  await deleteWorkout(req.userId, req.params.id);
  res.json({ ok: true });
}));

// --- progress / stats / prefs ------------------------------------------------
api.get('/progress/:exerciseId', wrap(async (req, res) => {
  res.json(await progress(req.userId, req.params.exerciseId, String(req.query.range || 'all')));
}));
api.get('/stats', wrap(async (req, res) => res.json(await stats(req.userId))));
api.get('/prefs', wrap(async (req, res) => res.json(await getPrefs(req.userId))));
api.post('/prefs', wrap(async (req, res) => res.json(await setPrefs(req.userId, req.body || {}))));

// --- CSV export (fetched with the auth header, then downloaded client-side) --
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
api.get('/export.csv', wrap(async (req, res) => {
  const rows = await exportRows(req.userId);
  const cols = ['date', 'category', 'exercise', 'set_number', 'weight', 'reps', 'e1rm', 'ready_to_progress', 'rpe', 'note'];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="gym_log.csv"');
  res.send('﻿' + lines.join('\n')); // BOM so Excel reads UTF-8
}));

// 400 for known input errors, 404 for "unknown …", else bubble to 500.
api.use((err, _req, res, _next) => {
  const msg = err?.message || 'server error';
  if (/^unknown /i.test(msg)) return res.status(404).json({ error: msg });
  if (/required|must be|already have|at least/i.test(msg)) return res.status(400).json({ error: msg });
  console.error(err);
  res.status(500).json({ error: msg });
});

app.use('/api', api);

// Serve the built React app for local `npm start`. On Vercel the static site is
// served by the CDN and this function only ever receives /api/* requests, so this
// block is simply inactive there.
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
}

export default app;
