-- Admin access by user id, not by email address.
--
-- 0004 and 0010 gated the feedback inbox on the caller's JWT email, which put
-- the owner's address in the repo and depended on email confirmation being on.
-- A user id comes from the verified JWT's `sub` and can't be claimed by signing
-- up with someone else's address, so it is the stronger check and keeps
-- personal details out of source control.
--
-- The table has RLS on and no policies, so nobody can read or edit it through
-- the API; only the security definer functions below look inside it.
--
-- To make someone an admin, run this once in the Supabase SQL editor (it is not
-- part of the migration so no account details live in the repo):
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = '<the admin address>';

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from app_admins a where a.user_id = auth.uid());
$function$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_feedback()
returns table(id uuid, kind text, message text, page text, created_at timestamp with time zone, username text, email text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select f.id, f.kind, f.message, f.page, f.created_at,
           p.username, u.email::text
    from feedback f
    left join web_profile p on p.user_id = f.user_id
    left join auth.users u on u.id = f.user_id
    order by f.created_at desc;
end $function$;

revoke all on function public.admin_feedback() from public, anon;
grant execute on function public.admin_feedback() to authenticated;
