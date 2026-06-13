// Shared category metadata — labels + Strava-style color coding (used by the log
// dropdown, the history feed dots, and the progress view).
export const CAT_META = {
  upper: { label: 'Upper Body', color: '#fc5200' },
  lower: { label: 'Lower Body', color: '#2d9cdb' },
  back: { label: 'Back', color: '#9b51e0' },
  other: { label: 'Other', color: '#7a828c' },
};
export const catLabel = (k) => CAT_META[k]?.label || 'Freeform';
export const catColor = (k) => CAT_META[k]?.color || '#7a828c';
