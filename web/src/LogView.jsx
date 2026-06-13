import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

// Build draft entries for a set of exercises, preserving anything already typed.
function initDraft(exercises, prev = {}) {
  const entries = {};
  for (const ex of exercises) {
    if (prev[ex.id]) {
      entries[ex.id] = prev[ex.id];
    } else {
      const n = Math.max(1, ex.default_sets || 3);
      entries[ex.id] = {
        sets: Array.from({ length: n }, () => ({ weight: '', reps: '' })),
        ready_to_progress: false,
        rpe: '',
        note: '',
      };
    }
  }
  return entries;
}

export default function LogView({ units, onSaved }) {
  const [cats, setCats] = useState(null);
  const [category, setCategory] = useState(null);
  const [data, setData] = useState(null); // { exercises: [...] }
  const [draft, setDraft] = useState({}); // exId -> entry
  const [date, setDate] = useState(todayStr());
  const [cardio, setCardio] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories().then((r) => setCats(r.categories)).catch((e) => setError(e.message));
  }, []);

  const loadCategory = useCallback((cat) => {
    setError('');
    api
      .log(cat)
      .then((r) => {
        setData(r);
        setDraft((prev) => initDraft(r.exercises, prev));
      })
      .catch((e) => setError(e.message));
  }, []);

  const pick = (cat) => {
    setCategory(cat);
    setData(null);
    setDraft({});
    loadCategory(cat);
  };

  // --- draft mutations ---
  const patchEntry = (exId, patch) => setDraft((d) => ({ ...d, [exId]: { ...d[exId], ...patch } }));
  const patchSet = (exId, idx, field, val) =>
    setDraft((d) => {
      const sets = d[exId].sets.map((s, i) => (i === idx ? { ...s, [field]: val } : s));
      return { ...d, [exId]: { ...d[exId], sets } };
    });
  const addSet = (exId) =>
    setDraft((d) => ({ ...d, [exId]: { ...d[exId], sets: [...d[exId].sets, { weight: '', reps: '' }] } }));
  const removeSet = (exId, idx) =>
    setDraft((d) => ({ ...d, [exId]: { ...d[exId], sets: d[exId].sets.filter((_, i) => i !== idx) } }));
  const fillWeight = (exId, w) =>
    setDraft((d) => ({ ...d, [exId]: { ...d[exId], sets: d[exId].sets.map((s) => ({ ...s, weight: String(w) })) } }));

  const addExercise = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.addExercise({ name, category });
      setNewName('');
      setAdding(false);
      loadCategory(category);
    } catch (e) {
      setError(e.message);
    }
  };

  const buildEntries = () => {
    const out = [];
    for (const ex of data.exercises) {
      const e = draft[ex.id];
      if (!e) continue;
      const sets = e.sets
        .map((s, i) => ({ set_number: i + 1, weight: s.weight, reps: s.reps }))
        .filter((s) => String(s.weight).trim() !== '' || String(s.reps).trim() !== '');
      const hasMeta = e.ready_to_progress || String(e.rpe).trim() !== '' || e.note.trim() !== '';
      if (sets.length || hasMeta) {
        out.push({ exercise_id: ex.id, sets, ready_to_progress: e.ready_to_progress, rpe: e.rpe === '' ? null : e.rpe, note: e.note });
      }
    }
    return out;
  };

  const save = async () => {
    const entries = buildEntries();
    if (!entries.length) { setError('Log at least one set before saving.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.createWorkout({ category, date, cardio_note: cardio, notes, entries });
      onSaved?.();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  // --- category picker ---
  if (!category) {
    return (
      <div>
        <h1>What are you training today?</h1>
        {error && <div className="banner error">{error}</div>}
        {!cats ? (
          <div className="spinner">Loading…</div>
        ) : (
          <div className="cat-grid">
            {cats.map((c) => (
              <button key={c.key} className="cat-tile" onClick={() => pick(c.key)}>
                <span className="big">{c.label}</span>
                <span className="muted">{c.count} exercise{c.count === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const catLabel = cats?.find((c) => c.key === category)?.label || category;

  return (
    <div>
      <div className="between">
        <button className="linkish" onClick={() => setCategory(null)}>← Categories</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <h1 style={{ marginTop: 10 }}>{catLabel}</h1>

      {error && <div className="banner error">{error}</div>}

      {!data ? (
        <div className="spinner">Loading…</div>
      ) : (
        <>
          {data.exercises.map((ex) => {
            const e = draft[ex.id];
            if (!e) return null;
            const lt = ex.lastTime;
            const sug = ex.suggestion;
            return (
              <div className="card" key={ex.id}>
                <div className="between">
                  <h2 style={{ margin: 0 }}>{ex.name}</h2>
                  <span className="faint" style={{ fontSize: 12 }}>{ex.default_sets}×{ex.default_reps}</span>
                </div>

                <div className="lasttime" style={{ marginTop: 4 }}>
                  {lt && lt.topSet ? (
                    <>Last time: <b>{lt.topSet.weight ?? '—'}{lt.topSet.weight != null ? ` ${units}` : ''} × {lt.topSet.reps ?? '—'}</b>
                      {lt.e1rm != null && <span className="faint"> · e1RM {Math.round(lt.e1rm)}</span>}
                    </>
                  ) : (
                    <span className="faint">No history yet — first time logging this.</span>
                  )}
                </div>

                {sug && (
                  <div style={{ marginTop: 8 }}>
                    <button className="chip accent" onClick={() => fillWeight(ex.id, sug.weight)} title={sug.reason}>
                      ⬆ Try {sug.weight} {units} — {sug.reason}
                    </button>
                  </div>
                )}

                {e.sets.map((s, i) => (
                  <div className="set-row" key={i}>
                    <span className="setno">{i + 1}</span>
                    <input
                      type="number" inputMode="decimal" placeholder={lt?.topSet?.weight != null ? `${lt.topSet.weight} ${units}` : units}
                      value={s.weight} onChange={(ev) => patchSet(ex.id, i, 'weight', ev.target.value)}
                    />
                    <input
                      type="number" inputMode="numeric" placeholder={lt?.topSet?.reps != null ? `${lt.topSet.reps} reps` : `${ex.default_reps} reps`}
                      value={s.reps} onChange={(ev) => patchSet(ex.id, i, 'reps', ev.target.value)}
                    />
                    <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => removeSet(ex.id, i)} title="Remove set" disabled={e.sets.length <= 1}>×</button>
                  </div>
                ))}
                <button className="linkish" style={{ marginTop: 8 }} onClick={() => addSet(ex.id)}>+ set</button>

                <div className="meta-row">
                  <label className="toggle">
                    <input type="checkbox" checked={e.ready_to_progress} onChange={(ev) => patchEntry(ex.id, { ready_to_progress: ev.target.checked })} />
                    Ready for more weight?
                  </label>
                  <label className="toggle">
                    RPE
                    <input className="rpe-input" type="number" min="1" max="10" step="0.5" value={e.rpe} onChange={(ev) => patchEntry(ex.id, { rpe: ev.target.value })} />
                  </label>
                </div>
                <input style={{ marginTop: 10 }} type="text" placeholder="Note (optional)" value={e.note} onChange={(ev) => patchEntry(ex.id, { note: ev.target.value })} />
              </div>
            );
          })}

          {/* add exercise */}
          {adding ? (
            <div className="card">
              <label className="field">
                <span>New exercise name ({catLabel})</span>
                <input autoFocus type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExercise()} />
              </label>
              <div className="row">
                <button className="btn small" onClick={addExercise} disabled={!newName.trim()}>Add</button>
                <button className="btn ghost small" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>+ Add exercise</button>
          )}

          {/* session extras */}
          <div className="section-title">Session</div>
          <div className="card">
            <input type="text" placeholder="Cardio / steps (optional)" value={cardio} onChange={(e) => setCardio(e.target.value)} />
            <input style={{ marginTop: 10 }} type="text" placeholder="Session notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button className="btn block" style={{ marginTop: 16 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save workout'}
          </button>
        </>
      )}
    </div>
  );
}
