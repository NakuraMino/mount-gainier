import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush,
} from 'recharts';
import { api } from './api.js';

const RANGES = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
];
const METRICS = [
  { key: 'weight', label: 'Weight' },
  { key: 'e1rm', label: 'Est. 1RM' },
  { key: 'volume', label: 'Volume' },
];
const ACCENT = '#22c55e';
const shortDate = (s) => {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function ProgressView({ units }) {
  const [stats, setStats] = useState(null);
  const [exercises, setExercises] = useState(null);
  const [exId, setExId] = useState('');
  const [metric, setMetric] = useState('e1rm');
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    api.exercises().then((r) => {
      setExercises(r.exercises);
      if (r.exercises.length) setExId((cur) => cur || r.exercises[0].id);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!exId) return;
    setData(null);
    api.progress(exId, range).then(setData).catch((e) => setError(e.message));
  }, [exId, range]);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label;
  const series = data?.series || [];
  const hasData = series.some((p) => p[metric] != null);

  return (
    <div>
      <h1>Progress</h1>
      {error && <div className="banner error">{error}</div>}

      {/* overview */}
      {stats && (
        <div className="stat-grid">
          <div className="stat"><div className="n">{stats.weekStreak}</div><div className="l">week streak</div></div>
          <div className="stat"><div className="n">{stats.totalWorkouts}</div><div className="l">workouts</div></div>
          <div className="stat"><div className="n">{(stats.thisWeekVolume || 0).toLocaleString()}</div><div className="l">vol this week</div></div>
        </div>
      )}

      {exercises && !exercises.length && (
        <div className="empty">Add an exercise and log a workout to see progress.</div>
      )}

      {exercises && exercises.length > 0 && (
        <>
          <div className="section-title">Exercise</div>
          <select value={exId} onChange={(e) => setExId(e.target.value)}>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            <div className="segmented">
              {METRICS.map((m) => (
                <button key={m.key} className={metric === m.key ? 'active' : ''} onClick={() => setMetric(m.key)}>{m.label}</button>
              ))}
            </div>
            <div className="segmented">
              {RANGES.map((r) => (
                <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>{r.label}</button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            {!data ? (
              <div className="spinner">Loading…</div>
            ) : !hasData ? (
              <div className="empty">No {metricLabel.toLowerCase()} data in this range yet.</div>
            ) : (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--text-faint)', fontSize: 11 }} stroke="var(--line)" minTickGap={24} />
                    <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} stroke="var(--line)" width={44} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-elev-2)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)' }}
                      labelFormatter={(d) => shortDate(d)}
                      formatter={(v) => [metric === 'weight' ? `${v} ${units}` : v, metricLabel]}
                    />
                    <Line type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls />
                    {series.length > 6 && <Brush dataKey="date" height={22} stroke={ACCENT} tickFormatter={shortDate} travellerWidth={8} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* PRs */}
          {data?.prs && (
            <>
              <div className="section-title">Personal records</div>
              <div className="pr-grid">
                <div className="stat">
                  <div className="n">{data.prs.maxWeight != null ? `${data.prs.maxWeight}` : '—'}</div>
                  <div className="l">heaviest ({units}){data.prs.repsAtTopWeight != null ? ` ×${data.prs.repsAtTopWeight}` : ''}</div>
                </div>
                <div className="stat">
                  <div className="n">{data.prs.bestE1rm != null ? Math.round(data.prs.bestE1rm) : '—'}</div>
                  <div className="l">best est. 1RM</div>
                </div>
                <div className="stat">
                  <div className="n">{data.prs.bestVolume != null ? data.prs.bestVolume.toLocaleString() : '—'}</div>
                  <div className="l">best session vol</div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
