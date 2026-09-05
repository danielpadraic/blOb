-- blOb workout session readout
--
-- Paste either query into the Supabase SQL Editor for project blOb-app (ref tguzdtwsajnnczdxjqyq).
-- Both views honour row-level security, so run them as the service role / SQL Editor to see every
-- user. A signed-in app user running the same view sees only their own sessions.
--
-- These are for operator audit only. Do not build a public leaderboard from them.


-- 1. Per-user totals: who is logging workouts, and whether the numbers came from HealthKit or OCR.
select
  username,
  display_name,
  session_count,
  total_duration_sec,
  round(total_duration_sec / 3600.0, 1) as total_hours,
  total_active_kcal,
  total_distance_m,
  round(total_distance_m / 1609.344, 1) as total_miles,
  sessions_from_healthkit,
  sessions_from_ocr,
  first_session,
  last_session
from public.ops_user_workout_totals
order by session_count desc, last_session desc;


-- 2. One row per session, for auditing a specific check-in or a suspicious read.
-- ocr_confidence is the fraction of the five headline fields the parser found; a low number on an
-- ocr row is the first thing to look at when a chip looks wrong.
select
  username,
  display_name,
  challenge_title,
  session_at,
  source,
  activity_label,
  duration_sec,
  round(duration_sec / 60.0) as minutes,
  active_kcal,
  hr_avg,
  hr_max,
  distance_m,
  ocr_confidence,
  backfilled,
  proof_url
from public.ops_user_workout_sessions
order by session_at desc nulls last;


-- 3. Backfill health check: rows the OCR job looked at but could not read, with the reason.
-- Expect 'not_a_workout_screen' for selfies that slipped into an HR slot.
select
  ocr_skip_reason,
  count(*) as sessions
from public.workout_sessions
where source = 'ocr'
  and ocr_skip_reason is not null
group by ocr_skip_reason
order by sessions desc;
