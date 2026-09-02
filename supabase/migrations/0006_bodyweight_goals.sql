-- Bodyweight as something you can set a goal against.
--
-- Bodyweight was already captured on every workout but there was no way to aim
-- at a number, so the one measure people most often have a target for was the
-- one metric goals couldn't express.
--
-- Two metrics rather than one, because bodyweight is the only measure here whose
-- direction isn't fixed by the metric itself: "get down to 175" and "get up to
-- 200" are both reaching a bodyweight, and they succeed on opposite comparisons.
-- Every other metric is unambiguous (heavier lift, more reps, faster pace), and
-- inferring the direction from whichever side of the target you happened to start
-- on would silently do the wrong thing for anyone who overshoots and comes back.
--
--   bodyweight_at_most  -- met when a reading is <= target (cutting)
--   bodyweight_at_least -- met when a reading is >= target (bulking)
--
-- Neither takes an exercise; like workout_count they measure the whole practice.
alter table public.web_goals drop constraint if exists web_goals_metric_check;

alter table public.web_goals add constraint web_goals_metric_check
  check (metric in (
    'weight', 'e1rm', 'reps', 'seconds', 'distance', 'pace',
    'workout_count', 'manual',
    'bodyweight_at_most', 'bodyweight_at_least'
  ));
