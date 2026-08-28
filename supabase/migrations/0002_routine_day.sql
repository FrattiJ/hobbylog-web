-- Schedule a routine to a weekday so the Today tab can pre-load it.
-- 0 = Sunday .. 6 = Saturday, matching JavaScript's Date.getDay().
-- Null means the routine isn't tied to a day; you load it by hand.
alter table public.web_routines
  add column if not exists day_of_week smallint
  check (day_of_week is null or (day_of_week between 0 and 6));
