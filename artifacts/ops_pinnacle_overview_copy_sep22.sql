-- blOb ops — LIVE "Rookies vs. Veterans" Overview description + rules (Sep 22)
--
-- WHAT THIS FIXES
-- The live row already has description and rules, but they are leftover Dial
-- instructions, not the Overview copy. This writes only those two columns.
-- scoring_config is not touched. TEST is not touched.
--
-- TOUCHES EXACTLY ONE ROW
--   id    = 16af3e82-15c0-479f-af52-328440b0c87e
--   title = 'Rookies vs. Veterans'
--
-- This is a data fix. It is NOT a migration. Do not run supabase db push.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. You want a blank editor with a green Run button.
--
-- 3. SCRIPT A (look before you touch). In Cursor, select everything from
--    "-- SCRIPT A" down to the line just above "-- SCRIPT B". Copy it. Click in
--    the Supabase box, paste, click the green Run.
--    DONE WHEN you see one row. description and rules may still be the old
--    Dial instructions. test_row_title must be 'TEST — Rookies vs. Veterans'.
--    If description already starts with "Compete in the Pinnacle Core", STOP.
--    Someone already wrote the new copy. Do not run Script B.
--
-- 4. SCRIPT B (the write). Click "New query". Select from "-- SCRIPT B" down
--    to the line just above "-- SCRIPT C". Copy, paste, green Run.
--    DONE WHEN rows_updated is 1.
--    If it is 0, stop. If it is 2 or more, stop immediately.
--    A yellow "this query changes data" card is expected — confirm Run.
--    If it offers "Run without RLS" or "Run and enable RLS", click Cancel.
--
-- 5. SCRIPT C (prove it). Click "New query". Select from "-- SCRIPT C" to the
--    end. Copy, paste, green Run.
--    DONE WHEN:
--        live_has_locked_copy   true
--        scoring_untouched      true
--        test_row_untouched     true
--
-- 6. Open https://blob.mobi/challenges/16af3e82-15c0-479f-af52-328440b0c87e
--    as @danielharder. Hold Shift and click reload.


-- =============================================================================
-- SCRIPT A — preview (read only, changes nothing)
-- =============================================================================
select
  c.id,
  c.title,
  left(c.description, 80) as description_start,
  left(c.rules, 80) as rules_start,
  (c.scoring_config->>'parity_points')::numeric as parity_points,
  t.title as test_row_title
from public.challenges c
left join public.challenges t
  on t.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
where c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
  and c.title = 'Rookies vs. Veterans';


-- =============================================================================
-- SCRIPT B — the write (exactly one row, description + rules only)
-- =============================================================================
with applied as (
  update public.challenges c
     set description = 'Compete in the Pinnacle Core September Rookies vs. Veterans Challenge',
         rules = 'Team with the most points is winner of September Rookies vs. Veterans.' || E'\n'
              || 'Overall High Scorer wins the Prize (see KC for Prize details)!',
         updated_at = now()
   where c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
     and c.title = 'Rookies vs. Veterans'
  returning c.id
)
select count(*) as rows_updated from applied;


-- =============================================================================
-- SCRIPT C — verify (read only, changes nothing)
-- =============================================================================
select
  (c.description = 'Compete in the Pinnacle Core September Rookies vs. Veterans Challenge'
   and c.rules like 'Team with the most points is winner of September Rookies vs. Veterans.%'
   and c.rules like '%Overall High Scorer wins the Prize (see KC for Prize details)!') as live_has_locked_copy,
  ((c.scoring_config->>'parity_points')::numeric in (13000, 16000)) as scoring_untouched,
  (t.description is distinct from c.description
   and t.rules is distinct from c.rules
   and t.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05') as test_row_untouched
from public.challenges c
join public.challenges t
  on t.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
where c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
  and c.title = 'Rookies vs. Veterans';
