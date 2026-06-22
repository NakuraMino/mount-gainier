-- Gym Tracker schema (Supabase / Postgres).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Login credentials live in Supabase's built-in `auth.users` (managed by Supabase
-- Auth). Everything below is the app's own per-user data. The server talks to these
-- tables only through the service-role key (which bypasses RLS); the browser uses
-- Supabase only for login, never for direct table access. RLS is therefore enabled
-- with NO policies on every table, so the public anon key can never read or write
-- app data by accident.

-- gen_random_uuid() — pgcrypto ships with Supabase.
create extension if not exists pgcrypto;

-- --- profiles: username + admin flag, 1:1 with auth.users --------------------
create table if not exists profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  username    text        not null unique,
  is_admin    boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- --- exercises: the per-user library, tagged by category --------------------
create table if not exists exercises (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  name          text        not null,
  category      text        not null default 'other'
                  check (category in ('upper', 'lower', 'back', 'other')),
  muscle_group  text        not null default '',
  equipment     text        not null default '',
  is_unilateral boolean     not null default false,
  position      int         not null default 0,
  default_sets  int         not null default 3,
  default_reps  int         not null default 10,
  created_at    timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists idx_exercises_user_cat on exercises (user_id, category, position);

-- --- workouts: one logged session -------------------------------------------
create table if not exists workouts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  category    text,                                  -- upper|lower|back|null (freeform)
  date        date        not null default current_date,
  cardio_note text        not null default '',       -- steps / cardio jot
  notes       text        not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_workouts_user_date on workouts (user_id, date desc);

-- --- sets: the actual numeric work ------------------------------------------
create table if not exists sets (
  id          uuid        primary key default gen_random_uuid(),
  workout_id  uuid        not null references workouts (id) on delete cascade,
  exercise_id uuid        not null references exercises (id) on delete cascade,
  set_number  int         not null default 1,
  weight      numeric,                               -- nullable: bodyweight / not entered
  reps        int,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sets_workout  on sets (workout_id);
create index if not exists idx_sets_exercise on sets (exercise_id);

-- --- workout_exercises: per-(session, exercise) subjective data -------------
create table if not exists workout_exercises (
  id                uuid        primary key default gen_random_uuid(),
  workout_id        uuid        not null references workouts (id) on delete cascade,
  exercise_id       uuid        not null references exercises (id) on delete cascade,
  ready_to_progress boolean     not null default false,
  rpe               numeric,
  note              text        not null default '',
  unique (workout_id, exercise_id)
);

-- --- prefs: per-user settings -----------------------------------------------
create table if not exists prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  units   text not null default 'lb' check (units in ('lb', 'kg'))
);

-- --- templates: saved routines (a named, ordered list of library exercises) -
-- No numbers here — a template only pre-populates the Log screen. The actual
-- weights/reps still come from logging. Exercises are referenced (not copied),
-- so deleting an exercise drops it from any template via the cascade.
create table if not exists templates (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  category   text,                                 -- upper|lower|back|null (derived)
  position   int         not null default 0,       -- order in the picker
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists idx_templates_user on templates (user_id, position);

create table if not exists template_exercises (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates (id) on delete cascade,
  exercise_id uuid not null references exercises (id) on delete cascade,
  position    int  not null default 0,
  unique (template_id, exercise_id)
);
create index if not exists idx_template_exercises on template_exercises (template_id, position);

-- --- lock everything down ----------------------------------------------------
-- The server uses the service-role key (bypasses RLS); the browser never touches
-- these tables directly. RLS on with no policies = anon key can't read/write.
alter table profiles          enable row level security;
alter table exercises         enable row level security;
alter table workouts          enable row level security;
alter table sets              enable row level security;
alter table workout_exercises enable row level security;
alter table prefs             enable row level security;
alter table templates         enable row level security;
alter table template_exercises enable row level security;
