-- admin_feedback: require that the admin address was actually proved.
--
-- The gate here has always been the caller's JWT email, which is sound only for
-- as long as an address in a JWT means someone opened a confirmation link for
-- it. That is a setting, not a law -- and it is exactly the setting you reach
-- for when signups are being throttled by the auth email rate limit. Turn email
-- confirmation off for an afternoon and the gate becomes "sign up as the admin
-- address", with the whole feedback table (and the email on every account that
-- wrote to it) behind it.
--
-- So check the confirmation too. Belt and braces, and it costs one lookup on a
-- function only one person can usefully call.
create or replace function public.admin_feedback()
returns table(id uuid, kind text, message text, page text, created_at timestamp with time zone, username text, email text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'admin@example.com'
     or not exists (
       select 1 from auth.users u
       where u.id = auth.uid() and u.email_confirmed_at is not null
     )
  then
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
