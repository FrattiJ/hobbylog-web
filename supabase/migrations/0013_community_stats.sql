-- Per-title community numbers for the entry page: how many other people track a
-- catalog item, how many finished it, how many are on it now, and how they rated
-- it. Sits beside community_rating() rather than replacing it, so code that still
-- calls the older function keeps working.
--
-- Counts people, not rows (someone with the same title twice counts once), leaves
-- out the caller, and leaves out any entry its owner marked private. Aggregates
-- only: nothing here says who.

create or replace function public.community_stats(p_source text, p_ext text)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  select json_build_object(
    'tracking',     count(distinct user_id),
    'completed',    count(distinct user_id) filter (where status = 'completed'),
    'in_progress',  count(distinct user_id) filter (where status = 'in_progress'),
    'avg_rating',   round(avg(rating)::numeric, 1),
    'rating_count', count(rating)
  )
  from web_entries
  where external_source = p_source
    and external_id = p_ext
    and user_id <> auth.uid()
    and coalesce(is_private, false) = false;
$function$;

revoke all on function public.community_stats(text, text) from public, anon;
grant execute on function public.community_stats(text, text) to authenticated;
