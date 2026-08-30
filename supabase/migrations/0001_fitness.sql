-- Fitness: routines, set-by-set workout logging, PRs and goals.
--
-- Fitness used to ride on web_entries (a backlog row: title/status/rating/progress),
-- which has nowhere to put sets and reps. These tables replace that for fitness;
-- web_entries keeps serving every other hobby.
--
-- Every table carries user_id and is locked to auth.uid(), matching web_entries.

create table if not exists public.web_exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  tracking_type text not null default 'weight_reps'
                check (tracking_type in ('weight_reps','reps','time','time_distance')),
  catalog_id    text,           -- slug from the bundled free-exercise-db, null if custom
  muscle        text,
  equipment     text,
  notes         text,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  -- One row per exercise name per user: re-picking the same catalog entry reuses it,
  -- which is what keeps PR history continuous.
  unique (user_id, name)
);

create table if not exists public.web_routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  notes      text,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.web_routine_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  routine_id     uuid not null references public.web_routines(id) on delete cascade,
  exercise_id    uuid not null references public.web_exercises(id) on delete cascade,
  position       integer not null default 0,
  target_sets    integer,
  target_reps    integer,
  target_seconds integer,
  rest_seconds   integer,
  notes          text
);

create table if not exists public.web_workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- Routine may be deleted or renamed later; routine_name preserves what history says.
  routine_id       uuid references public.web_routines(id) on delete set null,
  routine_name     text,
  date             date not null default current_date,
  duration_minutes integer,
  bodyweight       numeric,
  notes            text,
  created_at       timestamptz not null default now()
);

create table if not exists public.web_workout_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  workout_id  uuid not null references public.web_workouts(id) on delete cascade,
  exercise_id uuid not null references public.web_exercises(id) on delete cascade,
  position    integer not null default 0,
  reps        integer,
  weight      numeric,   -- lbs
  seconds     integer,
  distance    numeric,   -- miles
  rpe         numeric,
  is_warmup   boolean not null default false
);

create table if not exists public.web_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  exercise_id uuid references public.web_exercises(id) on delete cascade,
  metric      text not null
              check (metric in ('weight','e1rm','reps','seconds','distance','pace','workout_count','manual')),
  -- Manual goals have nothing to measure; they store target 1 and are ticked by hand.
  target      numeric not null default 1,
  target_date date,
  achieved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Read paths: "my exercises", "sets for this workout", "every set of this exercise
-- ever" (the PR + progress chart query), "workouts newest first" (history + streak).
create index if not exists web_exercises_user_idx      on public.web_exercises (user_id);
create index if not exists web_routines_user_idx       on public.web_routines (user_id);
create index if not exists web_routine_ex_routine_idx  on public.web_routine_exercises (routine_id, position);
create index if not exists web_workouts_user_date_idx  on public.web_workouts (user_id, date desc);
create index if not exists web_sets_workout_idx        on public.web_workout_sets (workout_id, position);
create index if not exists web_sets_user_exercise_idx  on public.web_workout_sets (user_id, exercise_id);
create index if not exists web_goals_user_idx          on public.web_goals (user_id);

alter table public.web_exercises         enable row level security;
alter table public.web_routines          enable row level security;
alter table public.web_routine_exercises enable row level security;
alter table public.web_workouts          enable row level security;
alter table public.web_workout_sets      enable row level security;
alter table public.web_goals             enable row level security;

-- Fitness is private: unlike web_entries there is no friends-read policy here.
do $$
declare t text;
begin
  foreach t in array array[
    'web_exercises','web_routines','web_routine_exercises',
    'web_workouts','web_workout_sets','web_goals'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t
    );
  end loop;
end $$;
