-- blOb ops seed — one Private Corporate Comparable Points row
-- This is DATA only. It does not add a special screen.
--
-- PREREQUISITE: scoring functions from commit 4fd4e40 must already have been Run
-- (supabase/migrations/20260921134441_comparable_points_window_score.sql).
-- If those functions are missing, this row still inserts, but Board points stay 0.
--
-- Host is profiles.username = danielharder (created_by only). Do not use
-- danielpadraic@gmail.com — that login is Official @blob, a different account.
-- Do NOT run admin_mass_join.
-- Do NOT join username danielharder as a contestant.
-- Do NOT UPDATE the older "Rookies vs. Rockstars" row.
-- SCRIPT B no-ops if title = 'Rookies vs. Veterans' AND starts_at = 2026-09-21 00:00:00-05 already exists.
--
-- Operator clicks (Daniel — not a programmer)
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if asked.
-- 3. You should see a blank editor and a green Run button.
-- 4. SCRIPT A first: select only the block under "SCRIPT A" (the SELECT). Click Run.
--    Done when the grid shows host_username = danielharder and scoring_functions_ready = true.
--    gmail_login_is_a_different_account = true is expected. Do not host as that Gmail.
--    If host_found = false, stop. If scoring_functions_ready = false, paste and Run the
--    4fd4e40 scoring SQL first, then come back.
--    The older Rockstars row (if listed) must stay untouched.
-- 5. SCRIPT B next: clear the box. Paste only the block under "SCRIPT B". Click Run.
--    Done when it says Success. If it says ALREADY_EXISTS, leave it — do not run B again
--    to "fix" anything.
--    If you see HOST_MISSING, stop.
--    If you see permission denied for session_replication_role, you have an old SCRIPT B.
--    Copy SCRIPT B from this file again (it no longer sets that).
--    If you see Permission denied on the table, the URL must include tguzdtwsajnnczdxjqyq.
-- 6. SCRIPT C last: clear the box. Paste only the block under "SCRIPT C". Click Run.
--    Done when the grid shows a NEW uuid, title Rookies vs. Veterans, host_username
--    = danielharder, scoring_method comparable_points, and host_on_board = false.
--    The second grid is older Rookies /
--    Rockstars rows — those titles and start times must match SCRIPT A.
-- 7. Open the challenge_url from SCRIPT C on https://blob.mobi after Vercel Ready.
--    You must be signed in as danielharder (or someone House-added).
--
-- Same file lives at supabase/seeds/ops_pinnacle_rookies_veterans_sep21.sql


-- =============================================================================
-- SCRIPT A — preview (read only)
-- =============================================================================
select
  p.id as host_id,
  p.username as host_username,
  u.email as host_email,
  (p.id is not null) as host_found,
  exists(
    select 1
    from auth.users au
    join public.profiles bp on bp.id = au.id
    where lower(au.email) = 'danielpadraic@gmail.com'
      and lower(bp.username) is distinct from 'danielharder'
  ) as gmail_login_is_a_different_account,
  (
    to_regprocedure('public.comparable_score_window(jsonb, jsonb)') is not null
    and to_regprocedure('public.apply_comparable_points(uuid, uuid, uuid)') is not null
    and to_regprocedure('public.save_checkin_metric_values(uuid, jsonb, text, jsonb)') is not null
  ) as scoring_functions_ready,
  exists(
    select 1
    from public.challenges
    where title = 'Rookies vs. Veterans'
      and starts_at = timestamptz '2026-09-21 00:00:00-05'
  ) as this_row_already_exists
from (select 1) as seed
left join public.profiles p on lower(p.username) = 'danielharder'
left join auth.users u on u.id = p.id;

select
  id,
  title,
  starts_at,
  status,
  scoring_method
from public.challenges
where title ilike '%rookie%'
   or title ilike '%rockstar%'
   or title ilike '%veteran%'
order by created_at;


-- =============================================================================
-- SCRIPT B — insert if missing
-- =============================================================================
do $ops$
declare
  v_host uuid;
  v_id uuid;
  v_title text := 'Rookies vs. Veterans';
  v_starts timestamptz := timestamptz '2026-09-21 00:00:00-05';
  v_ends timestamptz := timestamptz '2026-09-25 23:59:59-05';
  v_config jsonb := $cfg${
  "version": 1,
  "parity_points": 13000,
  "window": "challenge",
  "extras_keep_adding": true,
  "activities": [
    {
      "id": "act-dials",
      "name": "Dials",
      "unit": "dials",
      "input_kind": "count",
      "parity_qty": 3500,
      "multiplier": {
        "enabled": true,
        "extra_factor": 1,
        "label": "Presentations",
        "tiers": [
          {"threshold": 0, "percent": 0},
          {"threshold": 1, "percent": 10},
          {"threshold": 2, "percent": 20},
          {"threshold": 3, "percent": 30},
          {"threshold": 4, "percent": 40},
          {"threshold": 5, "percent": 50},
          {"threshold": 6, "percent": 60},
          {"threshold": 7, "percent": 70},
          {"threshold": 8, "percent": 80},
          {"threshold": 9, "percent": 90},
          {"threshold": 10, "percent": 100}
        ]
      },
      "qualifiers": {"enabled": false, "items": []}
    },
    {
      "id": "act-ap",
      "name": "AP",
      "unit": "USD",
      "input_kind": "money",
      "parity_qty": 13000,
      "multiplier": { "enabled": false, "extra_factor": 1, "label": "" },
      "qualifiers": {"enabled": false, "items": []}
    }
  ],
  "text_fields": [
    {
      "id": "txt-details",
      "label": "Details",
      "placeholder": "Name each presentation and each sale so a manager can count them.",
      "required": false
    }
  ],
  "choice_fields": [
    { "id": "choice-side", "label": "Side", "options": ["Rookie", "Veteran"] }
  ]
}$cfg$::jsonb;
  v_rules text :=
    'Honor log. Totals add up for the whole contest, then they are scored. '
    || 'Zeros are allowed. A second Send on the same Chicago day replaces that day. '
    || 'The Side chip is context only and does not score. '
    || 'The Board closes Friday 11:59 PM Chicago.';
  v_proofs jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'honor',
      'name', 'Confirm on your honor that you did the work.',
      'method', 'honor'
    )
  );
begin
  -- Username only. The Gmail Official login must not become created_by.
  select p.id into v_host
  from public.profiles p
  where lower(p.username) = 'danielharder'
  limit 1;
  if v_host is null then
    raise exception 'HOST_MISSING: username danielharder not found. Stop.';
  end if;
  if exists (
    select 1 from auth.users au
    where au.id = v_host
      and lower(au.email) = 'danielpadraic@gmail.com'
  ) then
    raise exception 'HOST_WRONG_ACCOUNT: danielharder must not be the Official Gmail login. Stop.';
  end if;

  select c.id into v_id
  from public.challenges c
  where c.title = v_title
    and c.starts_at = v_starts
  limit 1;
  if v_id is not null then
    raise notice 'ALREADY_EXISTS % — no-op', v_id;
    return;
  end if;

  -- created_by starts null so the friend-notify trigger does not post to Home.
  -- A follow-up UPDATE sets created_by to @danielharder. Host is not a contestant.
  -- The duration trigger rewrites ends_at to starts_at + 5 days (Sat 12:00 AM Chicago),
  -- which is the close of Friday 11:59 PM. SQL Editor cannot set session_replication_role.

  insert into public.challenges (
    title,
    description,
    rules,
    sponsor_name,
    created_by,
    creator_participating,
    is_official,
    privacy_mode,
    challenge_lane,
    visibility,
    discoverability,
    host_rigor,
    timezone,
    starts_at,
    ends_at,
    status,
    format,
    challenge_type,
    frequency,
    duration_days,
    days_required,
    length_value,
    length_unit,
    target_count,
    required_checkins,
    buy_in_amount,
    prize_pool,
    host_funded,
    host_budget,
    creator_contribution,
    funding_model,
    prize_structure,
    payout_mode,
    currency,
    scoring_method,
    scoring_config,
    comparable_points_config,
    scoring_version,
    proofs,
    proof_type,
    proof_requirements,
    proof_review,
    tasks,
    category,
    task,
    min_minutes,
    misses_allowed,
    is_unlimited,
    min_participants,
    start_rule,
    start_mode,
    end_mode
  ) values (
    v_title,
    v_rules,
    v_rules,
    'Pinnacle Life Group',
    null,
    false,
    false,
    'private_corporate',
    'private',
    'invite',
    'invite_only',
    'friendly',
    'America/Chicago',
    v_starts,
    v_ends,
    'live',
    'points',
    'points',
    'daily',
    5,
    5,
    5,
    'days',
    5,
    5,
    0,
    0,
    true,
    0,
    0,
    'creator',
    'winner_take_all',
    'winner_take_all',
    'coins',
    'comparable_points',
    v_config,
    v_config,
    1,
    v_proofs,
    'honor',
    jsonb_build_array(jsonb_build_object('type', 'honor', 'required', true)),
    'auto',
    '[]'::jsonb,
    'other',
    v_title,
    1,
    0,
    false,
    2,
    'at_starts_at',
    'fixed',
    'end_date'
  )
  returning id into v_id;

  -- Same post-insert pattern as lib/challenges.ts when publish cannot persist scoring_config.
  update public.challenges
    set created_by = v_host,
        scoring_method = 'comparable_points',
        scoring_config = v_config,
        comparable_points_config = v_config,
        scoring_version = 1,
        creator_participating = false
    where id = v_id
      and created_by is null;

  if not exists (
    select 1 from public.challenges where id = v_id and created_by = v_host
  ) then
    raise exception 'HOST_STAMP_FAILED: created_by was not set to danielharder. Stop.';
  end if;

  raise notice 'INSERTED %', v_id;
end;
$ops$;


-- =============================================================================
-- SCRIPT C — confirm
-- =============================================================================
select
  c.id,
  'https://blob.mobi/challenges/' || c.id::text as challenge_url,
  c.title,
  c.sponsor_name,
  p.username as host_username,
  c.created_by as host_id,
  c.privacy_mode,
  c.challenge_lane,
  c.visibility,
  c.discoverability,
  c.host_rigor,
  c.is_official,
  c.status,
  c.timezone,
  c.starts_at,
  c.ends_at,
  timezone('America/Chicago', c.ends_at) as ends_at_chicago,
  c.format,
  c.challenge_type,
  c.frequency,
  c.duration_days,
  c.days_required,
  c.length_value,
  c.buy_in_amount,
  c.prize_pool,
  c.host_funded,
  c.funding_model,
  c.prize_structure,
  c.payout_mode,
  c.scoring_method,
  c.scoring_version,
  c.proof_type,
  c.proofs,
  c.creator_participating,
  exists(
    select 1
    from public.challenge_participants cp
    where cp.challenge_id = c.id
      and cp.user_id = c.created_by
  ) as host_on_board,
  (c.scoring_config = c.comparable_points_config) as configs_match,
  c.scoring_config->'window' as score_window,
  c.scoring_config->'activities' as activities,
  c.scoring_config->'text_fields' as text_fields,
  c.scoring_config->'choice_fields' as choice_fields,
  (
    to_regprocedure('public.comparable_score_window(jsonb, jsonb)') is not null
    and to_regprocedure('public.apply_comparable_points(uuid, uuid, uuid)') is not null
  ) as scoring_functions_ready
from public.challenges c
left join public.profiles p on p.id = c.created_by
where c.title = 'Rookies vs. Veterans'
  and c.starts_at = timestamptz '2026-09-21 00:00:00-05';

-- Older Rookies / Rockstars rows. SCRIPT B must not change these.
select
  id,
  title,
  starts_at,
  status,
  scoring_method,
  updated_at
from public.challenges
where id not in (
  select id
  from public.challenges
  where title = 'Rookies vs. Veterans'
    and starts_at = timestamptz '2026-09-21 00:00:00-05'
)
  and (
    title ilike '%rookie%'
    or title ilike '%rockstar%'
    or title ilike '%veteran%'
  )
order by created_at;
