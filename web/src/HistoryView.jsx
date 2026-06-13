import { useEffect, useState } from 'react';
import { api } from './api.js';
import { catLabel, catColor } from './categories.js';

const fmtDate = (s) => {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
};

export default function HistoryView({ units }) {
  const [workouts, setWorkouts] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = () =>
    api.workouts().then((r) => setWorkouts(r.workouts)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const toggle = (id) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    api.workout(id).then((r) => setDetail(r.workout)).catch((e) => setError(e.message)).finally(() => setDetailLoading(false));
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this workout? This cannot be undone.')) return;
    try {
      await api.deleteWorkout(id);
      if (openId === id) { setOpenId(null); setDetail(null); }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <div className="banner error">{error}</div>;
  if (!workouts) return <div className="spinner">Loading…</div>;

  return (
    <div>
      <h1>History</h1>
      {!workouts.length && <div className="empty">No workouts yet. Head to the <b>Log</b> tab to record your first one.</div>}

      {workouts.map((w) => (
        <div className="card session" key={w.id} onClick={() => toggle(w.id)} style={{ cursor: 'pointer' }}>
          <div className="between">
            <div>
              <div className="act-head">
                <span className="cat-dot" style={{ background: catColor(w.category) }} />
                <span className="act-title">{catLabel(w.category)}</span>
              </div>
              <div className="act-date">{fmtDate(w.date)}</div>
            </div>
            <button className="btn danger small" onClick={(e) => remove(w.id, e)}>Delete</button>
          </div>

          <div className="act-stats">
            <div className="act-stat">
              <div className="n">{w.summary.exerciseCount}</div>
              <div className="l">exercises</div>
            </div>
            <div className="act-stat">
              <div className="n">{w.summary.setCount}</div>
              <div className="l">sets</div>
            </div>
            <div className="act-stat">
              <div className="n">{w.summary.volume.toLocaleString()}</div>
              <div className="l">volume ({units})</div>
            </div>
          </div>

          {openId === w.id && (
            <div style={{ marginTop: 14 }} onClick={(e) => e.stopPropagation()}>
              {detailLoading && <div className="spinner">Loading…</div>}
              {detail && (
                <>
                  <div className="section-title" style={{ marginTop: 4 }}>Exercises</div>
                  {detail.entries.length === 0 && <div className="muted">No sets recorded.</div>}
                  {detail.entries.map((en) => (
                    <div className="detail-ex" key={en.exercise_id}>
                      <div className="between">
                        <b>{en.name}</b>
                        <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>
                          {en.e1rm != null ? `e1RM ${Math.round(en.e1rm)}` : ''}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                        {en.sets.map((s, i) => (
                          <span key={i}>
                            {i > 0 && '   ·   '}
                            {s.weight ?? '—'}{s.weight != null ? ` ${units}` : ''} × {s.reps ?? '—'}
                          </span>
                        ))}
                      </div>
                      {(en.ready_to_progress || en.rpe != null || en.note) && (
                        <div className="row" style={{ gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                          {en.ready_to_progress && <span className="chip accent" style={{ cursor: 'default' }}>ready for more</span>}
                          {en.rpe != null && <span className="chip">effort {en.rpe}/10</span>}
                          {en.note && <span className="faint" style={{ fontSize: 13 }}>“{en.note}”</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {(detail.cardio_note || detail.notes) && (
                    <div className="detail-ex muted" style={{ fontSize: 13 }}>
                      {detail.cardio_note && <div>🏃 {detail.cardio_note}</div>}
                      {detail.notes && <div>📝 {detail.notes}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
