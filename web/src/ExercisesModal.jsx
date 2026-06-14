import { useEffect, useState } from 'react';
import { api } from './api.js';

const CATS = [
  { key: 'upper', label: 'Upper Body' },
  { key: 'lower', label: 'Lower Body' },
  { key: 'back', label: 'Back' },
  { key: 'other', label: 'Other' },
];
const blank = { name: '', category: 'upper', muscle_group: '', equipment: '', is_unilateral: false, default_sets: 3, default_reps: 10 };

function ExerciseForm({ initial, onSave, onCancel, saving }) {
  const [f, setF] = useState(initial);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  return (
    <div className="card" style={{ background: 'var(--bg-elev-2)' }}>
      <label className="field"><span>Name</span>
        <input type="text" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
      </label>
      <div className="row" style={{ gap: 10 }}>
        <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>Category</span>
          <select value={f.category} onChange={(e) => set({ category: e.target.value })}>
            {CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>Equipment</span>
          <input type="text" placeholder="barbell, dumbbell…" value={f.equipment} onChange={(e) => set({ equipment: e.target.value })} />
        </label>
      </div>
      <div className="row" style={{ gap: 10, marginTop: 10 }}>
        <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>Default sets</span>
          <input type="number" value={f.default_sets} onChange={(e) => set({ default_sets: e.target.value })} />
        </label>
        <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>Default reps</span>
          <input type="number" value={f.default_reps} onChange={(e) => set({ default_reps: e.target.value })} />
        </label>
      </div>
      <label className="toggle" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={f.is_unilateral} onChange={(e) => set({ is_unilateral: e.target.checked })} />
        Unilateral (one side at a time)
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn small" disabled={!f.name.trim() || saving} onClick={() => onSave(f)}>Save</button>
        <button className="btn ghost small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// The exercise library: add / edit / delete, grouped by category.
export default function ExercisesModal({ onClose }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // exercise id
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => api.exercises().then((r) => setList(r.exercises)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async (f) => {
    setSaving(true); setError('');
    try { await api.addExercise(f); setAdding(false); load(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const update = async (id, f) => {
    setSaving(true); setError('');
    try { await api.updateExercise(id, f); setEditing(null); load(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const remove = async (ex) => {
    if (!confirm(`Delete "${ex.name}"? Its logged sets will be removed too.`)) return;
    try { await api.deleteExercise(ex.id); load(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2 style={{ margin: 0 }}>Exercises</h2>
          <div className="row" style={{ gap: 6 }}>
            {!adding && <button className="btn small" onClick={() => setAdding(true)}>+ Add</button>}
            <button className="iconbtn" onClick={onClose}>×</button>
          </div>
        </div>

        {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}

        {adding && <div style={{ marginTop: 12 }}><ExerciseForm initial={blank} saving={saving} onSave={create} onCancel={() => setAdding(false)} /></div>}

        {!list ? (
          <div className="spinner">Loading…</div>
        ) : (
          CATS.map((c) => {
            const items = list.filter((e) => e.category === c.key);
            if (!items.length) return null;
            return (
              <div key={c.key}>
                <div className="section-title">{c.label}</div>
                {items.map((ex) =>
                  editing === ex.id ? (
                    <ExerciseForm key={ex.id} initial={ex} saving={saving} onSave={(f) => update(ex.id, f)} onCancel={() => setEditing(null)} />
                  ) : (
                    <div className="card" key={ex.id} style={{ padding: '10px 12px' }}>
                      <div className="between">
                        <div>
                          <b>{ex.name}</b>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {ex.default_sets}×{ex.default_reps}{ex.equipment ? ` · ${ex.equipment}` : ''}{ex.is_unilateral ? ' · unilateral' : ''}
                          </div>
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <button className="btn ghost small" onClick={() => setEditing(ex.id)}>Edit</button>
                          <button className="btn danger small" onClick={() => remove(ex)}>✕</button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
