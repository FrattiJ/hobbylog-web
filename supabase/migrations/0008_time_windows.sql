-- Hobby time windows: the recurring blocks of the week you actually have free.
--
-- The suggestion engine already knew how much time you have -- buildPace() in
-- taste.ts measures it backwards out of your own sessions and completions. What
-- it could not know is the *shape* of that time: 9 hours a week spread as one
-- Sunday afternoon answers a different question than 9 hours in nightly
-- half-hours. A 40-hour RPG fits the first and never fits the second.
--
-- So this is deliberately not a calendar. There are no dates and no events, just
-- a handful of weekly rows -- the blocks you'd defend on a time-blocked
-- schedule. Seven rows, not a 500-cell grid.
--
-- day_of_week reuses the 0 = Sunday .. 6 = Saturday convention from
-- 0002_routine_day.sql so there is one day-of-week idiom in the schema.
create table if not exists public.web_time_windows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Optional, purely for your own recognition ("Sunday evening", "lunch break").
  label       text,
  day_of_week smallint not null check (day_of_week between 0 and 6),

  -- Minutes from midnight on day_of_week. end_min may run past 1440 so a block
  -- that crosses midnight -- Friday 19:30 to 00:30 is end_min 1470 -- stays one
  -- row rather than being split in two, which is how people actually describe
  -- a late evening. Capped at 24h of span.
  start_min   smallint not null check (start_min between 0 and 1439),
  end_min     smallint not null check (end_min between 1 and 2879),

  -- The share factor. A time-blocked schedule is full of blocks that read
  -- "Hobby | Homework | Chores" -- the time is yours but it is not all hobby
  -- time, and treating 2h15m of contested evening as 2h15m of reading is how
  -- a plan ends up lying to you. share is the fraction that realistically goes
  -- to a hobby, so 1.0 is a block you fully own and 0.5 is one you split.
  share       numeric(3,2) not null default 1.00 check (share > 0 and share <= 1),

  -- Keep a block you're not currently using without deleting it (a season of
  -- volleyball ends, the window comes back).
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint web_time_windows_span check (end_min > start_min and end_min - start_min <= 1440)
);

create index if not exists web_time_windows_user_day_idx
  on public.web_time_windows (user_id, day_of_week, start_min);

alter table public.web_time_windows enable row level security;

-- Private, like fitness: when you're free is nobody else's business, and there
-- is no friends-read policy here even though web_entries has one.
drop policy if exists web_time_windows_own on public.web_time_windows;
create policy web_time_windows_own on public.web_time_windows
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
