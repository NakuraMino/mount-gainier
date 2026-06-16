// Approximate population averages for the main lifts, by sex and age band.
//
// These are rough "average trained adult" numbers (estimated 1RM in lb, except
// pull-ups which are reps), assembled from public strength-standards data
// (StrengthLevel / Legion / Barbell Medicine). Strength peaks ~25–34, so we store
// a peak value per sex and scale it by an age factor for the other bands. They're
// ballpark figures for a fun comparison, not medical/coaching truth.

// Ordered so lifts hitting similar muscles sit next to each other on the radar
// (the chart and table both follow this order). Grouped push → pull → legs, so
// each movement pattern forms a contiguous arc instead of being interleaved.
export const LIFT_DEFS = [
  { key: 'bench', label: 'Bench', metric: 'e1rm' },      // push (chest/triceps)
  { key: 'db_press', label: 'DB Press', metric: 'e1rm' }, // push (chest/shoulders)
  { key: 'pulldown', label: 'Pulldown', metric: 'e1rm' }, // pull (lats/biceps)
  { key: 'pullup', label: 'Pull-ups', metric: 'reps' },   // pull (lats/biceps)
  { key: 'squat', label: 'Squat', metric: 'e1rm' },       // legs (quads/glutes)
  { key: 'rdl', label: 'RDL', metric: 'e1rm' },           // legs (hamstrings/glutes)
];

// Peak-age (~25–34) averages. Weights in lb; pull-ups in reps.
const PEAK = {
  male: { bench: 185, db_press: 65, squat: 245, pulldown: 165, rdl: 225, pullup: 9 },
  female: { bench: 90, db_press: 30, squat: 140, pulldown: 95, rdl: 130, pullup: 2 },
};

export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];
const AGE_FACTOR = { '18-24': 0.97, '25-34': 1.0, '35-44': 0.93, '45-54': 0.85, '55+': 0.74 };

export const LB_TO_KG = 0.453592;

// The PEAK numbers are calibrated for a reference bodyweight per sex; we scale them
// to the user's actual bodyweight. Maximal strength tracks muscle cross-sectional
// area, which grows ~ bodyweight^(2/3), so we scale allometrically rather than
// linearly — lighter lifters are relatively stronger, and per-bodyweight ratios
// fall as you get heavier, matching published strength-standard tables. Pull-up
// reps run the other way (you hoist your own bodyweight), so they scale ~ BW^(-1/3).
export const REF_BODYWEIGHT_LB = { male: 185, female: 145 };
const STRENGTH_EXP = 2 / 3;
const PULLUP_EXP = -1 / 3;

// Benchmark values for a group, in the user's units, adjusted for bodyweight.
// `bodyweightLb` is the user's weight in lb; when falsy we fall back to the sex's
// reference weight, which leaves the averages unchanged. Returns { liftKey: value }.
export function benchmarks(sex, band, units = 'lb', bodyweightLb = 0) {
  const peak = PEAK[sex] || PEAK.male;
  const f = AGE_FACTOR[band] ?? 1;
  const refBw = REF_BODYWEIGHT_LB[sex] || REF_BODYWEIGHT_LB.male;
  const bw = bodyweightLb > 0 ? bodyweightLb : refBw;
  const out = {};
  for (const def of LIFT_DEFS) {
    if (def.metric === 'reps') {
      const v = peak[def.key] * f * Math.pow(bw / refBw, PULLUP_EXP);
      out[def.key] = Math.max(1, Math.round(v));
    } else {
      let v = peak[def.key] * f * Math.pow(bw / refBw, STRENGTH_EXP);
      if (units === 'kg') v *= LB_TO_KG;
      out[def.key] = Math.round(v / 5) * 5; // round weights to nearest 5
    }
  }
  return out;
}
