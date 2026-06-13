import { useState } from 'react';
import { supabase, usernameToEmail } from './supabaseClient.js';

export default function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password || busy) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      setErr(/invalid login/i.test(error.message) ? 'Wrong username or password.' : error.message);
      setBusy(false);
    }
    // on success, App's onAuthStateChange swaps in the app — no further action.
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img className="logo" src="/icon.svg" alt="" />
        <h1>Gym Tracker</h1>
        <p className="sub">Log in to track your workouts.</p>

        <label className="field">
          <span>Username</span>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {err && <div className="banner error">{err}</div>}

        <button className="btn block" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
