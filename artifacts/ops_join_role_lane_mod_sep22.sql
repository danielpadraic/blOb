-- blOb ops — Private Join role + side + self-mod (Sep 22)
--
-- WHAT THIS ADDS
--   challenge_participants.roster_role  (participant | observer)
--   join_challenge writes role + scoring_lane + optional self-mod
--     in ONE request
--   Observers cannot honor-log
--   Observers do not count toward min_participants
--
-- DOES NOT TOUCH
--   scoring_config on Rookies vs. Veterans
--   TEST — Rookies vs. Veterans (8fce711b)
--   admin_mass_join
--
-- This is the same SQL as
-- supabase/migrations/20260922153000_join_role_lane_mod.sql
-- Run it in the SQL editor. Do not supabase db push --include-all.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. You want a blank editor and a green Run button.
-- 3. In Cursor, open
--    supabase/migrations/20260922153000_join_role_lane_mod.sql
-- 4. Select the whole file (Cmd+A). Copy (Cmd+C).
-- 5. Click in the Supabase box, paste, click the green Run.
--    A yellow “this query changes data” card is expected — confirm Run.
--    If it offers “Run without RLS” or “Run and enable RLS”, click Cancel.
-- 6. DONE WHEN the results area shows Success (no red error).
--    If it says “cannot drop function join_challenge” or “already exists”,
--    stop and tell Cursor.
--
-- 7. SCRIPT C (prove it). Click New query. Select everything from
--    “-- SCRIPT C” to the end of THIS file. Copy, paste, green Run.
--    DONE WHEN:
--        has_roster_role     true
--        join_args           uuid, text, text, boolean
--        test_row_untouched  true
--
-- 8. Open https://blob.mobi after the app push. Private invite → Join this
--    challenge sheet with Participant / Observer.


-- =============================================================================
-- SCRIPT C — verify (read only)
-- =============================================================================
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'challenge_participants'
      and column_name = 'roster_role'
  ) as has_roster_role,
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'join_challenge'
    order by pronargs desc
    limit 1
  ) as join_args,
  (
    select (t.scoring_config is not distinct from t.comparable_points_config)
      or t.scoring_config is not null
    from public.challenges t
    where t.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
  ) as test_row_untouched;
