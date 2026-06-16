import { useEffect, useState, useCallback } from 'react';
import { supabase, supabaseConfigured } from './supabaseClient.js';
import { api, setUnauthorizedHandler } from './api.js';
import LoginView from './LoginView.jsx';
import LogView from './LogView.jsx';
import HistoryView from './HistoryView.jsx';
import ProgressView from './ProgressView.jsx';
import ExercisesModal from './ExercisesModal.jsx';
import SettingsModal from './SettingsModal.jsx';

const LS_TAB = 'gymtracker.tab';
const LS_THEME = 'gymtracker.theme';
const LS_SEX = 'gymtracker.sex';
const LS_AGE = 'gymtracker.ageband';
const LS_BW = 'gymtracker.bodyweight'; // canonical lb; 0 = unset

const TABS = [
  { key: 'log', label: 'Log', ico: '➕' },
  { key: 'history', label: 'History', ico: '🗒️' },
  { key: 'progress', label: 'Progress', ico: '📈' },
];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [me, setMe] = useState(null);
  const [prefs, setPrefs] = useState({ units: 'lb' });
  const [tab, setTab] = useState(localStorage.getItem(LS_TAB) || 'log');
  const [editId, setEditId] = useState(null); // workout being edited in the Log tab, else null
  const [showExercises, setShowExercises] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sex, setSex] = useState(localStorage.getItem(LS_SEX) || 'male');
  const [ageBand, setAgeBand] = useState(localStorage.getItem(LS_AGE) || '25-34');
  const [bodyweight, setBodyweight] = useState(() => Number(localStorage.getItem(LS_BW)) || 0); // lb
  useEffect(() => localStorage.setItem(LS_SEX, sex), [sex]);
  useEffect(() => localStorage.setItem(LS_AGE, ageBand), [ageBand]);
  useEffect(() => localStorage.setItem(LS_BW, String(bodyweight || 0)), [bodyweight]);

  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(LS_THEME, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0b0b0c');
  }, [theme]);

  useEffect(() => localStorage.setItem(LS_TAB, tab), [tab]);

  // Track the Supabase auth session.
  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // A 401 from the API means our token is stale — drop the session.
  useEffect(() => {
    setUnauthorizedHandler(() => supabase.auth.signOut());
  }, []);

  // Once signed in, load profile + prefs.
  const refreshPrefs = useCallback(() => api.prefs().then(setPrefs).catch(() => {}), []);
  useEffect(() => {
    if (!session) { setMe(null); return; }
    api.me().then(setMe).catch(() => setMe({ username: '', isAdmin: false }));
    refreshPrefs();
  }, [session, refreshPrefs]);

  const logout = () => supabase.auth.signOut();

  if (!supabaseConfigured) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Gym Tracker</h1>
          <div className="banner error" style={{ marginTop: 12 }}>
            Supabase isn’t configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then rebuild.
          </div>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="spinner">Loading…</div>;
  if (!session) return <LoginView />;

  const units = prefs.units || 'lb';

  // Open a saved workout for editing in the Log tab.
  const startEdit = (id) => { setEditId(id); setTab('log'); };
  // Leaving the Log tab (or finishing) drops any edit session back to a fresh log.
  const goTab = (key) => { setEditId(null); setTab(key); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" /> Gym Tracker
        </div>
        <div className="spacer" />
        <button className="iconbtn" title="Exercises" onClick={() => setShowExercises(true)}>🏋️</button>
        <button className="iconbtn" title="Settings" onClick={() => setShowSettings(true)}>⚙️</button>
        <button
          className="iconbtn"
          title={theme === 'light' ? 'Night mode' : 'Day mode'}
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      <main className="content">
        {tab === 'log' && (
          <LogView
            key={editId || 'new'}
            editId={editId}
            units={units}
            onSaved={() => goTab('history')}
            onCancelEdit={() => goTab('history')}
          />
        )}
        {tab === 'history' && <HistoryView units={units} onEdit={startEdit} />}
        {tab === 'progress' && <ProgressView units={units} sex={sex} ageBand={ageBand} bodyweight={bodyweight} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => goTab(t.key)}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {showExercises && <ExercisesModal onClose={() => setShowExercises(false)} />}

      {showSettings && (
        <SettingsModal
          me={me}
          units={units}
          onUnits={(u) => api.setPrefs({ units: u }).then(() => refreshPrefs())}
          sex={sex}
          ageBand={ageBand}
          bodyweight={bodyweight}
          onSex={setSex}
          onAgeBand={setAgeBand}
          onBodyweight={setBodyweight}
          onLogout={logout}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
