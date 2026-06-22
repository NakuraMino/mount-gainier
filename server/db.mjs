// Data layer. Every function is scoped to a user_id and talks to Supabase with
// the service-role key. There is no read-only corpus (unlike papers_web): all
// state — exercises, workouts, sets — is per-user mutable data in Postgres.
//
// Derived numbers (estimated 1RM, PRs, "last time", progression suggestions,
// streaks) are computed here in JS rather than stored. A user's whole set history
// is small, so several read endpoints just load it all and reduce in memory.
import { supabase } from './supabase.mjs';

export const CATEGORIES = [
  { key: 'upper', label: 'Upper Body' },
  { key: 'lower', label: 'Lower Body' },
  { key: 'back', label: 'Back' },
];
const CATEGORY_KEYS = new Set([...CATEGORIES.map((c) => c.key), 'other']);

// --- small numeric helpers ---------------------------------------------------
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v) => {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
};
const round05 = (n) => Math.round(n * 2) / 2; // nearest 0.5
// Epley estimated 1-rep-max. Needs both a weight and reps to mean anything.
export const epley = (weight, reps) =>
  weight != null && reps != null && reps > 0 ? weight * (1 + reps / 30) : null;

// The "top set" of a list = heaviest weight, tie-broken by reps. null if none lifted.
function topSetOf(sets) {
  let best = null;
  for (const s of sets) {
    if (s.weight == null) continue;
    if (!best || s.weight > best.weight || (s.weight === best.weight && (s.reps || 0) > (best.reps || 0))) {
      best = s;
    }
  }
  return best;
}

const volumeOf = (sets) => sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);

// Progression increment heuristic: small jumps for dumbbell/unilateral work,
// bigger for lower body, default for the rest.
function incrementFor(ex) {
  const eq = (ex.equipment || '').toLowerCase();
  if (ex.is_unilateral || eq.includes('dumbbell') || eq.includes('db')) return 2.5;
  if (ex.category === 'lower') return 10;
  return 5;
}

// --- exercises ---------------------------------------------------------------

export async function listExercises(userId, category) {
  let q = supabase.from('exercises').select('*').eq('user_id', userId);
  if (category) q = q.eq('category', category);
  const { data, error } = await q.order('position', { ascending: true }).order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function exercisesById(userId) {
  const list = await listExercises(userId);
  return new Map(list.map((e) => [e.id, e]));
}

export async function addExercise(userId, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('exercise name required');
  const category = CATEGORY_KEYS.has(body.category) ? body.category : 'other';
  // append to the end of its category
  const existing = await listExercises(userId, category);
  const position = existing.reduce((m, e) => Math.max(m, e.position + 1), 0);
  const row = {
    user_id: userId,
    name,
    category,
    muscle_group: String(body.muscle_group || '').trim(),
    equipment: String(body.equipment || '').trim(),
    is_unilateral: !!body.is_unilateral,
    position,
    default_sets: intOrNull(body.default_sets) ?? 3,
    default_reps: intOrNull(body.default_reps) ?? 10,
  };
  const { data, error } = await supabase.from('exercises').insert(row).select('*').single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error(`you already have an exercise named "${name}"`);
    throw new Error(error.message);
  }
  return data;
}

export async function updateExercise(userId, id, body = {}) {
  const patch = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.category != null && CATEGORY_KEYS.has(body.category)) patch.category = body.category;
  if (body.muscle_group != null) patch.muscle_group = String(body.muscle_group).trim();
  if (body.equipment != null) patch.equipment = String(body.equipment).trim();
  if (body.is_unilateral != null) patch.is_unilateral = !!body.is_unilateral;
  if (body.position != null) patch.position = intOrNull(body.position) ?? 0;
  if (body.default_sets != null) patch.default_sets = intOrNull(body.default_sets) ?? 3;
  if (body.default_reps != null) patch.default_reps = intOrNull(body.default_reps) ?? 10;
  const { data, error } = await supabase
    .from('exercises')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('unknown exercise');
  return data;
}

export async function deleteExercise(userId, id) {
  const { error } = await supabase.from('exercises').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function categoryCounts(userId) {
  const list = await listExercises(userId);
  const counts = list.reduce((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + 1), acc), {});
  const out = CATEGORIES.map((c) => ({ ...c, count: counts[c.key] || 0 }));
  if (counts.other) out.push({ key: 'other', label: 'Other', count: counts.other });
  return out;
}

// --- history loader (whole user history, reduced in memory) ------------------

export async function listWorkouts(userId, { limit } = {}) {
  let q = supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// All of a user's workouts + their sets + their per-exercise meta, joined in JS.
// (Two `.in('workout_id', …)` queries — no embedded-resource filtering needed.)
async function loadHistory(userId) {
  const workouts = await listWorkouts(userId);
  const wById = new Map(workouts.map((w) => [w.id, w]));
  const ids = workouts.map((w) => w.id);
  if (!ids.length) return { workouts, wById, sets: [], meta: [] };
  const [setsRes, metaRes] = await Promise.all([
    supabase.from('sets').select('*').in('workout_id', ids),
    supabase.from('workout_exercises').select('*').in('workout_id', ids),
  ]);
  if (setsRes.error) throw new Error(setsRes.error.message);
  if (metaRes.error) throw new Error(metaRes.error.message);
  const sets = (setsRes.data || []).map((s) => ({ ...s, workout: wById.get(s.workout_id) }));
  return { workouts, wById, sets, meta: metaRes.data || [] };
}

// Group an exercise's sets into sessions (one per workout), newest first.
function sessionsForExercise(sets, meta, exerciseId) {
  const byWorkout = new Map();
  for (const s of sets) {
    if (s.exercise_id !== exerciseId || !s.workout) continue;
    if (!byWorkout.has(s.workout_id)) byWorkout.set(s.workout_id, { workout: s.workout, sets: [] });
    byWorkout.get(s.workout_id).sets.push(s);
  }
  const sessions = [...byWorkout.values()].map(({ workout, sets: ss }) => {
    ss.sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
    const top = topSetOf(ss);
    const m = meta.find((x) => x.workout_id === workout.id && x.exercise_id === exerciseId);
    return {
      workout_id: workout.id,
      date: workout.date,
      sets: ss.map((s) => ({ set_number: s.set_number, weight: s.weight, reps: s.reps })),
      topSet: top ? { weight: top.weight, reps: top.reps } : null,
      e1rm: top ? epley(top.weight, top.reps) : null,
      volume: volumeOf(ss),
      ready_to_progress: !!(m && m.ready_to_progress),
      rpe: m ? m.rpe : null,
    };
  });
  sessions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return sessions;
}

function computeSuggestion(ex, last) {
  if (!last || !last.topSet || last.topSet.weight == null) return null;
  const inc = incrementFor(ex);
  const next = round05(last.topSet.weight + inc);
  if (last.ready_to_progress) {
    return { weight: next, increment: inc, reason: 'you marked “ready for more” last time' };
  }
  if (last.topSet.reps != null && last.topSet.reps >= ex.default_reps) {
    return { weight: next, increment: inc, reason: `hit ${last.topSet.reps}≥${ex.default_reps} reps last time` };
  }
  return null;
}

// --- log screen --------------------------------------------------------------
// Exercises in a category, each with its previous session ("last time") and a
// progression suggestion. Powers the main logging view.
export async function logScreen(userId, category) {
  const exercises = await listExercises(userId, category || undefined);
  const { sets, meta } = await loadHistory(userId);
  return {
    category: category || null,
    exercises: exercises.map((ex) => {
      const sessions = sessionsForExercise(sets, meta, ex.id);
      const last = sessions[0] || null;
      return {
        ...ex,
        lastTime: last
          ? { date: last.date, sets: last.sets, topSet: last.topSet, e1rm: last.e1rm, ready_to_progress: last.ready_to_progress }
          : null,
        suggestion: computeSuggestion(ex, last),
      };
    }),
  };
}

// --- workouts (sessions) -----------------------------------------------------

// Build the entries view of a workout (sets + meta grouped by exercise).
export async function getWorkout(userId, id) {
  const { data: w, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!w) return null;

  const [setsRes, metaRes, exMap] = await Promise.all([
    supabase.from('sets').select('*').eq('workout_id', id).order('set_number', { ascending: true }),
    supabase.from('workout_exercises').select('*').eq('workout_id', id),
    exercisesById(userId),
  ]);
  if (setsRes.error) throw new Error(setsRes.error.message);
  if (metaRes.error) throw new Error(metaRes.error.message);

  const byEx = new Map();
  const ensure = (exId) => {
    if (!byEx.has(exId)) {
      const ex = exMap.get(exId);
      byEx.set(exId, {
        exercise_id: exId,
        name: ex?.name || '(deleted exercise)',
        category: ex?.category || 'other',
        sets: [],
        ready_to_progress: false,
        rpe: null,
        note: '',
      });
    }
    return byEx.get(exId);
  };
  for (const s of setsRes.data || []) ensure(s.exercise_id).sets.push({ set_number: s.set_number, weight: s.weight, reps: s.reps });
  for (const m of metaRes.data || []) {
    const e = ensure(m.exercise_id);
    e.ready_to_progress = !!m.ready_to_progress;
    e.rpe = m.rpe;
    e.note = m.note || '';
  }
  for (const e of byEx.values()) {
    const top = topSetOf(e.sets);
    e.topSet = top ? { weight: top.weight, reps: top.reps } : null;
    e.e1rm = top ? epley(top.weight, top.reps) : null;
    e.volume = volumeOf(e.sets);
  }
  return { ...w, entries: [...byEx.values()] };
}

// Replace a workout's sets + per-exercise meta from a session payload.
async function writeEntries(workoutId, entries = []) {
  const setRows = [];
  const metaRows = [];
  for (const e of entries) {
    if (!e || !e.exercise_id) continue;
    (e.sets || []).forEach((s, i) => {
      const weight = numOrNull(s.weight);
      const reps = intOrNull(s.reps);
      if (weight == null && reps == null) return; // skip blank rows
      setRows.push({
        workout_id: workoutId,
        exercise_id: e.exercise_id,
        set_number: intOrNull(s.set_number) ?? i + 1,
        weight,
        reps,
      });
    });
    const hasMeta = e.ready_to_progress || e.rpe != null || (e.note && String(e.note).trim());
    if (hasMeta) {
      metaRows.push({
        workout_id: workoutId,
        exercise_id: e.exercise_id,
        ready_to_progress: !!e.ready_to_progress,
        rpe: numOrNull(e.rpe),
        note: String(e.note || ''),
      });
    }
  }
  // Replace strategy: clear this workout's sets/meta, then insert the new set.
  const d1 = await supabase.from('sets').delete().eq('workout_id', workoutId);
  if (d1.error) throw new Error(d1.error.message);
  const d2 = await supabase.from('workout_exercises').delete().eq('workout_id', workoutId);
  if (d2.error) throw new Error(d2.error.message);
  if (setRows.length) {
    const r = await supabase.from('sets').insert(setRows);
    if (r.error) throw new Error(r.error.message);
  }
  if (metaRows.length) {
    const r = await supabase.from('workout_exercises').insert(metaRows);
    if (r.error) throw new Error(r.error.message);
  }
}

function sessionFields(body = {}) {
  const fields = {
    cardio_note: String(body.cardio_note || ''),
    notes: String(body.notes || ''),
  };
  fields.category = CATEGORY_KEYS.has(body.category) ? body.category : null;
  if (body.date) fields.date = String(body.date).slice(0, 10);
  return fields;
}

export async function createSession(userId, body = {}) {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: userId, ...sessionFields(body) })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  await writeEntries(data.id, body.entries);
  return getWorkout(userId, data.id);
}

export async function updateSession(userId, id, body = {}) {
  const { data: w, error } = await supabase
    .from('workouts')
    .update(sessionFields(body))
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!w) throw new Error('unknown workout');
  await writeEntries(id, body.entries);
  return getWorkout(userId, id);
}

export async function deleteWorkout(userId, id) {
  const { error } = await supabase.from('workouts').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message); // sets/meta cascade via FK
}

// History list: each session with a light summary (exercises, sets, volume).
// Workout feed, newest first — paginated at the DB so we only ever load the page
// we return (plus its sets), never the whole history. `total` is the all-time count
// so the client knows whether more remain. `since` returns workouts on/after that
// date (History's initial window); `offset`/`limit` page through older ones.
export async function listSessions(userId, { since, limit, offset = 0 } = {}) {
  // All-time count — cheap head request, transfers no rows.
  const { count, error: cErr } = await supabase
    .from('workouts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (cErr) throw new Error(cErr.message);
  const total = count || 0;

  // The page of workouts, filtered/sliced in the DB (uses idx_workouts_user_date).
  let q = supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (since) q = q.gte('date', since);
  if (limit != null) q = q.range(offset, offset + limit - 1); // inclusive range
  const { data: workouts, error } = await q;
  if (error) throw new Error(error.message);

  // Sets for just this page (uses idx_sets_workout). Exercise count, set count and
  // volume all derive from sets, so we don't load workout_exercises meta here.
  const ids = (workouts || []).map((w) => w.id);
  let sets = [];
  if (ids.length) {
    const { data, error: sErr } = await supabase
      .from('sets')
      .select('workout_id, exercise_id, weight, reps')
      .in('workout_id', ids);
    if (sErr) throw new Error(sErr.message);
    sets = data || [];
  }

  const byWorkout = new Map();
  for (const s of sets) {
    if (!byWorkout.has(s.workout_id)) byWorkout.set(s.workout_id, { exercises: new Set(), setCount: 0, volume: 0 });
    const agg = byWorkout.get(s.workout_id);
    agg.exercises.add(s.exercise_id);
    agg.setCount += 1;
    agg.volume += (s.weight || 0) * (s.reps || 0);
  }
  const rows = (workouts || []).map((w) => {
    const agg = byWorkout.get(w.id) || { exercises: new Set(), setCount: 0, volume: 0 };
    return {
      ...w,
      summary: { exerciseCount: agg.exercises.size, setCount: agg.setCount, volume: Math.round(agg.volume) },
    };
  });
  return { workouts: rows, total };
}

// Lightweight feed for the Progress calendar: only the date + category of every
// workout, no sets loaded. Uses idx_workouts_user_date.
export async function workoutDays(userId) {
  const { data, error } = await supabase
    .from('workouts')
    .select('date, category')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// --- templates (saved routines) ----------------------------------------------
// A template is a named, ordered list of library exercises — no numbers. Loading
// one only pre-populates the Log screen; nothing here writes to workouts/sets.

// Keep only ids that are in the user's library, de-duped, in the given order; and
// derive a single category when every exercise shares one (else null), mirroring
// how a logged session picks its category.
async function sanitizeTemplateExercises(userId, exerciseIds) {
  const exMap = await exercisesById(userId);
  const ids = [];
  const seen = new Set();
  for (const id of exerciseIds || []) {
    if (exMap.has(id) && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  const cats = [...new Set(ids.map((id) => exMap.get(id).category))];
  const category = cats.length === 1 && CATEGORY_KEYS.has(cats[0]) ? cats[0] : null;
  return { ids, category };
}

// Replace a template's exercise list (delete-then-insert, like writeEntries).
async function writeTemplateExercises(templateId, ids) {
  const d = await supabase.from('template_exercises').delete().eq('template_id', templateId);
  if (d.error) throw new Error(d.error.message);
  if (ids.length) {
    const rows = ids.map((exercise_id, i) => ({ template_id: templateId, exercise_id, position: i }));
    const r = await supabase.from('template_exercises').insert(rows);
    if (r.error) throw new Error(r.error.message);
  }
}

export async function getTemplate(userId, id) {
  const { data: t, error } = await supabase
    .from('templates').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return null;
  const { data: rows, error: rErr } = await supabase
    .from('template_exercises').select('exercise_id, position').eq('template_id', id)
    .order('position', { ascending: true });
  if (rErr) throw new Error(rErr.message);
  const exMap = await exercisesById(userId);
  const exercises = (rows || [])
    .map((r) => { const ex = exMap.get(r.exercise_id); return ex ? { exercise_id: r.exercise_id, name: ex.name, category: ex.category } : null; })
    .filter(Boolean);
  return { id: t.id, name: t.name, category: t.category, exercises };
}

export async function listTemplates(userId) {
  const { data: tpls, error } = await supabase
    .from('templates').select('*').eq('user_id', userId)
    .order('position', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (!tpls?.length) return [];

  const ids = tpls.map((t) => t.id);
  const { data: rows, error: rErr } = await supabase
    .from('template_exercises').select('template_id, exercise_id, position')
    .in('template_id', ids).order('position', { ascending: true });
  if (rErr) throw new Error(rErr.message);

  const exMap = await exercisesById(userId);
  const byTpl = new Map(ids.map((id) => [id, []]));
  for (const r of rows || []) {
    const ex = exMap.get(r.exercise_id);
    if (ex) byTpl.get(r.template_id).push({ exercise_id: r.exercise_id, name: ex.name, category: ex.category });
  }
  return tpls.map((t) => ({ id: t.id, name: t.name, category: t.category, exercises: byTpl.get(t.id) || [] }));
}

export async function createTemplate(userId, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('template name required');
  const { ids, category } = await sanitizeTemplateExercises(userId, body.exercise_ids);
  if (!ids.length) throw new Error('add at least one exercise');

  const { count } = await supabase
    .from('templates').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  const { data, error } = await supabase
    .from('templates').insert({ user_id: userId, name, category, position: count || 0 })
    .select('id').single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error(`you already have a template named "${name}"`);
    throw new Error(error.message);
  }
  await writeTemplateExercises(data.id, ids);
  return getTemplate(userId, data.id);
}

export async function updateTemplate(userId, id, body = {}) {
  const { data: t, error: e0 } = await supabase
    .from('templates').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (e0) throw new Error(e0.message);
  if (!t) throw new Error('unknown template');

  const patch = {};
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) throw new Error('template name required');
    patch.name = name;
  }
  if (body.position != null) patch.position = intOrNull(body.position) ?? 0;

  let ids = null;
  if (body.exercise_ids != null) {
    const s = await sanitizeTemplateExercises(userId, body.exercise_ids);
    if (!s.ids.length) throw new Error('add at least one exercise');
    ids = s.ids;
    patch.category = s.category;
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('templates').update(patch).eq('id', id).eq('user_id', userId);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new Error(`you already have a template named "${patch.name}"`);
      throw new Error(error.message);
    }
  }
  if (ids) await writeTemplateExercises(id, ids);
  return getTemplate(userId, id);
}

export async function deleteTemplate(userId, id) {
  const { error } = await supabase.from('templates').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message); // template_exercises cascade via FK
}

// Snapshot a logged session's exercises into a new template.
export async function createTemplateFromWorkout(userId, workoutId, body = {}) {
  const w = await getWorkout(userId, workoutId);
  if (!w) throw new Error('unknown workout');
  const ids = (w.entries || []).map((e) => e.exercise_id);
  const name = String(body.name || '').trim() || `Routine from ${w.date}`;
  return createTemplate(userId, { name, exercise_ids: ids });
}

// --- progress / charts -------------------------------------------------------

const RANGES = { '1m': 30, '3m': 90, '6m': 182, '1y': 365, all: null };

export async function progress(userId, exerciseId, range = 'all') {
  const exMap = await exercisesById(userId);
  const ex = exMap.get(exerciseId);
  if (!ex) throw new Error('unknown exercise');
  const { sets, meta } = await loadHistory(userId);
  const sessions = sessionsForExercise(sets, meta, exerciseId).slice().reverse(); // oldest -> newest

  const days = RANGES[range] ?? null;
  let cutoff = null;
  if (days != null) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    cutoff = d.toISOString().slice(0, 10);
  }
  const inRange = cutoff ? sessions.filter((s) => s.date >= cutoff) : sessions;

  const series = inRange.map((s) => ({
    date: s.date,
    weight: s.topSet ? s.topSet.weight : null,
    reps: s.topSet ? s.topSet.reps : null,
    maxReps: s.sets?.length ? Math.max(0, ...s.sets.map((x) => x.reps || 0)) || null : null,
    e1rm: s.e1rm != null ? Math.round(s.e1rm * 10) / 10 : null,
    volume: Math.round(s.volume),
  }));

  // PRs computed over ALL sessions (not just the visible range).
  const prs = { maxWeight: null, bestE1rm: null, bestVolume: null, repsAtTopWeight: null, lastDate: sessions.at(-1)?.date || null };
  for (const s of sessions) {
    if (s.topSet?.weight != null && (prs.maxWeight == null || s.topSet.weight > prs.maxWeight)) {
      prs.maxWeight = s.topSet.weight;
      prs.repsAtTopWeight = s.topSet.reps;
    }
    if (s.e1rm != null && (prs.bestE1rm == null || s.e1rm > prs.bestE1rm)) prs.bestE1rm = Math.round(s.e1rm * 10) / 10;
    if (prs.bestVolume == null || s.volume > prs.bestVolume) prs.bestVolume = Math.round(s.volume);
  }

  return { exercise: { id: ex.id, name: ex.name, category: ex.category }, range, series, prs };
}

export async function exerciseHistory(userId, exerciseId) {
  const { sets, meta } = await loadHistory(userId);
  return { exerciseId, sessions: sessionsForExercise(sets, meta, exerciseId) };
}

// --- main-lifts histogram ----------------------------------------------------
// A fixed set of "big" lifts, matched against the user's library by name (so it
// works without any per-exercise flag). Each returns the best estimated 1RM seen.
const MAIN_LIFTS = [
  { key: 'bench', label: 'Bench', match: ['barbell bench', 'bench press'], exclude: [] },
  { key: 'db_press', label: 'DB Press', match: ['dumbbell bench', 'dumbbell press', 'db press', 'db bench', 'arnold'], exclude: [] },
  { key: 'squat', label: 'Squat', match: ['squat'], exclude: [] },
  { key: 'pullup', label: 'Pull-ups', match: ['pull-up', 'pull up', 'pullup', 'chin-up', 'chin up'], exclude: ['pulldown', 'pull-down', 'pull down', 'assisted'] },
  { key: 'pulldown', label: 'Pulldown', match: ['lat pulldown', 'lat pull', 'pulldown', 'pull-down', 'pull down'], exclude: ['tricep'] },
  { key: 'rdl', label: 'RDL', match: ['romanian', 'rdl'], exclude: [] },
];

export async function mainLifts(userId) {
  const exList = await listExercises(userId);
  const { sets } = await loadHistory(userId);

  // best e1RM + heaviest weight + best reps per exercise id
  const stat = new Map();
  for (const s of sets) {
    const cur = stat.get(s.exercise_id) || { e1rm: null, maxWeight: null, bestReps: null };
    const e = epley(s.weight, s.reps);
    if (e != null && (cur.e1rm == null || e > cur.e1rm)) cur.e1rm = e;
    if (s.weight != null && (cur.maxWeight == null || s.weight > cur.maxWeight)) cur.maxWeight = s.weight;
    if (s.reps != null && (cur.bestReps == null || s.reps > cur.bestReps)) cur.bestReps = s.reps;
    stat.set(s.exercise_id, cur);
  }

  const out = [];
  for (const lift of MAIN_LIFTS) {
    let best = null;
    for (const ex of exList) {
      const name = ex.name.toLowerCase();
      if (!lift.match.some((m) => name.includes(m))) continue;
      if (lift.exclude.some((x) => name.includes(x))) continue;
      const st = stat.get(ex.id);
      if (!st || (st.e1rm == null && st.bestReps == null)) continue;
      const score = st.e1rm ?? 0;
      if (!best || score > best.score) best = { name: ex.name, score, ...st };
    }
    if (best) {
      out.push({
        key: lift.key,
        label: lift.label,
        exercise: best.name,
        e1rm: best.e1rm != null ? Math.round(best.e1rm * 10) / 10 : null,
        maxWeight: best.maxWeight,
        bestReps: best.bestReps,
      });
    }
  }
  return out;
}

// --- overview stats ----------------------------------------------------------

// Sunday-based week key (we just use the Sunday date string).
function sundayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function stats(userId) {
  const { workouts, sets } = await loadHistory(userId);
  const totalWorkouts = workouts.length;

  // volume per workout
  const volByWorkout = new Map();
  for (const s of sets) volByWorkout.set(s.workout_id, (volByWorkout.get(s.workout_id) || 0) + (s.weight || 0) * (s.reps || 0));

  const thisSunday = sundayOf(new Date().toISOString().slice(0, 10));
  let thisWeekVolume = 0;
  let workoutsThisWeek = 0;
  const weeksWithWork = new Set();
  for (const w of workouts) {
    const wk = sundayOf(w.date);
    weeksWithWork.add(wk);
    if (wk === thisSunday) {
      workoutsThisWeek += 1;
      thisWeekVolume += volByWorkout.get(w.id) || 0;
    }
  }

  // Consecutive-week streak ending at the current (or most recent) week.
  let weekStreak = 0;
  if (weeksWithWork.size) {
    const cursor = new Date(thisSunday + 'T00:00:00');
    // if no work yet this week, start the count from last week instead of breaking
    if (!weeksWithWork.has(thisSunday)) cursor.setDate(cursor.getDate() - 7);
    while (weeksWithWork.has(cursor.toISOString().slice(0, 10))) {
      weekStreak += 1;
      cursor.setDate(cursor.getDate() - 7);
    }
  }

  const totalVolume = [...volByWorkout.values()].reduce((a, b) => a + b, 0);

  return {
    totalWorkouts,
    workoutsThisWeek,
    thisWeekVolume: Math.round(thisWeekVolume),
    weekStreak,
    totalVolume: Math.round(totalVolume),
    lastWorkout: workouts[0]?.date || null,
  };
}

// --- prefs -------------------------------------------------------------------

export async function getPrefs(userId) {
  const { data, error } = await supabase.from('prefs').select('units').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return { units: data?.units || 'lb' };
}

export async function setPrefs(userId, body = {}) {
  const units = body.units === 'kg' ? 'kg' : 'lb';
  const { error } = await supabase.from('prefs').upsert({ user_id: userId, units }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  return { units };
}

// --- CSV export --------------------------------------------------------------

export async function exportRows(userId) {
  const { sets, meta } = await loadHistory(userId);
  const exMap = await exercisesById(userId);
  const metaByKey = new Map(meta.map((m) => [`${m.workout_id}:${m.exercise_id}`, m]));
  return sets
    .map((s) => {
      const ex = exMap.get(s.exercise_id);
      const m = metaByKey.get(`${s.workout_id}:${s.exercise_id}`);
      return {
        date: s.workout?.date || '',
        category: s.workout?.category || '',
        exercise: ex?.name || '',
        set_number: s.set_number,
        weight: s.weight ?? '',
        reps: s.reps ?? '',
        e1rm: epley(s.weight, s.reps)?.toFixed(1) ?? '',
        ready_to_progress: m?.ready_to_progress ? 1 : 0,
        rpe: m?.rpe ?? '',
        note: m?.note || '',
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
