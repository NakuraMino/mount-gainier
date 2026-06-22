import { useEffect, useRef, useState } from 'react';

// Rest lengths snap to 15s steps, clamped to a sane 15s–10min range.
export const clampSecs = (n) => Math.max(15, Math.min(600, Math.round(n / 15) * 15));

// mm:ss; once a countdown passes zero we count up with a leading "+".
const fmt = (s) => {
  const neg = s < 0;
  const a = Math.abs(s);
  return `${neg ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
};

// Short two-tone chime via WebAudio so we don't ship an audio asset. Best-effort:
// mobile autoplay rules can mute it when no gesture is recent — the vibrate covers that.
function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.start(t); o.stop(t + 0.16);
    });
    setTimeout(() => ctx.close(), 700);
  } catch {}
}

// A floating rest bar. `endsAt` (ms epoch) null = idle; a number = a running rest.
export default function RestTimer({ endsAt, duration, onStart, onAdjust, onSkip, onChangeDuration }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);

  // Tick 4×/sec while a rest is running. Recomputing from endsAt each tick keeps it
  // smooth and self-correcting against setInterval drift / a backgrounded tab.
  useEffect(() => {
    if (!endsAt) return;
    fired.current = false;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt ? Math.round((endsAt - now) / 1000) : null;
  const done = remaining != null && remaining <= 0;

  // Chime + vibrate once, the moment the countdown crosses zero.
  useEffect(() => {
    if (!done || fired.current) return;
    fired.current = true;
    chime();
    if (navigator.vibrate) navigator.vibrate([140, 70, 140]);
  }, [done]);

  // Idle: a slim control to tune the default rest length or start one by hand.
  if (!endsAt) {
    return (
      <div className="rest-bar idle">
        <div className="rest-row">
          <span className="rest-label">⏱ Rest</span>
          <button className="rest-btn" onClick={() => onChangeDuration(clampSecs(duration - 15))} aria-label="Less rest">−15</button>
          <span className="rest-time" style={{ fontSize: 16, minWidth: 52 }}>{fmt(duration)}</span>
          <button className="rest-btn" onClick={() => onChangeDuration(clampSecs(duration + 15))} aria-label="More rest">+15</button>
          <div className="rest-spacer" />
          <button className="rest-btn accent" onClick={onStart}>Start</button>
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(1, remaining / duration));
  return (
    <div className={`rest-bar${done ? ' done' : ''}`}>
      <div className="rest-fill" style={{ transform: `scaleX(${done ? 1 : pct})` }} />
      <div className="rest-row">
        <span className="rest-time">{fmt(remaining)}</span>
        <span className="rest-label">{done ? "rest's up 💪" : 'resting'}</span>
        <div className="rest-spacer" />
        <button className="rest-btn" onClick={() => onAdjust(-15)} aria-label="Take 15 seconds off">−15</button>
        <button className="rest-btn" onClick={() => onAdjust(15)} aria-label="Add 15 seconds">+15</button>
        <button className="rest-btn accent" onClick={onSkip}>{done ? 'Done' : 'Skip'}</button>
      </div>
    </div>
  );
}
