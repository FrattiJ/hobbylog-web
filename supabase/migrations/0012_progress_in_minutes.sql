-- Movies and audiobooks: progress is minutes, not a percent.
--
-- Both hobbies stored their length in progress_total as minutes, but
-- progress_current was declared a 0-100 percent. The save path had already
-- drifted to writing minutes (completing an entry fills current up to total),
-- so the column held both units at once and every progress bar divided a
-- percent by a runtime -- a finished 283-minute audiobook read as 35%.
--
-- Minutes wins: it is what the totals, the newer rows and the catalogue all
-- speak, and a percent can always be derived from it.

begin;

-- Reversal copy of every row this migration can touch.
create table if not exists web_entries_progress_backup_20261110 as
select id, title, hobby_category, book_subtype, status, progress_current, progress_total,
       metadata->>'audio_runtime_min' as audio_runtime_min, now() as backed_up_at
from web_entries
where hobby_category = 'movies' or (hobby_category = 'books' and book_subtype = 'audiobook');

-- 1. Audible answers in minutes; the old page-count estimate (~26 pg/hr) was
--    applied to it anyway and inflated these runtimes by ~2.3x. The real
--    runtime is already on the row.
update web_entries
set progress_total = (metadata->>'audio_runtime_min')::numeric
where hobby_category = 'books' and book_subtype = 'audiobook'
  and metadata ? 'audio_runtime_min'
  and progress_total is distinct from (metadata->>'audio_runtime_min')::numeric;

-- 2. A finished film or audiobook sits at exactly its full runtime -- there is
--    no watching one 150% of the way through, so this corrects the stale 100s
--    upward and the inflated runtimes of step 1 back down.
update web_entries
set progress_current = progress_total
where (hobby_category = 'movies' or (hobby_category = 'books' and book_subtype = 'audiobook'))
  and status = 'completed'
  and progress_total is not null
  and progress_current is distinct from progress_total;

commit;

-- To undo:
--   update web_entries e set progress_current = b.progress_current,
--                            progress_total   = b.progress_total
--   from web_entries_progress_backup_20261110 b where b.id = e.id;
