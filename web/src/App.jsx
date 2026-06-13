import { useEffect, useState, useCallback } from 'react';
import { supabase, supabaseConfigured } from './supabaseClient.js';
import { api, setUnauthorizedHandler } from './api.js';
import LoginView from './LoginView.jsx';
import LogView from './LogView.jsx';
import HistoryView from './HistoryView.jsx';
import ProgressView from './ProgressView.jsx';
import ExercisesModal from './ExercisesModal.jsx';

const LS_TAB = 'gymtracker.tab';
const LS_THEME = 'gymtracker.theme';

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
  const [showExercises, setShowExercises] = useState(false);

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" /> Gym Tracker
        </div>
        <div className="spacer" />
        <button className="iconbtn" title="Exercises & settings" onClick={() => setShowExercises(true)}>⚙️</button>
        <button
          className="iconbtn"
          title={theme === 'light' ? 'Night mode' : 'Day mode'}
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      <main className="content">
        {tab === 'log' && <LogView units={units} onSaved={() => setTab('history')} />}
        {tab === 'history' && <HistoryView units={units} />}
        {tab === 'progress' && <ProgressView units={units} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {showExercises && (
        <ExercisesModal
          me={me}
          units={units}
          onUnits={(u) => api.setPrefs({ units: u }).then(() => refreshPrefs())}
          onLogout={logout}
          onClose={() => setShowExercises(false)}
        />
      )}
    </div>
  );
}
