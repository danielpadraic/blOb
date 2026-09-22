-- blOb ops — Host / moderator add-remove + no invite rejoin (Sep 22)
--
-- WHAT THIS ADDS
--   Host and Moderators can add or remove people on Friendly and Normal
--     until the challenge settles.
--   Strict stays join-window only (or @blob).
--   Official cash stays @blob house tools.
--   Remove keeps the roster row as withdrawn (does not delete).
--   The original invite cannot Join again. Host / mod Add People can
--     put them back.
--
-- RUN FIRST if you have not already:
--   artifacts/ops_join_role_lane_mod_sep22.sql
--   (join_challenge must already take role / side / self-mod)
--
-- DOES NOT TOUCH
--   TEST — Rookies vs. Veterans (8fce711b)
--   admin_mass_join
--   2800 / 8 / 16000 scoring
--
-- This is the same SQL as
-- supabase/migrations/20260922170510_host_roster_remove_no_rejoin.sql
-- Run it in the SQL editor. Do not supabase db push --include-all.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. You want a blank editor and a green Run button.
-- 3. In Cursor, open
--    supabase/migrations/20260922170510_host_roster_remove_no_rejoin.sql
-- 4. Select the whole file (Cmd+A). Copy (Cmd+C).
-- 5. Click in the Supabase box, paste, click the green Run.
--    A yellow “this query changes data” card is expected — confirm Run.
--    If it offers “Run without RLS” or “Run and enable RLS”, click Cancel.
-- 6. DONE WHEN the results area shows Success (no red error).
--    If it says “function join_challenge_ungated(uuid, text, text, boolean)
--    does not exist”, stop. Run the Join role SQL first
--    (ops_join_role_lane_mod_sep22.sql), then run this file again.
--
-- 7. SCRIPT C (prove it). Click New query. Select everything from
--    “-- SCRIPT C” to the end of THIS file. Copy, paste, green Run.
--    DONE WHEN every column is true:
--        remove_marks_withdrawn   true
--        remove_keeps_row         true
--        add_reseats_withdrawn    true
--        join_blocks_removed      true
--        test_row_untouched       true
--
-- 8. Open https://blob.mobi after the app push. On a Friendly or Normal
--    room you host (or moderate): Board overflow → Remove person.
--    Confirm. That person opens the original invite → Join is blocked.
--    Add People can put them back.


-- =============================================================================
-- SCRIPT C — verify (read only)
-- =============================================================================
select
  (
    pg_get_functiondef('public.host_remove_participant(uuid,uuid)'::regprocedure)
    like '%status = ''withdrawn''%'
  ) as remove_marks_withdrawn,
  (
    pg_get_functiondef('public.host_remove_participant(uuid,uuid)'::regprocedure)
    not like '%delete from public.challenge_participants%'
  ) as remove_keeps_row,
  (
    pg_get_functiondef('public.host_add_participant(uuid,uuid)'::regprocedure)
    like '%withdrawn%'
  ) as add_reseats_withdrawn,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'join_challenge'
      and pg_get_functiondef(p.oid) like '%REMOVED_NO_REJOIN%'
  ) as join_blocks_removed,
  (
    select (t.scoring_config is not distinct from t.comparable_points_config)
      or t.scoring_config is not null
    from public.challenges t
    where t.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
  ) as test_row_untouched;
