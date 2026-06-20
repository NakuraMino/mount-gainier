import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';
import { api } from './api.js';
import { LIFT_DEFS, benchmarks } from './benchmarks.js';
import { CAT_META, catColor, catLabel } from './categories.js';

const RANGES = [
  { key: '1m', label: '1M' }, { key: '3m', label: '3M' }, { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' }, { key: 'all', label: 'All' },
];
const METRICS = [
  { key: 'weight', label: 'Weight' }, { key: 'e1rm', label: 'Est. 1RM' },
  { key: 'volume', label: 'Volume' }, { key: 'maxReps', label: 'Reps' },
];
const ACCENT = '#fc5200';
const shortDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // week starts Monday, matching the streak logic
// Local YYYY-MM-DD (not toISOString, which is UTC and can land on the wrong day).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fill for a day cell: the category color, or — if you trained more than one
// category that day — an even conic-gradient split between their colors.
function dayBg(cats) {
  if (cats.length === 1) return catColor(cats[0]);
  const seg = cats.map((c, i) => `${catColor(c)} ${(i / cats.length) * 100}% ${((i + 1) / cats.length) * 100}%`).join(', ');
  return `conic-gradient(${seg})`;
}

// A month grid of the days you trained, colored by workout category (no extra API).
function WorkoutCalendar() {
  const [days, setDays] = useState(null); // Map<'YYYY-MM-DD', category[]> (distinct, in order)
  const [view, setView] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayStr = ymd(new Date());

  useEffect(() => {
    api.workoutDays()
      .then((r) => {
        const map = new Map();
        for (const w of r.days) {
          const cats = map.get(w.date) || [];
          if (!cats.includes(w.category)) cats.push(w.category);
          map.set(w.date, cats);
        }
        setDays(map);
      })
      .catch(() => setDays(new Map()));
  }, []);

  const { y, m } = view;
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // blanks before day 1 (Mon-start)
  const total = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  const now = new Date();
  const isCurrentMonth = now.getFullYear() === y && now.getMonth() === m;
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const monthCount = days ? [...days.keys()].filter((k) => k.startsWith(monthPrefix)).length : 0;

  // Legend: only categories that actually appear, in the canonical order.
  const present = days ? [...new Set([...days.values()].flat())] : [];
  const order = Object.keys(CAT_META);
  const legend = [...order.filter((k) => present.includes(k)), ...present.filter((k) => !order.includes(k))];

  const shift = (delta) => setView(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <div className="cal-title">{MONTHS[m]} {y}</div>
        <button className="cal-nav" onClick={() => shift(1)} disabled={isCurrentMonth} aria-label="Next month">›</button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid" style={{ marginTop: 4 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={`e${i}`} className="cal-cell" />;
          const key = `${monthPrefix}${String(d).padStart(2, '0')}`;
          const cats = days?.get(key);
          const cls = `cal-day${cats ? ' on' : ''}${key === todayStr ? ' today' : ''}`;
          return <div key={key} className="cal-cell"><div className={cls} style={cats ? { background: dayBg(cats) } : undefined}>{d}</div></div>;
        })}
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>
        {monthCount} {monthCount === 1 ? 'day' : 'days'} at the gym{isCurrentMonth ? ' this month' : ''}
      </div>
      {legend.length > 0 && (
        <div className="cal-legend">
          {legend.map((k) => (
            <span key={k} className="cal-legend-item">
              <span className="cat-dot" style={{ background: catColor(k) }} />{catLabel(k)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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

export default function ProgressView({ units, sex, ageBand, bodyweight }) {
  const [stats, setStats] = useState(null);
  const [exercises, setExercises] = useState(null);
  const [exId, setExId] = useState('');
  const [metric, setMetric] = useState('weight');
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [main, setMain] = useState(null); // user's main-lift bests
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    api.mainLifts().then((r) => setMain(r.lifts)).catch(() => {});
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

  // Bodyweight exercises only have reps, so default the trend metric to Reps.
  useEffect(() => {
    if (!exId || !exercises) return;
    const sel = exercises.find((e) => e.id === exId);
    if (!sel) return;
    const repsOnly = (sel.equipment || '').toLowerCase() === 'bodyweight';
    setMetric((m) => (repsOnly ? 'maxReps' : m === 'maxReps' ? 'weight' : m));
  }, [exId, exercises]);

  const metricLabel = METRICS.find((m) => m.key === metric)?.label;
  const series = data?.series || [];
  const hasData = series.some((p) => p[metric] != null);

  // --- radar: you vs average for the chosen group (scaled to bodyweight) ---
  const avg = benchmarks(sex, ageBand, units, bodyweight);
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

      {/* --- month calendar: which days you trained --- */}
      <div className="section-title">Gym calendar</div>
      <WorkoutCalendar />

      {/* --- strength vs average radar (group set in Settings) --- */}
      <div className="section-title">Strength vs average</div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="var(--line)" />
              <PolarAngleAxis dataKey="lift" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 2]} tick={false} axisLine={false} />
              <Radar name={`Avg (${sex === 'male' ? 'M' : 'F'} ${ageBand})`} dataKey="avg" stroke="var(--text-faint)" fill="var(--text-faint)" fillOpacity={0.12} />
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
          {bodyweight > 0
            ? `Averages scaled to ${Math.round(units === 'kg' ? bodyweight * 0.453592 : bodyweight)} ${units} bodyweight`
            : 'Set your bodyweight in Settings to scale these averages to you'}
          ; pull-ups compared by reps. “DB Press” assumes a dumbbell bench press.
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
                    <Area type="linear" dataKey={metric} stroke={ACCENT} strokeWidth={2.5} fill="url(#fillAccent)" dot={{ r: 2.5, fill: ACCENT }} activeDot={{ r: 5 }} connectNulls />
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
