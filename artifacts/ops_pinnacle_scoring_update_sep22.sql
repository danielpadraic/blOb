-- blOb ops — LIVE "Rookies vs. Veterans" scoring parity update (Sep 22)
--
-- WHAT THIS FIXES
-- Today the live row scores a Rookie with 2,800 dials and 8 presentations as
-- 8,320 points. It must be 16,000. The row still holds the old numbers
-- (3,500 dials / 13,000 points / $13,000 AP), so the mechanics sentence on
-- Overview and Board still reads $13,000, and presentations above 8 still
-- raise the dial rate.
--
-- AFTER THIS RUNS
--   Rookie, 2,800 dials with 8 presentations ....... 16,000 points
--   $16,000 of AP .................................. 16,000 points
--   9th / 10th presentation ........................ does NOT raise the dial
--                                                    rate (still counted and
--                                                    still shown on the Board)
--   Rookie ......................................... Dials (x Presentations) + AP
--   Veteran ........................................ AP only, dials add 0
--
-- TOUCHES EXACTLY ONE ROW
--   id    = 16af3e82-15c0-479f-af52-328440b0c87e
--   title = 'Rookies vs. Veterans'
-- Script B is guarded on BOTH of those, so it can never hit
-- 'TEST — Rookies vs. Veterans' (8fce711b-03a5-45e5-b5e8-272c6b3e9a05).
--
-- Lanes, lane_ids, activity ids, names, units, input_kind, qualifiers, and the
-- Details text field are carried over untouched. Only three things change:
-- parity_points, the two parity_qty values, and the presentation tier table.
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
--    DONE WHEN you see one row of results reading:
--        parity_points        13000
--        dials_parity_qty     3500
--        ap_parity_qty        13000
--        rookie_2800_8        8320       <- the number we are fixing
--        ap_16000             16000
--        rookie_2800_10       10400
--        veteran_dials        0
--    If rookie_2800_8 already says 16000, STOP. Someone already fixed it.
--    Tell Cursor and do not run Script B.
--
-- 4. SCRIPT B (the fix). Click "New query" for a clean empty box. In Cursor,
--    select everything from "-- SCRIPT B" down to the line just above
--    "-- SCRIPT C". Copy, paste, click the green Run.
--    DONE WHEN the results area shows ONE row and the column
--    rows_updated says 1.
--    If rows_updated says 0, the row moved or was renamed. Stop and tell Cursor.
--    If rows_updated says 2 or more, stop immediately and tell Cursor.
--    If Supabase pops a yellow "Potential issues" card saying this query
--    changes data: that is expected, Script B is meant to write. Click the
--    confirm / Run button on that card.
--    If that card instead offers "Run without RLS" or "Run and enable RLS",
--    something is wrong — click Cancel and tell Cursor.
--
-- 5. SCRIPT C (prove it). Click "New query" again. Select everything from
--    "-- SCRIPT C" to the end of this file. Copy, paste, green Run.
--    DONE WHEN the single row reads:
--        rookie_2800_8        16000
--        ap_16000             16000
--        pres10_eq_pres8      true
--        veteran_dials        0
--        sentence_has_13000   false
--        test_row_untouched   true
--    Any other value: stop and tell Cursor. Do not run anything else.
--
-- 6. Open https://blob.mobi/challenges/16af3e82-15c0-479f-af52-328440b0c87e
--    Sign in as @danielharder. Hard-refresh the page (hold Shift and click the
--    reload arrow). The mechanics line must now read:
--    "2,800 Dials with 8 Presentations equals 16,000 points, and $16,000 of AP
--    equals 16,000 points."
--    If you still see 3,500 or $13,000, refresh once more — the old page was
--    cached.
--
-- Do not run Script B twice. It is safe to re-run (it sets absolute values,
-- not increments), but there is no reason to.


-- =============================================================================
-- SCRIPT A — preview (read only, changes nothing)
-- =============================================================================
with live as (
  select coalesce(c.scoring_config, c.comparable_points_config, '{}'::jsonb) as cfg
  from public.challenges c
  where c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
    and c.title = 'Rookies vs. Veterans'
),
acts as (
  select
    (select a from jsonb_array_elements(cfg->'activities') a where a->>'id' = 'act-dials') as dials,
    (select a from jsonb_array_elements(cfg->'activities') a where a->>'id' = 'act-ap') as ap,
    cfg
  from live
)
select
  (cfg->>'parity_points')::numeric as parity_points,
  (dials->>'parity_qty')::numeric as dials_parity_qty,
  (ap->>'parity_qty')::numeric as ap_parity_qty,
  public.comparable_score_window(
    cfg, jsonb_build_object('act-dials', 2800, 'multiplier:presentations', 8, 'act-ap', 0), 'rookie'
  ) as rookie_2800_8,
  public.comparable_score_window(
    cfg, jsonb_build_object('act-dials', 0, 'multiplier:presentations', 0, 'act-ap', 16000), 'rookie'
  ) as ap_16000,
  public.comparable_score_window(
    cfg, jsonb_build_object('act-dials', 2800, 'multiplier:presentations', 10, 'act-ap', 0), 'rookie'
  ) as rookie_2800_10,
  public.comparable_score_window(
    cfg, jsonb_build_object('act-dials', 2800, 'multiplier:presentations', 8, 'act-ap', 0), 'veteran'
  ) as veteran_dials,
  (
    select string_agg(
      (t->>'threshold') || ' pres = ' || (t->>'percent') || '%',
      '  |  ' order by (t->>'threshold')::numeric
    )
    from jsonb_array_elements(dials#>'{multiplier,tiers}') t
  ) as current_tier_table
from acts;


-- =============================================================================
-- SCRIPT B — the fix (writes exactly one row)
-- =============================================================================
with next_config as (
  select
    c.id,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(c.scoring_config, c.comparable_points_config, '{}'::jsonb),
          '{parity_points}', to_jsonb(16000)
        ),
        '{extras_keep_adding}', to_jsonb(true)
      ),
      '{activities}',
      (
        select jsonb_agg(
          case
            -- Dials: 2,800 is the new parity. Tier table stops at 8 = 100%, so a
            -- 9th or 10th presentation no longer raises the dial rate.
            when a->>'id' = 'act-dials' then
              jsonb_set(
                jsonb_set(a, '{parity_qty}', to_jsonb(2800)),
                '{multiplier,tiers}',
                '[{"threshold":0,"percent":0},
                  {"threshold":1,"percent":12.5},
                  {"threshold":2,"percent":25},
                  {"threshold":3,"percent":37.5},
                  {"threshold":4,"percent":50},
                  {"threshold":5,"percent":62.5},
                  {"threshold":6,"percent":75},
                  {"threshold":7,"percent":87.5},
                  {"threshold":8,"percent":100}]'::jsonb
              )
            -- AP: $16,000 parity against 16,000 parity points, so $1 = 1 point.
            when a->>'id' = 'act-ap' then
              jsonb_set(a, '{parity_qty}', to_jsonb(16000))
            else a
          end
          order by ord
        )
        from jsonb_array_elements(
               coalesce(c.scoring_config, c.comparable_points_config, '{}'::jsonb)->'activities'
             ) with ordinality as t(a, ord)
      )
    ) as cfg
  from public.challenges c
  where c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
    and c.title = 'Rookies vs. Veterans'
),
applied as (
  update public.challenges c
     set scoring_config = n.cfg,
         comparable_points_config = n.cfg,
         updated_at = now()
    from next_config n
   where c.id = n.id
     and c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
     and c.title = 'Rookies vs. Veterans'
  returning c.id
)
select count(*) as rows_updated from applied;


-- =============================================================================
-- SCRIPT C — verify (read only, changes nothing)
-- =============================================================================
with live as (
  select coalesce(c.scoring_config, c.comparable_points_config, '{}'::jsonb) as cfg
  from public.challenges c
  where c.id = '16af3e82-15c0-479f-af52-328440b0c87e'
    and c.title = 'Rookies vs. Veterans'
),
scored as (
  select
    cfg,
    public.comparable_score_window(
      cfg, jsonb_build_object('act-dials', 2800, 'multiplier:presentations', 8, 'act-ap', 0), 'rookie'
    ) as rookie_2800_8,
    public.comparable_score_window(
      cfg, jsonb_build_object('act-dials', 0, 'multiplier:presentations', 0, 'act-ap', 16000), 'rookie'
    ) as ap_16000,
    public.comparable_score_window(
      cfg, jsonb_build_object('act-dials', 2800, 'multiplier:presentations', 10, 'act-ap', 0), 'rookie'
    ) as rookie_2800_10,
    public.comparable_score_window(
      cfg, jsonb_build_object('act-dials', 2800, 'multiplier:presentations', 8, 'act-ap', 0), 'veteran'
    ) as veteran_dials,
    public.comparable_score_window(
      cfg, jsonb_build_object('act-dials', 5600, 'multiplier:presentations', 8, 'act-ap', 0), 'rookie'
    ) as rookie_double_dials
  from live
)
select
  rookie_2800_8,
  ap_16000,
  (rookie_2800_10 = rookie_2800_8) as pres10_eq_pres8,
  veteran_dials,
  (cfg::text ~ '13000|13,000|3500|3,500') as sentence_has_13000,
  (rookie_double_dials = 32000) as extras_keep_adding,
  (
    select (a->>'parity_qty')::numeric
    from jsonb_array_elements(cfg->'activities') a where a->>'id' = 'act-dials'
  ) as dials_parity_qty,
  (
    select (a->>'parity_qty')::numeric
    from jsonb_array_elements(cfg->'activities') a where a->>'id' = 'act-ap'
  ) as ap_parity_qty,
  (
    select jsonb_array_length(cfg->'lanes')
  ) as lanes_still_two,
  (
    select public.comparable_score_window(
      coalesce(t.scoring_config, t.comparable_points_config, '{}'::jsonb),
      jsonb_build_object('act-dials', 3500, 'multiplier:presentations', 10, 'act-ap', 0),
      'rookie'
    ) = 13000
    from public.challenges t
    where t.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
  ) as test_row_untouched
from scored;
