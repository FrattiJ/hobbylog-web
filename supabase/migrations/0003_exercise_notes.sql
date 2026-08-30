-- Per-exercise notes on a workout: seat position, incline, grip width, cues.
--
-- One note per (workout, exercise) -- it describes the setup, not a single set.
--
-- Blank notes are never stored. That's what makes "carry the last one forward"
-- work: leaving the field empty writes no row, so the newest row is always the
-- newest thing you actually typed, however many sessions ago that was.
create table if not exists public.web_exercise_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  workout_id  uuid not null references public.web_workouts(id) on delete cascade,
  exercise_id uuid not null references public.web_exercises(id) on delete cascade,
  note        text not null,
  unique (workout_id, exercise_id)
);

-- The lookup is "latest note for this exercise", joined back to the workout date.
create index if not exists web_exercise_notes_user_ex_idx
  on public.web_exercise_notes (user_id, exercise_id);

alter table public.web_exercise_notes enable row level security;

create policy web_exercise_notes_own on public.web_exercise_notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
