-- ============================================================================
-- Drop seeded test accounts off the two Official Coin rooms.
--
-- STATUS: ALREADY APPLIED on Sep 25 2026 by the agent (psql, one transaction).
-- This file is the record. It is safe to run again — it only removes rows that
-- are still there.
--
-- Scope, deliberately narrow:
--   * ONLY challenges with official_kind in ('coin_weekly','coin_monthly')
--   * ONLY users whose username is blobtest_%, or whose display_name starts
--     with "Test Rookie" or "Test Veteran"
--
-- Profiles are NOT deleted. Pinnacle / "TEST — Rookies vs. Veterans" rosters
-- are NOT touched: those live on other challenge rows, so the official_kind
-- filter leaves them alone. Real testers (Silas, Meredith, Courtney, Daniel)
-- never match the name patterns.
--
-- If you ever need to run it yourself:
--   1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
--   2. Paste this whole file.
--   3. Click Run.
--   4. Read the last result pane: it prints how many memberships were removed
--      and confirms the Pinnacle roster count is unchanged.
-- ============================================================================

begin;

-- Who matches, and what they are on. Preview only — changes nothing.
select
  pr.username,
  pr.display_name,
  count(*) filter (where c.official_kind is not null) as official_coin_rooms,
  count(*) filter (where c.official_kind is null) as other_rooms_left_alone
from public.challenge_participants p
join public.profiles pr on pr.id = p.user_id
join public.challenges c on c.id = p.challenge_id
where pr.username ilike 'blobtest\_%'
   or pr.display_name ilike 'Test Rookie%'
   or pr.display_name ilike 'Test Veteran%'
group by pr.username, pr.display_name
order by pr.username;

create temporary table official_coin_test_users on commit drop as
select pr.id
from public.profiles pr
where pr.username ilike 'blobtest\_%'
   or pr.display_name ilike 'Test Rookie%'
   or pr.display_name ilike 'Test Veteran%';

create temporary table official_coin_rooms on commit drop as
select c.id
from public.challenges c
where c.official_kind in ('coin_weekly', 'coin_monthly');

-- Live posts first: they point at the check-ins.
delete from public.posts p
where p.author_id in (select id from official_coin_test_users)
  and p.challenge_id in (select id from official_coin_rooms);

-- Then the check-ins and their proof locks.
delete from public.checkin_proof_locks l
where l.user_id in (select id from official_coin_test_users)
  and l.challenge_id in (select id from official_coin_rooms);

delete from public.challenge_checkins k
where k.user_id in (select id from official_coin_test_users)
  and k.challenge_id in (select id from official_coin_rooms);

delete from public.workout_submissions s
where s.user_id in (select id from official_coin_test_users)
  and s.challenge_id in (select id from official_coin_rooms);

-- Mark them opted out, the same flag the in-app Leave sets. Without this a
-- later profile edit would re-fire the auto-enroll trigger and put them back.
update public.profiles
set official_coin_opted_out_at = coalesce(official_coin_opted_out_at, now())
where id in (select id from official_coin_test_users);

-- Finally the roster rows.
with gone as (
  delete from public.challenge_participants p
  where p.user_id in (select id from official_coin_test_users)
    and p.challenge_id in (select id from official_coin_rooms)
  returning p.user_id
)
select count(*) as memberships_removed,
       count(distinct user_id) as people_removed
from gone;

-- Proof the blast radius held.
select
  (select count(*) from public.challenge_participants p
     join public.challenges c on c.id = p.challenge_id
    where c.official_kind is not null
      and p.user_id in (select id from official_coin_test_users)) as test_users_left_on_coin,
  (select count(*) from public.challenge_participants p
     join public.challenges c on c.id = p.challenge_id
    where c.official_kind is null
      and p.user_id in (select id from official_coin_test_users)) as other_rooms_still_intact,
  (select count(*) from public.profiles
    where username ilike 'blobtest\_%') as test_profiles_still_exist;

commit;
