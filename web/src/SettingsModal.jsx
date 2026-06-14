import { useState } from 'react';
import { api } from './api.js';
import { AGE_BANDS } from './benchmarks.js';

// Preferences only — account, units, your profile (sex + age band, used for the
// "vs average" radar), data export. The exercise library lives in its own modal.
export default function SettingsModal({ me, units, onUnits, sex, ageBand, onSex, onAgeBand, onLogout, onClose }) {
  const [error, setError] = useState('');

  const exportCsv = async () => {
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'gym_log.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button className="iconbtn" onClick={onClose}>×</button>
        </div>

        {/* account */}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="between">
            <div>Signed in as <b>{me?.username || '…'}</b> {me?.isAdmin && <span className="chip" style={{ marginLeft: 6 }}>admin</span>}</div>
            <button className="btn ghost small" onClick={onLogout}>Log out</button>
          </div>
        </div>

        {/* profile: drives the "vs average" radar */}
        <div className="section-title">Profile</div>
        <div className="card">
          <div className="between">
            <span className="muted" style={{ fontSize: 14 }}>Sex</span>
            <div className="segmented">
              <button className={sex === 'male' ? 'active' : ''} onClick={() => onSex('male')}>Male</button>
              <button className={sex === 'female' ? 'active' : ''} onClick={() => onSex('female')}>Female</button>
            </div>
          </div>
          <div className="between" style={{ marginTop: 12 }}>
            <span className="muted" style={{ fontSize: 14 }}>Age band</span>
            <select value={ageBand} onChange={(e) => onAgeBand(e.target.value)} style={{ width: 'auto' }}>
              {AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>Used to compare your lifts to population averages on the Progress tab.</div>
        </div>

        {/* preferences */}
        <div className="section-title">Preferences</div>
        <div className="card">
          <div className="between">
            <span className="muted" style={{ fontSize: 14 }}>Units</span>
            <div className="segmented">
              <button className={units === 'lb' ? 'active' : ''} onClick={() => onUnits('lb')}>lb</button>
              <button className={units === 'kg' ? 'active' : ''} onClick={() => onUnits('kg')}>kg</button>
            </div>
          </div>
        </div>

        {/* data */}
        <div className="section-title">Data</div>
        <div className="card">
          <button className="btn ghost block" onClick={exportCsv}>⬇ Export all sets as CSV</button>
        </div>

        {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}
