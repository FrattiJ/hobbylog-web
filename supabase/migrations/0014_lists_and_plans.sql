-- Lists and saved plans.
--
-- Two features, three tables, one migration because they shipped together and
-- neither changes anything that already exists.
--
--   web_lists, web_list_items   your own groupings of entries, across hobbies,
--                               optionally shared with accepted friends
--   web_plans                   one saved "plan to a date" per person
--
-- The app treats all three as optional: until this is applied, the Lists page
-- says so, the entry page simply shows no list control, and a plan can be
-- worked out but not saved.

-- ── Lists ────────────────────────────────────────────────────────────────────

create table if not exists public.web_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  -- Private until shared, the same default as everything else: a new list is
  -- nobody's business until you say so.
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists web_lists_user_idx on public.web_lists (user_id, updated_at desc);

create table if not exists public.web_list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.web_lists(id) on delete cascade,
  -- Denormalised from the list so the own-rows policy is a plain column
  -- comparison, as it is on every other table here.
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Deleting an entry takes it out of every list it was in.
  entry_id   uuid not null references public.web_entries(id) on delete cascade,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  -- An entry is in a list or it is not; there is no second copy.
  unique (list_id, entry_id)
);

create index if not exists web_list_items_list_idx  on public.web_list_items (list_id, position);
create index if not exists web_list_items_entry_idx on public.web_list_items (entry_id);
create index if not exists web_list_items_user_idx  on public.web_list_items (user_id);

alter table public.web_lists      enable row level security;
alter table public.web_list_items enable row level security;

-- Reading: your own lists, plus a friend's list once they have shared it.
-- are_friends() is the same check web_entries uses, so "friend" means one thing.
-- auth.uid() sits in a scalar sub-select so it is evaluated once per statement.
drop policy if exists web_lists_select on public.web_lists;
create policy web_lists_select on public.web_lists
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (is_shared and public.are_friends((select auth.uid()), user_id))
  );

drop policy if exists web_lists_insert on public.web_lists;
create policy web_lists_insert on public.web_lists
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists web_lists_update on public.web_lists;
create policy web_lists_update on public.web_lists
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists web_lists_delete on public.web_lists;
create policy web_lists_delete on public.web_lists
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Reading items: your own, or those of a list a friend shared. The sub-select
-- on web_lists runs under the reader's own policies above, so it can only find
-- a list the reader is already allowed to see.
--
-- An entry its owner marked private is left out for friends. web_entries would
-- refuse to show them the entry anyway; dropping the item too means a shared
-- list's length does not give away that something hidden is in it.
drop policy if exists web_list_items_select on public.web_list_items;
create policy web_list_items_select on public.web_list_items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.web_lists l
        where l.id = list_id
          and l.is_shared
          and public.are_friends((select auth.uid()), l.user_id)
      )
      and not coalesce(public.is_entry_private(entry_id), false)
    )
  );

-- Writing items: only into your own list, and only your own entries. Without
-- the second check a friend's entry id, which you can read, could be filed
-- into a list of yours.
drop policy if exists web_list_items_insert on public.web_list_items;
create policy web_list_items_insert on public.web_list_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.web_lists l   where l.id = list_id  and l.user_id = (select auth.uid()))
    and exists (select 1 from public.web_entries e where e.id = entry_id and e.user_id = (select auth.uid()))
  );

drop policy if exists web_list_items_update on public.web_list_items;
create policy web_list_items_update on public.web_list_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists web_list_items_delete on public.web_list_items;
create policy web_list_items_delete on public.web_list_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── Saved plan ───────────────────────────────────────────────────────────────
-- One row per person: the settings a plan was made with and the entries it
-- held, so the app can say later how it is going. Working a plan out stores
-- nothing; this is only for keeping one.

create table if not exists public.web_plans (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  hours_per_week numeric(5,2) not null check (hours_per_week > 0 and hours_per_week <= 168),
  goal_date      date not null,
  mode           text not null default 'balanced' check (mode in ('balanced', 'finishes', 'long')),
  -- The plan's entries in its own order. An array, not a join table: it is read
  -- and written whole, and an id whose entry has since been deleted is simply
  -- counted as gone by the app.
  entry_ids      uuid[] not null default '{}',
  -- Progress is measured from this day.
  started_on     date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.web_plans enable row level security;

-- Private, like time windows: when you mean to finish something is yours alone.
drop policy if exists web_plans_own on public.web_plans;
create policy web_plans_own on public.web_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Signed-in users only, and only through the policies above. Stated outright
-- rather than left to the project's default privileges.
revoke all on public.web_lists, public.web_list_items, public.web_plans from anon;
grant select, insert, update, delete on public.web_lists, public.web_list_items, public.web_plans to authenticated;

-- delete_my_account() ends by deleting the auth.users row, and all three tables
-- cascade from it, so it needs no change.
