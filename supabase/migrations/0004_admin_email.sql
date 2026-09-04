-- Point the feedback inbox at the account that actually runs the app.
--
-- The admin check is duplicated on purpose: lib/db.ts decides whether to render
-- the inbox card, and this function decides whether to return any rows. Only the
-- second one is a real boundary -- it reads the email out of the verified JWT --
-- so changing the client alone would leave the RPC still refusing the new admin.
--
-- household@ is a shared household address; admin@ is the app owner's,
-- and matches the authorship on every commit in this repo.
--
-- Emails come out of the JWT as Supabase stored them, which is lower-cased, but
-- compare that way explicitly rather than relying on it.
create or replace function public.admin_feedback()
returns table(
  id         uuid,
  kind       text,
  message    text,
  page       text,
  created_at timestamp with time zone,
  username   text,
  email      text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'admin@example.com' then
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
