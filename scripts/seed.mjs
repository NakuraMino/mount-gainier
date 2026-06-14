// One-time (idempotent) seed: create the `mino` account and stock the exercise
// library, tagged Upper / Lower / Back, from the user's spreadsheet. Re-runnable —
// the account password is reset and exercises are upserted on (user_id, name).
//
//   npm run seed
//
// Override the seeded credentials with SEED_USERNAME / SEED_PASSWORD if desired.
import { createAccount } from '../server/auth.mjs';
import { supabase } from '../server/supabase.mjs';

const USERNAME = process.env.SEED_USERNAME || 'mino';
const PASSWORD = process.env.SEED_PASSWORD || 'gym123';

// { name, category, muscle_group, equipment, is_unilateral, default_sets, default_reps }
const EXERCISES = [
  // --- Upper ---
  { name: 'Barbell Bench Press', category: 'upper', muscle_group: 'chest', equipment: 'barbell', default_reps: 5 },
  { name: 'Lean-Away DB Lateral Raise', category: 'upper', muscle_group: 'shoulders', equipment: 'dumbbell', is_unilateral: true },
  { name: 'Arnold Press', category: 'upper', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'DB Tricep Extensions', category: 'upper', muscle_group: 'triceps', equipment: 'dumbbell' },
  { name: 'Cable Pulldowns (Triceps)', category: 'upper', muscle_group: 'triceps', equipment: 'cable' },
  { name: 'Cable Curls', category: 'upper', muscle_group: 'biceps', equipment: 'cable' },
  { name: 'DB Bicep Curls', category: 'upper', muscle_group: 'biceps', equipment: 'dumbbell' },
  { name: 'Lateral Raises', category: 'upper', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Cable Lateral Raises', category: 'upper', muscle_group: 'shoulders', equipment: 'cable', is_unilateral: true },

  // --- Lower ---
  { name: 'Single-Leg Extension Machine', category: 'lower', muscle_group: 'quads', equipment: 'machine', is_unilateral: true },
  { name: 'Leg Press Machine', category: 'lower', muscle_group: 'quads', equipment: 'machine' },
  { name: 'Romanian Deadlift', category: 'lower', muscle_group: 'hamstrings', equipment: 'barbell' },
  { name: 'Single-Leg Curl Machine', category: 'lower', muscle_group: 'hamstrings', equipment: 'machine', is_unilateral: true },
  { name: 'Squats', category: 'lower', muscle_group: 'quads', equipment: 'barbell' },
  { name: 'Lunges', category: 'lower', muscle_group: 'quads', equipment: 'dumbbell', is_unilateral: true },
  { name: 'Abdominal Circuit', category: 'lower', muscle_group: 'core', equipment: 'bodyweight' },
  { name: 'Hip Abduction', category: 'lower', muscle_group: 'glutes', equipment: 'machine' },
  { name: 'Hip Adduction', category: 'lower', muscle_group: 'adductors', equipment: 'machine' },

  // --- Back ---
  { name: 'Lat Pulldowns', category: 'back', muscle_group: 'lats', equipment: 'cable' },
  { name: 'Iso-Lateral Row', category: 'back', muscle_group: 'mid-back', equipment: 'machine' },
  { name: 'Cable Row', category: 'back', muscle_group: 'mid-back', equipment: 'cable' },
  { name: 'Bench Back Extension', category: 'back', muscle_group: 'lower-back', equipment: 'bodyweight' },
  { name: 'Reverse Flies', category: 'back', muscle_group: 'rear-delts', equipment: 'dumbbell' },
  { name: 'Face Pull', category: 'back', muscle_group: 'rear-delts', equipment: 'cable' },
  { name: 'Assisted Pull-Ups', category: 'back', muscle_group: 'lats', equipment: 'machine' },
  { name: 'Pull-ups', category: 'back', muscle_group: 'lats', equipment: 'bodyweight' }, // reps-only
];

async function main() {
  console.log(`[seed] ensuring account "${USERNAME}" (admin) …`);
  const { id: userId } = await createAccount({ username: USERNAME, password: PASSWORD, isAdmin: true });
  console.log(`[seed] account id ${userId}`);

  await supabase.from('prefs').upsert({ user_id: userId, units: 'lb' }, { onConflict: 'user_id' });

  const rows = EXERCISES.map((e, i) => ({
    user_id: userId,
    name: e.name,
    category: e.category,
    muscle_group: e.muscle_group || '',
    equipment: e.equipment || '',
    is_unilateral: !!e.is_unilateral,
    position: i,
    default_sets: e.default_sets ?? 3,
    default_reps: e.default_reps ?? 10,
  }));
  const { error } = await supabase.from('exercises').upsert(rows, { onConflict: 'user_id,name' });
  if (error) throw new Error(error.message);
  console.log(`[seed] upserted ${rows.length} exercises (Upper/Lower/Back).`);
  console.log(`[seed] done. Log in with username "${USERNAME}".`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed] failed:', e.message);
    process.exit(1);
  });
