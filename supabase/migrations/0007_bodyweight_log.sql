-- Bodyweight as its own log, rather than a column on a workout.
--
-- web_workouts.bodyweight tied a weigh-in to a training session, which is not how
-- anyone actually weighs themselves: you step on the scale first thing in the
-- morning and train hours later, or on a day you don't train at all. Under the old
-- shape the morning reading had nowhere to go until you finished a workout, and a
-- rest-day weigh-in was simply unrecordable.
--
-- One reading per day per user. A scale read twice in a morning is the same
-- measurement, so a repeat overwrites rather than accumulating -- which is what
-- the unique constraint gives the upsert to work against.
create table if not exists public.web_bodyweight (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  weight     numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- The only read is "my readings, oldest first" (the chart) or "the latest one"
-- (goal progress), both served by this.
create index if not exists web_bodyweight_user_date_idx
  on public.web_bodyweight (user_id, date);

alter table public.web_bodyweight enable row level security;

create policy web_bodyweight_own on public.web_bodyweight
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Carry across everything already logged against a workout, so no history is lost
-- in the move. Two workouts on one day would both claim that date; the later one
-- wins, matching the old chart, which kept the last reading of the day.
insert into public.web_bodyweight (user_id, date, weight)
select distinct on (w.user_id, w.date) w.user_id, w.date, w.bodyweight
from public.web_workouts w
where w.bodyweight is not null
order by w.user_id, w.date, w.created_at desc
on conflict (user_id, date) do nothing;

-- web_workouts.bodyweight is deliberately left in place rather than dropped: the
-- backfill above is the only thing that ever needed to read it, and dropping a
-- column holding real data is not worth the risk for the bytes. Nothing writes it
-- from here on.
