import { useEffect, useState } from 'react';
import { api } from './api.js';
import { CAT_META, catColor } from './categories.js';

const CAT_ORDER = ['upper', 'lower', 'back', 'other'];

// Build / rename a routine: a name + an ordered pick from the exercise library.
// Tapping an exercise toggles it; the order you tap them is the order they'll be
// added to a logged session.
function TemplateForm({ initial, lib, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial.name || '');
  const [picked, setPicked] = useState(initial.exerciseIds || []);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="card" style={{ background: 'var(--bg-elev-2)' }}>
      <label className="field"><span>Routine name</span>
        <input type="text" value={name} autoFocus placeholder="Push day, Leg day…" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="faint" style={{ fontSize: 12, margin: '2px 0 4px' }}>
        {picked.length} exercise{picked.length === 1 ? '' : 's'} · tap to add, numbered in order
      </div>
      {CAT_ORDER.map((cat) => {
        const items = lib.filter((e) => e.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div className="section-title" style={{ marginTop: 10 }}>{CAT_META[cat]?.label || cat}</div>
            {items.map((ex) => {
              const idx = picked.indexOf(ex.id);
              const on = idx >= 0;
              return (
                <button key={ex.id} type="button" className={`tpl-pick${on ? ' on' : ''}`} onClick={() => toggle(ex.id)}>
                  <span className="tpl-pick-box">{on ? idx + 1 : ''}</span>
                  <span className="cat-dot" style={{ background: catColor(ex.category) }} />
                  <span className="tpl-pick-name">{ex.name}</span>
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn small" disabled={!name.trim() || !picked.length || saving} onClick={() => onSave({ name: name.trim(), exercise_ids: picked })}>
          Save routine
        </button>
        <button className="btn ghost small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Manage saved routines: create / rename / re-pick / delete.
export default function TemplatesModal({ onClose }) {
  const [list, setList] = useState(null);
  const [lib, setLib] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // template id
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.templates().then((r) => setList(r.templates)).catch((e) => setError(e.message));
    api.exercises().then((r) => setLib(r.exercises)).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const create = async (f) => {
    setSaving(true); setError('');
    try { await api.createTemplate(f); setAdding(false); load(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const update = async (id, f) => {
    setSaving(true); setError('');
    try { await api.updateTemplate(id, f); setEditing(null); load(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  const remove = async (t) => {
    if (!confirm(`Delete the "${t.name}" routine? (Your logged workouts are untouched.)`)) return;
    try { await api.deleteTemplate(t.id); load(); } catch (e) { setError(e.message); }
  };

  const formInitial = (t) => ({ name: t.name, exerciseIds: t.exercises.map((e) => e.exercise_id) });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2 style={{ margin: 0 }}>Routines</h2>
          <div className="row" style={{ gap: 6 }}>
            {!adding && lib && <button className="btn small" onClick={() => setAdding(true)}>+ New</button>}
            <button className="iconbtn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
          A routine is a saved list of exercises. Pick one from the Log tab to skip rebuilding a workout each time.
        </div>

        {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}

        {adding && lib && (
          <div style={{ marginTop: 12 }}>
            <TemplateForm initial={{ name: '', exerciseIds: [] }} lib={lib} saving={saving} onSave={create} onCancel={() => setAdding(false)} />
          </div>
        )}

        {!list || !lib ? (
          <div className="spinner">Loading…</div>
        ) : list.length === 0 && !adding ? (
          <div className="empty" style={{ marginTop: 16 }}>No routines yet. Tap “+ New” to save one.</div>
        ) : (
          list.map((t) =>
            editing === t.id ? (
              <div key={t.id} style={{ marginTop: 12 }}>
                <TemplateForm initial={formInitial(t)} lib={lib} saving={saving} onSave={(f) => update(t.id, f)} onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <div className="card" key={t.id} style={{ padding: '10px 12px', marginTop: 12 }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <b>{t.name}</b>
                    <div className="faint" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.exercises.length ? t.exercises.map((e) => e.name).join(' · ') : 'no exercises (all deleted)'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost small" onClick={() => setEditing(t.id)}>Edit</button>
                    <button className="btn danger small" onClick={() => remove(t)}>✕</button>
                  </div>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
