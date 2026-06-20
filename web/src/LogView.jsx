import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { CAT_META, catColor } from './categories.js';

const CAT_ORDER = ['upper', 'lower', 'back', 'other'];

const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const EMPTY_SET = () => ({ weight: '', reps: '' });
const isEmptySet = (s) => String(s.weight).trim() === '' && String(s.reps).trim() === '';
// Start with a single set; a fresh empty row is appended automatically as soon as
// the last one is filled (see patchSet), so there's always exactly one trailing blank.
const newEntry = () => ({ sets: [EMPTY_SET()], ready_to_progress: false, rpe: '', note: '' });

const entryHasContent = (e) =>
  e.sets.some((s) => !isEmptySet(s)) || e.ready_to_progress || String(e.rpe).trim() !== '' || e.note.trim() !== '';

// Bodyweight exercises (e.g. pull-ups) are logged as a single reps count, no weight.
const isRepsOnly = (ex) => (ex?.equipment || '').toLowerCase() === 'bodyweight';
const maxReps = (sets) => sets.reduce((m, s) => Math.max(m, Number(s.reps) || 0), 0);

// In-progress workouts are mirrored on-device so leaving the Log tab never loses
// work — and never writes to History. Only "Finish workout" hits the server.
const DRAFT_KEY = 'gymtracker.logdraft';
const loadDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
};
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

// Convert a saved workout's entry (server shape) into an editable draft entry.
const entryToDraft = (en) => {
  let sets = (en.sets || []).map((s) => ({
    weight: s.weight == null ? '' : String(s.weight),
    reps: s.reps == null ? '' : String(s.reps),
  }));
  if (!sets.length || !isEmptySet(sets[sets.length - 1])) sets = [...sets, EMPTY_SET()];
  return { sets, ready_to_progress: !!en.ready_to_progress, rpe: en.rpe == null ? '' : String(en.rpe), note: en.note || '' };
};

export default function LogView({ units, editId, onSaved, onCancelEdit }) {
  const editing = !!editId;
  const [restored] = useState(() => (editing ? null : loadDraft())); // one-time read of the saved draft
  const [lib, setLib] = useState(null); // all exercises w/ lastTime + suggestion
  const [picked, setPicked] = useState(restored?.picked || []); // [exId] in the order added
  const [draft, setDraft] = useState(restored?.draft || {}); // exId -> entry
  const [collapsed, setCollapsed] = useState(restored?.collapsed || {}); // exId -> bool
  const [date, setDate] = useState(restored?.date || todayStr());
  const [cardio, setCardio] = useState(restored?.cardio || '');
  const [notes, setNotes] = useState(restored?.notes || '');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState('upper');
  const [newBodyweight, setNewBodyweight] = useState(false);
  const [workoutId, setWorkoutId] = useState(editing ? editId : null); // create on finish; update when editing
  const [loadingEdit, setLoadingEdit] = useState(editing);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  const loadLib = useCallback(
    () => api.log('').then((r) => setLib(r.exercises)).catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => { loadLib(); }, [loadLib]);

  // Edit mode: pull the saved workout and hydrate the form from it.
  useEffect(() => {
    if (!editing) return;
    let alive = true;
    api.workout(editId)
      .then((r) => {
        if (!alive || !r?.workout) return;
        const w = r.workout;
        const nextPicked = [];
        const nextDraft = {};
        const nextCollapsed = {};
        for (const en of w.entries || []) {
          nextPicked.push(en.exercise_id);
          nextDraft[en.exercise_id] = entryToDraft(en);
          nextCollapsed[en.exercise_id] = true; // collapsed overview; tap to expand & fix
        }
        setPicked(nextPicked);
        setDraft(nextDraft);
        setCollapsed(nextCollapsed);
        setDate(w.date || todayStr());
        setCardio(w.cardio_note || '');
        setNotes(w.notes || '');
      })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoadingEdit(false); });
    return () => { alive = false; };
  }, [editing, editId]);

  // New workout: mirror the in-progress draft to localStorage so leaving the tab
  // (or closing the app) never loses it — and never writes it to History.
  useEffect(() => {
    if (editing) return;
    if (!picked.length) { clearDraft(); return; }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ picked, draft, collapsed, date, cardio, notes })); } catch {}
  }, [editing, picked, draft, collapsed, date, cardio, notes]);

  const exById = (id) => (lib || []).find((e) => e.id === id);

  // --- session membership ---
  const addToSession = (ex) => {
    setPicked((p) => (p.includes(ex.id) ? p : [...p, ex.id]));
    setDraft((d) => (d[ex.id] ? d : { ...d, [ex.id]: newEntry() }));
    setCollapsed((c) => ({ ...c, [ex.id]: false }));
  };
  const removeFromSession = (exId) => {
    setPicked((p) => p.filter((x) => x !== exId));
    setDraft((d) => { const n = { ...d }; delete n[exId]; return n; });
  };
  const onSelectAdd = (val) => {
    if (!val) return;
    if (val === '__new__') { setCreating(true); return; }
    const ex = exById(val);
    if (ex) addToSession(ex);
  };
  const toggleCollapse = (exId) => setCollapsed((c) => ({ ...c, [exId]: !c[exId] }));

  // --- draft mutations ---
  const patchEntry = (exId, patch) => setDraft((d) => ({ ...d, [exId]: { ...d[exId], ...patch } }));
  const patchSet = (exId, idx, field, val) =>
    setDraft((d) => {
      let sets = d[exId].sets.map((s, i) => (i === idx ? { ...s, [field]: val } : s));
      // keep exactly one trailing empty row: add one as soon as the last is filled
      if (!isEmptySet(sets[sets.length - 1])) sets = [...sets, EMPTY_SET()];
      return { ...d, [exId]: { ...d[exId], sets } };
    });
  const removeSet = (exId, idx) =>
    setDraft((d) => {
      let sets = d[exId].sets.filter((_, i) => i !== idx);
      if (!sets.length || !isEmptySet(sets[sets.length - 1])) sets = [...sets, EMPTY_SET()];
      return { ...d, [exId]: { ...d[exId], sets } };
    });
  const fillWeight = (exId, w) =>
    setDraft((d) => {
      const sets = d[exId].sets.map((s) => (isEmptySet(s) ? s : s)); // leave filled as-is
      const next = sets.map((s) => ({ ...s, weight: String(w) }));
      if (!isEmptySet(next[next.length - 1])) next.push(EMPTY_SET());
      return { ...d, [exId]: { ...d[exId], sets: next } };
    });

  const createExercise = async () => {
    const name = newName.trim();
    if (!name) return;
    setError('');
    try {
      const r = await api.addExercise({ name, category: newCat, equipment: newBodyweight ? 'bodyweight' : '' });
      const ex = r.exercise;
      setNewName('');
      setNewBodyweight(false);
      setCreating(false);
      await loadLib();
      if (ex) addToSession(ex);
    } catch (e) {
      setError(e.message);
    }
  };

  // Build entries for every picked exercise that has content (the API replaces a
  // workout's sets wholesale, so we always send the full current session).
  const buildEntries = () => {
    const out = [];
    for (const exId of picked) {
      const e = draft[exId];
      if (!e || !entryHasContent(e)) continue;
      const ex = exById(exId);
      // The reps shown as the input placeholder: last time's reps, else the default.
      const previewReps = ex?.lastTime?.topSet?.reps ?? ex?.default_reps ?? null;
      const sets = [];
      e.sets.forEach((s) => {
        const weightFilled = String(s.weight).trim() !== '';
        const repsFilled = String(s.reps).trim() !== '';
        if (!weightFilled && !repsFilled) return; // skip blank rows
        // A set with a weight but no reps falls back to the previewed rep count.
        const reps = repsFilled ? s.reps : weightFilled && previewReps != null ? previewReps : s.reps;
        sets.push({ set_number: sets.length + 1, weight: s.weight, reps });
      });
      out.push({ exercise_id: exId, sets, ready_to_progress: e.ready_to_progress, rpe: e.rpe === '' ? null : e.rpe, note: e.note });
    }
    return out;
  };

  // Persist the whole session (create on first save, update thereafter).
  const persist = async () => {
    const entries = buildEntries();
    if (!entries.length) throw new Error('Log at least one set first.');
    const groups = [...new Set(picked.map((id) => exById(id)?.category).filter(Boolean))];
    const category = groups.length === 1 ? groups[0] : null;
    const payload = { category, date, cardio_note: cardio, notes, entries };
    if (!workoutId) {
      const r = await api.createWorkout(payload);
      setWorkoutId(r.workout.id);
    } else {
      await api.updateWorkout(workoutId, payload);
    }
  };

  // Marks an exercise done and folds it up. Purely local — nothing is written to
  // the server until "Finish workout".
  const collapseExercise = (exId) => setCollapsed((c) => ({ ...c, [exId]: true }));

  const finish = async () => {
    setFinishing(true);
    setError('');
    try {
      await persist();
      if (!editing) clearDraft();
      onSaved?.();
    } catch (e) {
      setError(e.message);
      setFinishing(false);
    }
  };

  // Throw away the in-progress workout (new) or back out of an edit (existing).
  const discard = () => {
    if (editing) { onCancelEdit?.(); return; }
    if (picked.length && !confirm('Discard this in-progress workout?')) return;
    clearDraft();
    setPicked([]); setDraft({}); setCollapsed({});
    setDate(todayStr()); setCardio(''); setNotes(''); setError('');
  };

  const setSummary = (e) => {
    const filled = e.sets.filter((s) => !isEmptySet(s));
    if (!filled.length) return 'no sets yet';
    return filled
      .map((s) => (String(s.weight).trim() === '' ? `${s.reps || '—'} reps` : `${s.weight} ${units}×${s.reps || '—'}`))
      .join('   ·   ');
  };

  if (editing && loadingEdit) return <div className="spinner">Loading…</div>;

  return (
    <div>
      <div className="between">
        <h1 style={{ marginBottom: 0 }}>{editing ? 'Edit workout' : 'Log a workout'}</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
      </div>

      {editing && (
        <div className="banner ok" style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>Editing a saved workout</span>
          <button className="btn ghost small" onClick={() => onCancelEdit?.()}>Cancel</button>
        </div>
      )}

      {/* grouped exercise picker */}
      <div style={{ marginTop: 16 }}>
        <select className="cat-select" value="" disabled={!lib} onChange={(e) => onSelectAdd(e.target.value)} style={{ width: '100%' }}>
          <option value="">{lib ? '+ Add exercise…' : 'Loading…'}</option>
          {CAT_ORDER.map((catKey) => {
            const items = (lib || []).filter((e) => e.category === catKey && !picked.includes(e.id));
            if (!items.length) return null;
            return (
              <optgroup key={catKey} label={CAT_META[catKey]?.label || catKey}>
                {items.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
              </optgroup>
            );
          })}
          <option value="__new__">➕ Create new exercise…</option>
        </select>
      </div>

      {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}

      {/* create-new form */}
      {creating && (
        <div className="card" style={{ marginTop: 12 }}>
          <label className="field">
            <span>New exercise name</span>
            <input autoFocus type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createExercise()} />
          </label>
          <label className="field" style={{ marginBottom: 12 }}>
            <span>Muscle group</span>
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              {CAT_ORDER.map((k) => <option key={k} value={k}>{CAT_META[k]?.label || k}</option>)}
            </select>
          </label>
          <label className="toggle" style={{ marginBottom: 12, display: 'flex' }}>
            <input type="checkbox" checked={newBodyweight} onChange={(e) => setNewBodyweight(e.target.checked)} />
            Bodyweight only — log reps, no weight
          </label>
          <div className="row">
            <button className="btn small" onClick={createExercise} disabled={!newName.trim()}>Create & add</button>
            <button className="btn ghost small" onClick={() => { setCreating(false); setNewName(''); setNewBodyweight(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {picked.length === 0 && !creating && (
        <div className="empty">Add exercises from the dropdown to build your workout.</div>
      )}

      {/* picked exercise cards */}
      {picked.map((exId) => {
        const ex = exById(exId);
        const e = draft[exId];
        if (!ex || !e) return null;
        const isCollapsed = !!collapsed[exId];
        const lt = ex.lastTime;
        const sug = ex.suggestion;
        const done = entryHasContent(e);
        const repsOnly = isRepsOnly(ex);
        return (
          <div className="card" key={exId}>
            <div className="between">
              <button className="ex-head" onClick={() => toggleCollapse(exId)}>
                <span className="cat-dot" style={{ background: catColor(ex.category) }} />
                <span className="ex-name">{ex.name}</span>
                {isCollapsed && done && <span className="ex-done">✓</span>}
              </button>
              <div className="row" style={{ gap: 6 }}>
                <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => toggleCollapse(exId)} title={isCollapsed ? 'Expand' : 'Minimize'}>
                  {isCollapsed ? '▾' : '▴'}
                </button>
                <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => removeFromSession(exId)} title="Remove from workout">×</button>
              </div>
            </div>

            {isCollapsed ? (
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{setSummary(e)}</div>
            ) : (
              <>
                {repsOnly ? (
                  <>
                    <div className="lasttime" style={{ marginTop: 6 }}>
                      {lt && lt.sets?.length ? (
                        <>Last time: <b>{maxReps(lt.sets)} reps</b>{lt.sets.length > 1 ? <span className="faint"> · {lt.sets.length} sets</span> : null}</>
                      ) : (
                        <span className="faint">No history yet — first time logging this.</span>
                      )}
                    </div>
                    {e.sets.map((s, i) => (
                      <div className="set-row" key={i} style={{ gridTemplateColumns: '26px 1fr 34px' }}>
                        <span className="setno">{i + 1}</span>
                        <input
                          type="number" inputMode="numeric"
                          placeholder={lt && lt.sets?.length ? `${maxReps(lt.sets)} reps` : `${ex.default_reps} reps`}
                          value={s.reps} onChange={(ev) => patchSet(exId, i, 'reps', ev.target.value)}
                        />
                        <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={() => removeSet(exId, i)} title="Remove set" disabled={e.sets.length <= 1}>×</button>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="lasttime" style={{ marginTop: 6 }}>
                      {lt && lt.topSet ? (
                        <>Last time: <b>{lt.topSet.weight ?? '—'}{lt.topSet.weight != null ? ` ${units}` : ''} × {lt.topSet.reps ?? '—'}</b>
                          {lt.e1rm != null && <span className="faint"> · e1RM {Math.round(lt.e1rm)}</span>}
                        </>
                      ) : (
                        <span className="faint">No history yet — first time logging this.</span>
                      )}
                    </div>

                    {sug && (
                      <div style={{ marginTop: 9 }}>
                        <button className="chip accent" onClick={() => fillWeight(exId, sug.weight)} title={sug.reason}>
                          ⬆ Try {sug.weight} {units} — {sug.reason}
                        </button>
                      </div>
                    )}

                    {e.sets.map((s, i) => (
                      <div className="set-row" key={i}>
                        <span className="setno">{i + 1}</span>
                        <input
                          type="number" inputMode="decimal" placeholder={lt?.topSet?.weight != null ? `${lt.topSet.weight} ${units}` : units}
                          value={s.weight} onChange={(ev) => patchSet(exId, i, 'weight', ev.target.value)}
                        />
                        <input
                          type="number" inputMode="numeric" placeholder={lt?.topSet?.reps != null ? `${lt.topSet.reps} reps` : `${ex.default_reps} reps`}
                          value={s.reps} onChange={(ev) => patchSet(exId, i, 'reps', ev.target.value)}
                        />
                        <button className="iconbtn" style={{ width: 34, height: 34 }} onClick={() => removeSet(exId, i)} title="Remove set" disabled={e.sets.length <= 1}>×</button>
                      </div>
                    ))}
                  </>
                )}

                <div className="meta-row">
                  {!repsOnly && (
                    <label className="toggle">
                      <input type="checkbox" checked={e.ready_to_progress} onChange={(ev) => patchEntry(exId, { ready_to_progress: ev.target.checked })} />
                      Ready for more weight?
                    </label>
                  )}
                  <label className="toggle">
                    Perceived effort (1–10)
                    <input className="rpe-input" type="number" min="1" max="10" step="0.5" value={e.rpe} onChange={(ev) => patchEntry(exId, { rpe: ev.target.value })} />
                  </label>
                </div>
                <input style={{ marginTop: 10 }} type="text" placeholder="Note (optional)" value={e.note} onChange={(ev) => patchEntry(exId, { note: ev.target.value })} />

                <button className="btn small block" style={{ marginTop: 14 }} onClick={() => collapseExercise(exId)}>
                  Done
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* session extras + finish */}
      {picked.length > 0 && (
        <>
          <div className="section-title">Session</div>
          <div className="card">
            <input type="text" placeholder="Cardio / steps (optional)" value={cardio} onChange={(e) => setCardio(e.target.value)} />
            <input style={{ marginTop: 10 }} type="text" placeholder="Session notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button className="btn block" style={{ marginTop: 16 }} onClick={finish} disabled={finishing}>
            {finishing ? 'Saving…' : editing ? 'Save changes' : 'Finish workout'}
          </button>
          <button className="btn ghost block" style={{ marginTop: 10 }} onClick={discard} disabled={finishing}>
            {editing ? 'Cancel' : 'Discard workout'}
          </button>
        </>
      )}
    </div>
  );
}
