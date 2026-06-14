// Approximate population averages for the main lifts, by sex and age band.
//
// These are rough "average trained adult" numbers (estimated 1RM in lb, except
// pull-ups which are reps), assembled from public strength-standards data
// (StrengthLevel / Legion / Barbell Medicine). Strength peaks ~25–34, so we store
// a peak value per sex and scale it by an age factor for the other bands. They're
// ballpark figures for a fun comparison, not medical/coaching truth.

export const LIFT_DEFS = [
  { key: 'bench', label: 'Bench', metric: 'e1rm' },
  { key: 'db_press', label: 'DB Press', metric: 'e1rm' },
  { key: 'squat', label: 'Squat', metric: 'e1rm' },
  { key: 'pulldown', label: 'Pulldown', metric: 'e1rm' },
  { key: 'rdl', label: 'RDL', metric: 'e1rm' },
  { key: 'pullup', label: 'Pull-ups', metric: 'reps' },
];

// Peak-age (~25–34) averages. Weights in lb; pull-ups in reps.
const PEAK = {
  male: { bench: 185, db_press: 65, squat: 245, pulldown: 165, rdl: 225, pullup: 9 },
  female: { bench: 90, db_press: 30, squat: 140, pulldown: 95, rdl: 130, pullup: 2 },
};

export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];
const AGE_FACTOR = { '18-24': 0.97, '25-34': 1.0, '35-44': 0.93, '45-54': 0.85, '55+': 0.74 };

const LB_TO_KG = 0.453592;

// Benchmark values for a group, in the user's units. Returns { liftKey: value }.
export function benchmarks(sex, band, units = 'lb') {
  const peak = PEAK[sex] || PEAK.male;
  const f = AGE_FACTOR[band] ?? 1;
  const out = {};
  for (const def of LIFT_DEFS) {
    let v = peak[def.key] * f;
    if (def.metric === 'reps') {
      out[def.key] = Math.max(1, Math.round(v));
    } else {
      if (units === 'kg') v *= LB_TO_KG;
      out[def.key] = Math.round(v / 5) * 5; // round weights to nearest 5
    }
  }
  return out;
}
