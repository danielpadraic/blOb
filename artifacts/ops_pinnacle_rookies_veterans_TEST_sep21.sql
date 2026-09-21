-- blOb ops — TEST clone of Rookies vs. Veterans + 15 fake contestants + audit
-- DATA only. No industry screen. example.invalid never receives mail.
--
-- DOES NOT UPDATE OR DELETE the live row
--   title = 'Rookies vs. Veterans' AND starts_at = 2026-09-21 00:00:00-05
-- Does not touch Rockstars. Does not run admin_mass_join.
-- Does not join @danielharder. Does not email anyone.
--
-- PREREQUISITE: scoring functions (including comparable_score_window with a lane
-- argument) must already be on the project. SCRIPT A checks this.
--
-- Operator clicks (Daniel — not a programmer)
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if asked. Blank editor + green Run.
-- 3. SCRIPT A: in Cursor, open this file. Select only SCRIPT A. Paste. Run.
--    Done when live_row_untouched = true, scoring_functions_ready = true,
--    host_username = danielharder.
--    If scoring_functions_ready = false, stop and tell Cursor.
-- 4. SCRIPT B: new empty query. Paste only SCRIPT B. Run.
--    Done when Success and the notice shows a new uuid, or TEST_ALREADY_EXISTS.
--    If TEST_ALREADY_EXISTS, do not run B again — use that id.
-- 5. SCRIPT C: new empty query. Paste only SCRIPT C. Run once.
--    Done when Success. Safe to re-run; it reuses blobtest_* users.
-- 6. SCRIPT D: new empty query. Paste only SCRIPT D. Run.
--    If a yellow "Potential issues" card appears, click Cancel and paste this
--    SCRIPT D again (it is read-only now). Do not click Run without RLS.
--    Done when every fixture row has pass = true, testers = 15,
--    rookies = 8, veterans = 7, veteran_09_dials_in_score = 0,
--    host_on_board = false, live title still Rookies vs. Veterans.
--    Board order is the second grid. 01 (26000) must sit above 09 (13000).
-- 7. Open challenge_url from SCRIPT B/D on https://blob.mobi as danielharder.
--    Board order must match SCRIPT D.
-- 8. SCRIPT E: do not run unless Daniel asks to throw the TEST away.
--    Cleanup is OFF in this file (v_allow_cleanup = false).
--
-- If you paste this whole file, A–D run and E stays off. Prefer one script at a time.


-- =============================================================================
-- SCRIPT A — preview (read only)
-- =============================================================================
select
  exists(
    select 1
    from public.challenges
    where title = 'Rookies vs. Veterans'
      and starts_at = timestamptz '2026-09-21 00:00:00-05'
  ) as live_row_untouched,
  (
    to_regprocedure('public.comparable_score_window(jsonb, jsonb, text)') is not null
    and to_regprocedure('public.score_comparable_participant(uuid, uuid)') is not null
    and to_regprocedure('public.apply_comparable_points(uuid, uuid, uuid)') is not null
  ) as scoring_functions_ready,
  p.username as host_username,
  (p.id is not null) as host_found,
  exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'challenge_participants'
      and column_name = 'scoring_lane'
  ) as scoring_lane_column_ready,
  exists(
    select 1 from public.challenges where title = 'TEST — Rookies vs. Veterans'
  ) as test_already_exists,
  (
    select c.id
    from public.challenges c
    where c.title = 'Rookies vs. Veterans'
      and c.starts_at = timestamptz '2026-09-21 00:00:00-05'
  ) as live_id,
  (
    select jsonb_typeof(c.scoring_config->'lanes') = 'array'
       and jsonb_array_length(c.scoring_config->'lanes') > 0
    from public.challenges c
    where c.title = 'Rookies vs. Veterans'
      and c.starts_at = timestamptz '2026-09-21 00:00:00-05'
  ) as live_has_lanes
from (select 1) as seed
left join public.profiles p on lower(p.username) = 'danielharder';


-- =============================================================================
-- SCRIPT B — insert TEST challenge only
-- =============================================================================
do $ops$
declare
  v_host uuid;
  v_live public.challenges%rowtype;
  v_id uuid;
  v_title text := 'TEST — Rookies vs. Veterans';
  v_config jsonb;
  v_fallback jsonb := $cfg${
    "version": 1,
    "parity_points": 13000,
    "window": "challenge",
    "extras_keep_adding": true,
    "lanes": [
      {"id": "rookie", "label": "Rookie"},
      {"id": "veteran", "label": "Veteran"}
    ],
    "activities": [
      {
        "id": "act-dials",
        "name": "Dials",
        "unit": "dials",
        "input_kind": "count",
        "parity_qty": 3500,
        "lane_ids": ["rookie"],
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
        "lane_ids": ["rookie", "veteran"],
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
    "choice_fields": []
  }$cfg$::jsonb;
begin
  select id into v_host
  from public.profiles
  where lower(username) = 'danielharder'
  limit 1;
  if v_host is null then
    raise exception 'HOST_MISSING: username danielharder not found. Stop.';
  end if;

  select * into v_live
  from public.challenges
  where title = 'Rookies vs. Veterans'
    and starts_at = timestamptz '2026-09-21 00:00:00-05'
  limit 1;
  if not found then
    raise exception 'LIVE_MISSING: live Rookies vs. Veterans row not found. Stop.';
  end if;

  select c.id into v_id
  from public.challenges c
  where c.title = v_title
  limit 1;
  if v_id is not null then
    raise notice 'TEST_ALREADY_EXISTS % — no-op', v_id;
    return;
  end if;

  v_config := coalesce(v_live.scoring_config, v_live.comparable_points_config, '{}'::jsonb);
  if jsonb_typeof(v_config->'lanes') is distinct from 'array'
     or jsonb_array_length(coalesce(v_config->'lanes', '[]'::jsonb)) = 0
     or jsonb_typeof(v_config->'activities') is distinct from 'array' then
    v_config := v_fallback;
  end if;

  insert into public.challenges (
    title, description, rules, sponsor_name, created_by, creator_participating,
    is_official, privacy_mode, challenge_lane, visibility, discoverability,
    host_rigor, timezone, starts_at, ends_at, status, format, challenge_type,
    frequency, duration_days, days_required, length_value, length_unit,
    target_count, required_checkins, buy_in_amount, prize_pool, host_funded,
    host_budget, creator_contribution, funding_model, prize_structure, payout_mode,
    currency, scoring_method, scoring_config, comparable_points_config, scoring_version,
    proofs, proof_type, proof_requirements, proof_review, tasks, category, task,
    min_minutes, misses_allowed, is_unlimited, min_participants, start_rule, start_mode, end_mode
  ) values (
    v_title,
    coalesce(v_live.description, 'TEST clone. Private. Not the live contest.'),
    coalesce(v_live.rules, 'TEST clone. Honor log. Board closes Friday 11:59 PM Chicago.'),
    v_live.sponsor_name,
    null,
    false,
    false,
    'private_corporate',
    'private',
    'invite',
    'invite_only',
    'friendly',
    'America/Chicago',
    v_live.starts_at,
    v_live.ends_at,
    'live',
    'points',
    'points',
    'daily',
    coalesce(v_live.duration_days, 5),
    coalesce(v_live.days_required, 5),
    coalesce(v_live.length_value, 5),
    coalesce(v_live.length_unit, 'days'),
    coalesce(v_live.target_count, 5),
    coalesce(v_live.required_checkins, 5),
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
    coalesce(v_live.proofs, jsonb_build_array(jsonb_build_object(
      'id', 'honor',
      'name', 'Confirm on your honor that you did the work.',
      'method', 'honor'
    ))),
    'honor',
    coalesce(v_live.proof_requirements, jsonb_build_array(jsonb_build_object('type', 'honor', 'required', true))),
    'auto',
    '[]'::jsonb,
    coalesce(v_live.category, 'other'),
    v_title,
    1,
    0,
    false,
    2,
    coalesce(v_live.start_rule, 'at_starts_at'),
    'fixed',
    'end_date'
  )
  returning id into v_id;

  update public.challenges
    set created_by = v_host,
        scoring_method = 'comparable_points',
        scoring_config = v_config,
        comparable_points_config = v_config,
        scoring_version = 1,
        creator_participating = false
    where id = v_id
      and created_by is null
      and title = v_title;

  if not exists (
    select 1 from public.challenges
    where id = v_id and created_by = v_host and title = v_title
  ) then
    raise exception 'HOST_STAMP_FAILED on TEST. Stop.';
  end if;

  -- Live row must still be the original.
  if not exists (
    select 1 from public.challenges
    where title = 'Rookies vs. Veterans'
      and starts_at = timestamptz '2026-09-21 00:00:00-05'
      and id = v_live.id
  ) then
    raise exception 'LIVE_TOUCHED. Stop.';
  end if;

  raise notice 'INSERTED TEST % https://blob.mobi/challenges/%', v_id, v_id;
end;
$ops$;


-- =============================================================================
-- SCRIPT C — 15 testers + joins + logs + score (idempotent on blobtest_*)
-- =============================================================================
alter table public.challenge_participants
  add column if not exists scoring_lane text;

create extension if not exists pgcrypto;

do $seed$
declare
  v_test uuid;
  v_live uuid;
  v_host uuid;
  v_config jsonb;
  rec record;
  v_uid uuid;
  v_email text;
  v_display text;
  v_lane text;
  v_dials numeric;
  v_pres numeric;
  v_ap numeric;
  v_days date[] := array[
    date '2026-09-21',
    date '2026-09-22',
    date '2026-09-23',
    date '2026-09-24'
  ];
  v_i int;
  v_part numeric[];
begin
  if to_regprocedure('public.comparable_score_window(jsonb, jsonb, text)') is null then
    raise exception 'SCORING_MISSING: comparable_score_window(lane) is not on this project. Stop.';
  end if;

  select id into v_host from public.profiles where lower(username) = 'danielharder' limit 1;
  select id into v_live
  from public.challenges
  where title = 'Rookies vs. Veterans'
    and starts_at = timestamptz '2026-09-21 00:00:00-05';
  select id, coalesce(scoring_config, comparable_points_config)
    into v_test, v_config
  from public.challenges
  where title = 'TEST — Rookies vs. Veterans'
  limit 1;
  if v_test is null then
    raise exception 'TEST_MISSING: run SCRIPT B first.';
  end if;

  -- No global rookie/veteran check: other contests may use other lane ids.

  for rec in
    select
      n,
      'blobtest_' || lpad(n::text, 2, '0') as username,
      case when n <= 8 then 'rookie' else 'veteran' end as lane,
      case
        when n <= 8 then 'Test Rookie ' || lpad(n::text, 2, '0')
        else 'Test Veteran ' || lpad(n::text, 2, '0')
      end as display_name,
      case n
        when 1 then 3500 when 2 then 3500 when 3 then 7000 when 4 then 3500 when 5 then 0
        when 9 then 3500 when 10 then 3500 when 11 then 0
        else (abs(hashtext('blobtest_' || lpad(n::text, 2, '0') || ':dials')) % 8001)::numeric
      end as week_dials,
      case n
        when 1 then 10 when 2 then 5 when 3 then 10 when 4 then 0 when 5 then 0
        when 9 then 10 when 10 then 10 when 11 then 0
        else (abs(hashtext('blobtest_' || lpad(n::text, 2, '0') || ':pres')) % 15)::numeric
      end as week_pres,
      case n
        when 1 then 13000 when 2 then 0 when 3 then 0 when 4 then 13000 when 5 then 0
        when 9 then 13000 when 10 then 0 when 11 then 6500
        else (abs(hashtext('blobtest_' || lpad(n::text, 2, '0') || ':ap')) % 20001)::numeric
      end as week_ap
    from generate_series(1, 15) as n
  loop
    v_email := rec.username || '@example.invalid';
    v_display := rec.display_name;
    v_lane := rec.lane;

    select p.id into v_uid
    from public.profiles p
    where p.username = rec.username
    limit 1;
    if v_uid is null then
      select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
    end if;
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token, banned_until
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_uid,
        'authenticated',
        'authenticated',
        v_email,
        crypt(gen_random_uuid()::text, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', rec.username, 'display_name', v_display),
        now(),
        now(),
        '',
        '',
        '',
        '',
        now() + interval '100 years'
      );
      begin
        insert into auth.identities (
          id, user_id, provider_id, identity_data, provider, email, last_sign_in_at, created_at, updated_at
        ) values (
          v_uid, v_uid, v_uid::text,
          jsonb_build_object('sub', v_uid::text, 'email', v_email),
          'email', v_email, now(), now(), now()
        );
      exception when others then
        null;
      end;
    end if;

    insert into public.profiles (
      id, username, display_name, coins, bucks, is_official, is_creator, is_admin,
      allow_profile_posts, profile_visibility, default_post_audience, encouragement_tone,
      checkin_share_home, checkin_share_wave, contextual_tours_seen
    ) values (
      v_uid, rec.username, v_display, 0, 0, false, false, false,
      false, 'friends', 'friends', 'neutral',
      false, false, '[]'::jsonb
    )
    on conflict (id) do update
      set username = excluded.username,
          display_name = excluded.display_name;

    if v_live is not null and exists (
      select 1 from public.challenge_participants
      where challenge_id = v_live and user_id = v_uid
    ) then
      raise exception 'TESTER_ON_LIVE: % is on the live challenge. Stop.', rec.username;
    end if;

    insert into public.challenge_participants (
      challenge_id, user_id, status, buy_in_paid, currency, scoring_lane, points
    ) values (
      v_test, v_uid, 'joined', 0, 'coins', v_lane, 0
    )
    on conflict (challenge_id, user_id) do update
      set scoring_lane = excluded.scoring_lane,
          status = 'joined';

    -- Split week totals across Mon–Thu so the Board is a week sum.
    v_part := array[
      trunc(rec.week_dials / 4, 2),
      trunc(rec.week_dials / 4, 2),
      trunc(rec.week_dials / 4, 2),
      rec.week_dials - 3 * trunc(rec.week_dials / 4, 2)
    ];
    for v_i in 1..4 loop
      v_dials := v_part[v_i];
      v_pres := case v_i
        when 1 then trunc(rec.week_pres / 4, 2)
        when 2 then trunc(rec.week_pres / 4, 2)
        when 3 then trunc(rec.week_pres / 4, 2)
        else rec.week_pres - 3 * trunc(rec.week_pres / 4, 2)
      end;
      v_ap := case v_i
        when 1 then trunc(rec.week_ap / 4, 2)
        when 2 then trunc(rec.week_ap / 4, 2)
        when 3 then trunc(rec.week_ap / 4, 2)
        else rec.week_ap - 3 * trunc(rec.week_ap / 4, 2)
      end;
      insert into public.challenge_checkins (
        user_id, challenge_id, period_key, status, proof_parts, notes,
        started_at, submitted_at, metric_values, checkin_slot, scoring_version
      ) values (
        v_uid,
        v_test,
        v_days[v_i],
        'submitted',
        jsonb_build_object('honor', jsonb_build_object('method', 'honor')),
        'Check-in Complete',
        timezone('America/Chicago', v_days[v_i]::timestamp),
        timezone('America/Chicago', v_days[v_i]::timestamp) + interval '12 hours',
        jsonb_build_object(
          'act-dials', v_dials,
          'act-ap', v_ap,
          'multiplier:presentations', v_pres
        ),
        1,
        1
      )
      on conflict (challenge_id, user_id, period_key, checkin_slot) do update
        set metric_values = excluded.metric_values,
            notes = excluded.notes,
            status = 'submitted',
            submitted_at = excluded.submitted_at,
            proof_parts = excluded.proof_parts,
            updated_at = now();
    end loop;

    perform public.apply_comparable_points(v_test, v_uid, null);
  end loop;

  -- No Home leak from this seed.
  begin
    delete from public.posts where challenge_id = v_test;
  exception when others then
    null;
  end;
  begin
    delete from public.posts where source_challenge_id = v_test;
  exception when undefined_column then
    null;
  end;

  if exists (
    select 1
    from public.challenge_participants cp
    join public.profiles p on p.id = cp.user_id
    where cp.challenge_id = v_test
      and lower(p.username) = 'danielharder'
  ) then
    raise exception 'HOST_JOINED_TEST. Host must not be a contestant. Stop.';
  end if;

  raise notice 'SEEDED 15 testers on TEST %', v_test;
end;
$seed$;


-- =============================================================================
-- SCRIPT D — audit grid (read only — no new tables)
-- =============================================================================
-- If Supabase shows "Potential issues", click Cancel. This block only SELECTs.
with test as (
  select
    c.id,
    coalesce(c.scoring_config, c.comparable_points_config, '{}'::jsonb) as config
  from public.challenges c
  where c.title = 'TEST — Rookies vs. Veterans'
  limit 1
),
week as (
  select
    p.username,
    p.id as user_id,
    coalesce(cp.scoring_lane, '') as lane,
    coalesce(cp.points, 0) as board_points,
    coalesce(sum((c.metric_values->>'act-dials')::numeric), 0) as week_dials,
    coalesce(sum((c.metric_values->>'multiplier:presentations')::numeric), 0) as week_pres,
    coalesce(sum((c.metric_values->>'act-ap')::numeric), 0) as week_ap
  from public.challenge_participants cp
  join public.profiles p on p.id = cp.user_id
  join public.challenges ch on ch.id = cp.challenge_id
  left join public.challenge_checkins c
    on c.challenge_id = cp.challenge_id
   and c.user_id = cp.user_id
  where ch.title = 'TEST — Rookies vs. Veterans'
    and p.username like 'blobtest_%'
  group by p.username, p.id, cp.scoring_lane, cp.points
),
rows as (
  select
    w.username,
    w.lane,
    w.week_dials,
    w.week_pres,
    w.week_ap,
    case w.username
      when 'blobtest_01' then 26000
      when 'blobtest_02' then 6500
      when 'blobtest_03' then 26000
      when 'blobtest_04' then 13000
      when 'blobtest_05' then 0
      when 'blobtest_09' then 13000
      when 'blobtest_10' then 0
      when 'blobtest_11' then 6500
      else public.comparable_score_window(
        test.config,
        jsonb_build_object(
          'act-dials', w.week_dials,
          'act-ap', w.week_ap,
          'multiplier:presentations', w.week_pres
        ),
        w.lane
      )
    end as expected_points,
    w.board_points,
    public.score_comparable_participant(test.id, w.user_id) as sql_score,
    public.comparable_score_window(
      test.config,
      jsonb_build_object(
        'act-dials', w.week_dials,
        'multiplier:presentations', w.week_pres,
        'act-ap', 0
      ),
      w.lane
    ) as dials_only_score
  from week w
  cross join test
)
select
  username,
  lane,
  week_dials,
  week_pres,
  week_ap,
  expected_points,
  board_points,
  sql_score,
  (expected_points = board_points and board_points = sql_score) as pass,
  dials_only_score
from rows
order by expected_points desc, username;

with test as (
  select
    c.id,
    coalesce(c.scoring_config, c.comparable_points_config, '{}'::jsonb) as config
  from public.challenges c
  where c.title = 'TEST — Rookies vs. Veterans'
  limit 1
),
week09 as (
  select
    coalesce(sum((c.metric_values->>'act-dials')::numeric), 0) as week_dials,
    coalesce(sum((c.metric_values->>'multiplier:presentations')::numeric), 0) as week_pres
  from public.challenge_participants cp
  join public.profiles p on p.id = cp.user_id
  join public.challenges ch on ch.id = cp.challenge_id
  left join public.challenge_checkins c
    on c.challenge_id = cp.challenge_id
   and c.user_id = cp.user_id
  where ch.title = 'TEST — Rookies vs. Veterans'
    and p.username = 'blobtest_09'
)
select
  (select count(*) from public.profiles p
    join public.challenge_participants cp on cp.user_id = p.id
    join public.challenges c on c.id = cp.challenge_id
    where c.title = 'TEST — Rookies vs. Veterans' and p.username like 'blobtest_%') as testers,
  (select count(*) from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where c.title = 'TEST — Rookies vs. Veterans' and cp.scoring_lane = 'rookie') as rookies,
  (select count(*) from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where c.title = 'TEST — Rookies vs. Veterans' and cp.scoring_lane = 'veteran') as veterans,
  (select title from public.challenges
    where title = 'Rookies vs. Veterans'
      and starts_at = timestamptz '2026-09-21 00:00:00-05') as live_row_title_still,
  (select left(title, 4) = 'TEST' from public.challenges where title = 'TEST — Rookies vs. Veterans') as test_title_starts_test,
  exists(
    select 1 from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    join public.profiles p on p.id = cp.user_id
    where c.title = 'TEST — Rookies vs. Veterans' and lower(p.username) = 'danielharder'
  ) as host_on_board,
  coalesce((
    select public.comparable_score_window(
      test.config,
      jsonb_build_object(
        'act-dials', week09.week_dials,
        'multiplier:presentations', week09.week_pres,
        'act-ap', 0
      ),
      'veteran'
    )
    from test, week09
  ), -1) as veteran_09_dials_in_score,
  'https://blob.mobi/challenges/' || (select id::text from test) as challenge_url,
  '3500 Dials with 10 Presentations equals 13,000 points, and $13,000 of AP equals 13,000 points.' as mechanics_sentence,
  'Rookies score Dials (with Presentations) and AP. Veterans score AP only.' as lane_subline;


-- =============================================================================
-- SCRIPT E — cleanup (OFF until Daniel asks)
-- =============================================================================
-- Change v_allow_cleanup to true only when Daniel says to throw the TEST away.
do $cleanup$
declare
  v_allow_cleanup boolean := false;
  v_test uuid;
  v_live uuid;
begin
  if not v_allow_cleanup then
    raise notice 'SCRIPT E skipped. Cleanup stays off until Daniel asks.';
    return;
  end if;

  select id into v_live
  from public.challenges
  where title = 'Rookies vs. Veterans'
    and starts_at = timestamptz '2026-09-21 00:00:00-05';
  select id into v_test
  from public.challenges
  where title = 'TEST — Rookies vs. Veterans';

  if exists (
    select 1
    from public.challenge_participants cp
    join public.profiles p on p.id = cp.user_id
    where cp.challenge_id = v_live
      and p.username like 'blobtest_%'
  ) then
    raise exception 'CLEANUP_STOPPED: a blobtest_* user is on the LIVE challenge.';
  end if;

  if v_test is not null then
    delete from public.challenge_checkins where challenge_id = v_test;
    delete from public.challenge_participants where challenge_id = v_test;
    begin
      delete from public.posts where challenge_id = v_test;
    exception when others then
      null;
    end;
    begin
      delete from public.notifications where challenge_id = v_test;
    exception when others then
      null;
    end;
    delete from public.challenges where id = v_test and title = 'TEST — Rookies vs. Veterans';
  end if;

  delete from auth.identities
  where user_id in (select id from public.profiles where username like 'blobtest_%');
  delete from public.profiles where username like 'blobtest_%';
  delete from auth.users where email like 'blobtest_%@example.invalid';

  raise notice 'TEST cleanup done. Live Rookies vs. Veterans was not touched.';
end;
$cleanup$;
