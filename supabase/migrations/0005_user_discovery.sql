-- Finding people without already knowing their exact handle.
--
-- Friends could only ever be found by typing a username, and the page showed
-- nothing at all until you did -- so the only way in was for someone to tell you
-- their handle out of band. These two functions give the Friends page something
-- to show before you type, and make what you do type rank sensibly.
--
-- Both expose exactly what search_users already did (username + avatar, never an
-- email, never anyone's entries) and stay restricted to authenticated callers.

-- Who else is on the app. Newest accounts first: on a small app that's the list
-- worth browsing, and it means a friend who just signed up is at the top.
create or replace function public.discover_users(limit_n integer default 24)
returns table(user_id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.user_id, p.username, p.avatar_url
  from web_profile p
  where p.user_id <> auth.uid()
    and coalesce(p.username, '') <> ''
  order by p.created_at desc
  limit least(greatest(coalesce(limit_n, 24), 1), 50);
$function$;

revoke all on function public.discover_users(integer) from public, anon;
grant execute on function public.discover_users(integer) to authenticated;

-- Same substring match as before, but ordered so a partial handle is useful:
-- an exact hit first, then handles that start with what you typed, then handles
-- that merely contain it, shortest first within each tier. Typing "jac" used to
-- put "bigjacket" above "jacob" purely because b sorts before j.
create or replace function public.search_users(q text)
returns table(user_id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.user_id, p.username, p.avatar_url
  from web_profile p
  where q <> ''
    and p.username ilike '%' || q || '%'
    and p.user_id <> auth.uid()
  order by
    case
      when lower(p.username) = lower(q) then 0
      when p.username ilike q || '%'    then 1
      else 2
    end,
    length(p.username),
    p.username
  limit 20;
$function$;

revoke all on function public.search_users(text) from public, anon;
grant execute on function public.search_users(text) to authenticated;
