import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import { api } from './api.js';
import { LIFT_DEFS, AGE_BANDS, benchmarks } from './benchmarks.js';

const RANGES = [
  { key: '1m', label: '1M' }, { key: '3m', label: '3M' }, { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' }, { key: 'all', label: 'All' },
];
const METRICS = [
  { key: 'weight', label: 'Weight' }, { key: 'e1rm', label: 'Est. 1RM' }, { key: 'volume', label: 'Volume' },
];
const ACCENT = '#fc5200';
const LS_SEX = 'gymtracker.sex';
const LS_AGE = 'gymtracker.ageband';
const shortDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function RadarTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;
  return (
    <div style={{ background: 'var(--bg-elev-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{r.lift}</div>
      <div>You: {r.youAbs != null ? `${r.youAbs} ${r.unit}` : '—'}</div>
      <div className="muted">Avg: {r.avgAbs} {r.unit}{r.youAbs != null && r.avgAbs ? `  ·  ${(r.youAbs / r.avgAbs).toFixed(2)}×` : ''}</div>
    </div>
  );
}

export default function ProgressView({ units }) {
  const [stats, setStats] = useState(null);
  const [exercises, setExercises] = useState(null);
  const [exId, setExId] = useState('');
  const [metric, setMetric] = useState('e1rm');
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [main, setMain] = useState(null); // user's main-lift bests
  const [sex, setSex] = useState(localStorage.getItem(LS_SEX) || 'male');
  const [band, setBand] = useState(localStorage.getItem(LS_AGE) || '25-34');
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    api.mainLifts().then((r) => setMain(r.lifts)).catch(() => {});
    api.exercises().then((r) => {
      setExercises(r.exercises);
      if (r.exercises.length) setExId((cur) => cur || r.exercises[0].id);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { localStorage.setItem(LS_SEX, sex); }, [sex]);
  useEffect(() => { localStorage.setItem(LS_AGE, band); }, [band]);

  useEffect(() => {
    if (!exId) return;
    setData(null);
    api.progress(exId, range).then(setData).catch((e) => setError(e.message));
  }, [exId, range]);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label;
  const series = data?.series || [];
  const hasData = series.some((p) => p[metric] != null);

  // --- radar: you vs average for the chosen group ---
  const avg = benchmarks(sex, band, units);
  const mainByKey = Object.fromEntries((main || []).map((l) => [l.key, l]));
  const radarData = LIFT_DEFS.map((def) => {
    const u = mainByKey[def.key];
    const youAbs = u ? (def.metric === 'reps' ? u.bestReps : u.e1rm) : null;
    const avgAbs = avg[def.key];
    const ratio = youAbs != null && avgAbs ? youAbs / avgAbs : 0;
    return {
      lift: def.label,
      you: Math.min(ratio, 2),
      avg: 1,
      youAbs: youAbs != null ? Math.round(youAbs) : null,
      avgAbs,
      unit: def.metric === 'reps' ? 'reps' : units,
    };
  });

  return (
    <div>
      <h1>Progress</h1>
      {error && <div className="banner error">{error}</div>}

      {stats && (
        <div className="stat-grid">
          <div className="stat"><div className="n">{stats.weekStreak}</div><div className="l">week streak</div></div>
          <div className="stat"><div className="n">{stats.totalWorkouts}</div><div className="l">workouts</div></div>
          <div className="stat"><div className="n">{(stats.thisWeekVolume || 0).toLocaleString()}</div><div className="l">vol this week</div></div>
        </div>
      )}

      {/* --- strength vs average radar --- */}
      <div className="section-title">Strength vs average</div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="segmented">
          <button className={sex === 'male' ? 'active' : ''} onClick={() => setSex('male')}>Male</button>
          <button className={sex === 'female' ? 'active' : ''} onClick={() => setSex('female')}>Female</button>
        </div>
        <select value={band} onChange={(e) => setBand(e.target.value)} style={{ width: 'auto' }}>
          {AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="var(--line)" />
              <PolarAngleAxis dataKey="lift" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 2]} tick={false} axisLine={false} />
              <Radar name={`Avg (${sex === 'male' ? 'M' : 'F'} ${band})`} dataKey="avg" stroke="var(--text-faint)" fill="var(--text-faint)" fillOpacity={0.12} />
              <Radar name="You" dataKey="you" stroke={ACCENT} fill={ACCENT} fillOpacity={0.4} />
              <Legend />
              <Tooltip content={<RadarTip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        {/* numbers table */}
        <div style={{ marginTop: 6 }}>
          {radarData.map((r) => (
            <div className="between" key={r.lift} style={{ padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{r.lift}</span>
              <span className="muted">
                {r.youAbs != null ? `${r.youAbs} ${r.unit}` : '—'} <span className="faint">vs {r.avgAbs} {r.unit}</span>
                {r.youAbs != null && r.avgAbs ? (
                  <span style={{ marginLeft: 8, color: r.youAbs >= r.avgAbs ? ACCENT : 'var(--text-dim)', fontWeight: 700 }}>
                    {(r.youAbs / r.avgAbs).toFixed(2)}×
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          Approximate averages for a trained adult; pull-ups compared by reps. “DB Press” assumes a dumbbell bench press.
        </div>
      </div>

      {/* --- per-exercise trend --- */}
      {exercises && !exercises.length && (
        <div className="empty">Add an exercise and log a workout to see progress.</div>
      )}

      {exercises && exercises.length > 0 && (
        <>
          <div className="section-title">Exercise trend</div>
          <select value={exId} onChange={(e) => setExId(e.target.value)}>
            {exercises.map((ex) => (<option key={ex.id} value={ex.id}>{ex.name}</option>))}
          </select>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            <div className="segmented">
              {METRICS.map((m) => (<button key={m.key} className={metric === m.key ? 'active' : ''} onClick={() => setMetric(m.key)}>{m.label}</button>))}
            </div>
            <div className="segmented">
              {RANGES.map((r) => (<button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>{r.label}</button>))}
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
                  <AreaChart data={series} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
                    <defs>
                      <linearGradient id="fillAccent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: 'var(--text-faint)', fontSize: 11 }} stroke="var(--line)" minTickGap={24} />
                    <YAxis tick={{ fill: 'var(--text-faint)', fontSize: 11 }} stroke="var(--line)" width={44} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-elev-2)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--text)' }}
                      labelFormatter={(d) => shortDate(d)}
                      formatter={(v) => [metric === 'weight' ? `${v} ${units}` : v, metricLabel]}
                    />
                    <Area type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2.5} fill="url(#fillAccent)" dot={{ r: 2.5, fill: ACCENT }} activeDot={{ r: 5 }} connectNulls />
                    {series.length > 6 && <Brush dataKey="date" height={22} stroke={ACCENT} tickFormatter={shortDate} travellerWidth={8} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

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
