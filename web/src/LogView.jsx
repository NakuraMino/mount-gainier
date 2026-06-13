import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { CAT_META, catColor } from './categories.js';

const CAT_ORDER = ['upper', 'lower', 'back', 'other'];

const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const newEntry = (ex) => {
  const n = Math.max(1, ex?.default_sets || 3);
  return {
    sets: Array.from({ length: n }, () => ({ weight: '', reps: '' })),
    ready_to_progress: false,
    rpe: '',
    note: '',
  };
};

export default function LogView({ units, onSaved }) {
  const [lib, setLib] = useState(null); // all exercises w/ lastTime + suggestion
  const [picked, setPicked] = useState([]); // [exId] in the order added
  const [draft, setDraft] = useState({}); // exId -> entry
  const [date, setDate] = useState(todayStr());
  const [cardio, setCardio] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState('upper');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLib = useCallback(
    () => api.log('').then((r) => setLib(r.exercises)).catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => { loadLib(); }, [loadLib]);

  const exById = (id) => (lib || []).find((e) => e.id === id);

  // --- session membership ---
  const addToSession = (ex) => {
    setPicked((p) => (p.includes(ex.id) ? p : [...p, ex.id]));
    setDraft((d) => (d[ex.id] ? d : { ...d, [ex.id]: newEntry(ex) }));
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

  const createExercise = async () => {
    const name = newName.trim();
    if (!name) return;
    setError('');
    try {
      const r = await api.addExercise({ name, category: newCat });
      const ex = r.exercise;
      setNewName('');
      setCreating(false);
      await loadLib();
      if (ex) addToSession(ex); // newEntry uses the returned exercise, so no stale-lib race
    } catch (e) {
      setError(e.message);
    }
  };

  const buildEntries = () => {
    const out = [];
    for (const exId of picked) {
      const e = draft[exId];
      if (!e) continue;
      const sets = e.sets
        .map((s, i) => ({ set_number: i + 1, weight: s.weight, reps: s.reps }))
        .filter((s) => String(s.weight).trim() !== '' || String(s.reps).trim() !== '');
      const hasMeta = e.ready_to_progress || String(e.rpe).trim() !== '' || e.note.trim() !== '';
      if (sets.length || hasMeta) {
        out.push({ exercise_id: exId, sets, ready_to_progress: e.ready_to_progress, rpe: e.rpe === '' ? null : e.rpe, note: e.note });
      }
    }
    return out;
  };

  const save = async () => {
    const entries = buildEntries();
    if (!entries.length) { setError('Log at least one set before saving.'); return; }
    // derive the workout's category: a single group -> that group, mixed -> freeform
    const groups = [...new Set(picked.map((id) => exById(id)?.category).filter(Boolean))];
    const category = groups.length === 1 ? groups[0] : null;
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

  return (
    <div>
      <div className="between">
        <h1 style={{ marginBottom: 0 }}>Log a workout</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
      </div>

      {/* grouped exercise picker */}
      <div style={{ marginTop: 16 }}>
        <select
          className="cat-select"
          value=""
          disabled={!lib}
          onChange={(e) => onSelectAdd(e.target.value)}
          style={{ width: '100%' }}
        >
          <option value="">{lib ? '+ Add exercise…' : 'Loading…'}</option>
          {CAT_ORDER.map((catKey) => {
            const items = (lib || []).filter((e) => e.category === catKey && !picked.includes(e.id));
            if (!items.length) return null;
            return (
              <optgroup key={catKey} label={CAT_META[catKey]?.label || catKey}>
                {items.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
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
          <div className="row">
            <button className="btn small" onClick={createExercise} disabled={!newName.trim()}>Create & add</button>
            <button className="btn ghost small" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* picked exercise cards */}
      {picked.length === 0 && !creating && (
        <div className="empty">Add exercises from the dropdown to build your workout.</div>
      )}

      {picked.map((exId) => {
        const ex = exById(exId);
        const e = draft[exId];
        if (!ex || !e) return null;
        const lt = ex.lastTime;
        const sug = ex.suggestion;
        return (
          <div className="card" key={exId}>
            <div className="between">
              <div className="act-head">
                <span className="cat-dot" style={{ background: catColor(ex.category) }} />
                <h2 style={{ margin: 0 }}>{ex.name}</h2>
              </div>
              <button className="iconbtn" style={{ width: 32, height: 32 }} title="Remove from workout" onClick={() => removeFromSession(exId)}>×</button>
            </div>

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
            <button className="linkish" style={{ marginTop: 10 }} onClick={() => addSet(exId)}>+ set</button>

            <div className="meta-row">
              <label className="toggle">
                <input type="checkbox" checked={e.ready_to_progress} onChange={(ev) => patchEntry(exId, { ready_to_progress: ev.target.checked })} />
                Ready for more weight?
              </label>
              <label className="toggle">
                RPE
                <input className="rpe-input" type="number" min="1" max="10" step="0.5" value={e.rpe} onChange={(ev) => patchEntry(exId, { rpe: ev.target.value })} />
              </label>
            </div>
            <input style={{ marginTop: 10 }} type="text" placeholder="Note (optional)" value={e.note} onChange={(ev) => patchEntry(exId, { note: ev.target.value })} />
          </div>
        );
      })}

      {/* session extras + save (only once you've added something) */}
      {picked.length > 0 && (
        <>
          <div className="section-title">Session</div>
          <div className="card">
            <input type="text" placeholder="Cardio / steps (optional)" value={cardio} onChange={(e) => setCardio(e.target.value)} />
            <input style={{ marginTop: 10 }} type="text" placeholder="Session notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button className="btn block" style={{ marginTop: 16 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : `Save workout (${picked.length})`}
          </button>
        </>
      )}
    </div>
  );
}
