-- blOb ops — Seat @danielharder as Rookie participant on LIVE Pinnacle
-- “Rookies vs. Veterans” (Sep 22)
--
-- WHAT THIS DOES
--   Adds the host (username danielharder) as one PARTICIPANT on the
--   live private_corporate room, scoring_lane = rookie.
--   $0 buy-in. No wallet debit. No Home / public join post.
--   No second roster row. No fake honor log.
--
-- TARGET
--   title = 'Rookies vs. Veterans'
--   privacy_mode = private_corporate
--   status = live
--   NOT 'TEST — Rookies vs. Veterans'
--   NOT 8fce711b
--   Live starts_at is 2026-09-22 00:00 America/Chicago
--     (2026-09-22 05:00+00). The 2026-09-21 00:00 Chicago clock
--     belongs to the TEST clone — do not use that clock to pick.
--
-- LIVE COLUMNS WRITTEN
--   challenge_participants:
--     challenge_id, user_id, status, joined_at, eliminated_at,
--     buy_in_paid, roster_role, scoring_lane
--   No role / participant_role / lane / side / team columns exist.
--   No honor log for this user — Side is scoring_lane only.
--
-- DOES NOT TOUCH
--   TEST — Rookies vs. Veterans (8fce711b)
--   Rookies vs. Rockstars
--   admin_mass_join
--   wallets / prize_pool
--   posts
--
-- Do not supabase db push --include-all.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- Cursor already ran SCRIPT B on the live database. You only need
-- SCRIPT C if you want to see the proof yourself.
--
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. You want a blank editor and a green Run button.
-- 3. In Cursor, open
--    artifacts/ops_pinnacle_add_danielharder_rookie.sql
-- 4. SCRIPT C only: select from “-- SCRIPT C” to the end. Copy (Cmd+C).
-- 5. Click in the Supabase box, paste, click the green Run.
--    If it offers “Run without RLS” or “Run and enable RLS”, click Cancel.
-- 6. DONE WHEN you see one row:
--        challenge_id                 16af3e82-15c0-479f-af52-328440b0c87e
--        username                     danielharder
--        status                       active
--        roster_role                  participant
--        scoring_lane                 rookie
--        roster_rows_for_daniel       1
--        test_clone_participants      15
--        test_row_untouched           true
-- 7. Open https://blob.mobi → Rookies vs. Veterans → Board.
--    Daniel Harder should be on the Rookie side at 0 pts.
--
-- If Cursor did not apply SCRIPT B, run A then B then C the same way
-- (New query each time). A yellow “this query changes data” card on B
-- is expected — confirm Run.


-- =============================================================================
-- SCRIPT A — preview (read only)
-- =============================================================================
with target as (
  select c.id, c.title, c.status, c.starts_at, c.privacy_mode, c.created_by,
         c.buy_in_amount, c.prize_pool
  from public.challenges c
  where c.title = 'Rookies vs. Veterans'
    and c.title <> 'TEST — Rookies vs. Veterans'
    and c.privacy_mode = 'private_corporate'
    and c.id <> '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
    and c.status = 'live'
), who as (
  select p.id, p.username, p.display_name
  from public.profiles p
  where lower(p.username) = 'danielharder'
)
select
  (select count(*) from target) as challenge_hits,
  (select t.id from target t) as challenge_id,
  (select t.title from target t) as title,
  (select t.status from target t) as status,
  (select t.starts_at from target t) as starts_at,
  (select t.privacy_mode from target t) as privacy_mode,
  (select t.buy_in_amount from target t) as buy_in,
  (select t.prize_pool from target t) as prize,
  (select count(*) from who) as user_hits,
  (select w.username from who w) as username,
  (select w.display_name from who w) as display_name,
  (
    select count(*)
    from public.challenge_participants p
    join target t on t.id = p.challenge_id
    join who w on w.id = p.user_id
  ) as existing_roster_rows,
  (
    select count(*)
    from public.challenge_checkins ck
    join target t on t.id = ck.challenge_id
    join who w on w.id = ck.user_id
  ) as existing_checkins,
  (
    select count(*)
    from public.challenge_participants p
    where p.challenge_id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
  ) as test_clone_participants;


-- =============================================================================
-- SCRIPT B — apply (one user, one room)
-- =============================================================================
with target as (
  select c.id
  from public.challenges c
  where c.title = 'Rookies vs. Veterans'
    and c.title <> 'TEST — Rookies vs. Veterans'
    and c.privacy_mode = 'private_corporate'
    and c.id <> '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
    and c.status = 'live'
    and coalesce(c.buy_in_amount, 0) = 0
), who as (
  select p.id
  from public.profiles p
  where lower(p.username) = 'danielharder'
), locked as (
  select t.id as challenge_id, w.id as user_id
  from target t
  cross join who w
  where (select count(*) from target) = 1
    and (select count(*) from who) = 1
), updated as (
  update public.challenge_participants p
    set status = 'active',
        eliminated_at = null,
        roster_role = 'participant',
        scoring_lane = 'rookie'
  from locked l
  where p.challenge_id = l.challenge_id
    and p.user_id = l.user_id
  returning p.challenge_id, p.user_id, p.status, p.roster_role, p.scoring_lane, p.buy_in_paid
), inserted as (
  insert into public.challenge_participants (
    challenge_id,
    user_id,
    status,
    joined_at,
    eliminated_at,
    buy_in_paid,
    roster_role,
    scoring_lane
  )
  select
    l.challenge_id,
    l.user_id,
    'active',
    now(),
    null,
    0,
    'participant',
    'rookie'
  from locked l
  where not exists (
    select 1
    from public.challenge_participants p
    where p.challenge_id = l.challenge_id
      and p.user_id = l.user_id
  )
  returning challenge_id, user_id, status, roster_role, scoring_lane, buy_in_paid
)
select * from updated
union all
select * from inserted;


-- =============================================================================
-- SCRIPT C — confirm (read only)
-- =============================================================================
select
  p.challenge_id,
  pr.username,
  pr.display_name,
  p.status,
  p.roster_role,
  p.scoring_lane,
  p.buy_in_paid,
  p.points,
  p.eliminated_at,
  (
    select count(*)
    from public.challenge_participants x
    where x.challenge_id = p.challenge_id
      and x.user_id = p.user_id
  ) as roster_rows_for_daniel,
  (
    select count(*)
    from public.challenge_participants x
    where x.challenge_id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
  ) as test_clone_participants,
  (
    select c.title = 'TEST — Rookies vs. Veterans'
    from public.challenges c
    where c.id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
  ) as test_row_untouched
from public.challenge_participants p
join public.profiles pr on pr.id = p.user_id
join public.challenges c on c.id = p.challenge_id
where lower(pr.username) = 'danielharder'
  and c.title = 'Rookies vs. Veterans'
  and c.title <> 'TEST — Rookies vs. Veterans'
  and c.privacy_mode = 'private_corporate'
  and c.id <> '8fce711b-03a5-45e5-b5e8-272c6b3e9a05';
