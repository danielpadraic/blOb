-- ============================================================================
-- Official Coin — weekly + monthly standing house rooms
-- Target: hosted Supabase blOb-app (tguzdtwsajnnczdxjqyq)
--
-- STATUS: ALREADY APPLIED on Sep 25 2026 by the agent (psql, single transaction).
-- This file is the record. It is idempotent — safe to paste again if you ever
-- need to re-run it. Nothing here is destructive.
--
-- If you ever do need to run it yourself:
--   1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
--   2. Paste this whole file into the editor.
--   3. Click the green Run button (bottom right).
--   4. The last two result panes should read:
--        official_coin_roll_windows  -> {"ok": true, ...}
--        official_coin_enroll_all    -> {"ok": true, "users": N, ...}
--   5. Nothing else to click. Do not run "db push --include-all".
--
-- Source of truth lives at:
--   supabase/migrations/20260925190000_official_coin_rooms.sql
-- ============================================================================

-- Official Coin: two standing house rooms owned by @blob.
--   Official Weekly Coin   Mon 00:00 -> Sun end, America/Chicago,   100 coin house guarantee
--   Official Monthly Coin  1st 00:00 -> last day end, America/Chicago, 1,000 coin house guarantee
--
-- Same challenge row rolls to the next window. No new challenge id every Monday.
-- Count-days scoring, no knockout. No participant buy-in. Coins only.
-- One Official Check-In fills today's Chicago slot on BOTH rooms.
--
-- Apply in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.
-- Does not touch Finix, cash Officials (week_10), Pinnacle, 30-Day, or admin_mass_join.

-- ---------------------------------------------------------------------------
-- 1. Additive columns
-- ---------------------------------------------------------------------------

alter table public.challenges
  add column if not exists official_kind text,
  add column if not exists score_mode text,
  add column if not exists window_reset text,
  add column if not exists prize_guarantee_coins integer;

comment on column public.challenges.official_kind is
  'null | coin_weekly | coin_monthly. Standing house Official Coin rooms only.';
comment on column public.challenges.score_mode is
  'count_days for Official Coin. Never knockout consistency.';
comment on column public.challenges.window_reset is
  'weekly_chicago | monthly_chicago. Same row reopens on the next Chicago window.';
comment on column public.challenges.prize_guarantee_coins is
  'House guarantee in coins for one window. 100 weekly / 1000 monthly.';

-- One live room per kind. With challenge_participants (challenge_id, user_id)
-- unique, this is exactly one live membership per (user, official_kind).
create unique index if not exists challenges_official_kind_uidx
  on public.challenges (official_kind)
  where official_kind is not null;

alter table public.challenge_participants
  add column if not exists room_id text not null default 'default',
  add column if not exists window_starts_at timestamptz,
  add column if not exists window_ends_at timestamptz;

comment on column public.challenge_participants.room_id is
  'Shard key. default until 100-cap rooms ship.';

alter table public.profiles
  add column if not exists official_coin_opted_out_at timestamptz;

comment on column public.profiles.official_coin_opted_out_at is
  'Set when the user leaves Official Coin. Backfill never forces them back.';

create index if not exists challenge_participants_room_idx
  on public.challenge_participants (challenge_id, room_id);

-- ---------------------------------------------------------------------------
-- 2. Window ledger (one row per room per window, so settlement can run late)
-- ---------------------------------------------------------------------------

create table if not exists public.official_coin_windows (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  official_kind text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  guarantee_coins integer not null,
  day_count integer not null,
  opened_at timestamptz not null default now(),
  settled_at timestamptz,
  total_days integer,
  paid_coins integer not null default 0,
  unique (challenge_id, starts_at)
);

alter table public.official_coin_windows enable row level security;

drop policy if exists "Official Coin windows are viewable" on public.official_coin_windows;
create policy "Official Coin windows are viewable"
  on public.official_coin_windows for select
  using (true);

grant select on public.official_coin_windows to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Chicago window math
-- ---------------------------------------------------------------------------

create or replace function public.official_coin_tz()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'America/Chicago'::text;
$$;

/**
 * Today's Chicago calendar date.
 *
 * Deliberately not `public.chicago_today()`: that one does
 * `timezone('utc', now()) at time zone 'America/Chicago'`, which adds the
 * offset instead of subtracting it and reads a day ahead after ~7pm Chicago.
 * Official Coin must agree with `checkin_period_for`, which uses this form.
 */
create or replace function public.official_coin_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (timezone(public.official_coin_tz(), now()))::date;
$$;

create or replace function public.official_coin_window_bounds(
  p_kind text,
  p_at timestamptz default now()
)
returns table (starts_at timestamptz, ends_at timestamptz, day_count integer)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tz text := public.official_coin_tz();
  v_local date;
  v_from date;
  v_to date;
begin
  v_local := (timezone(v_tz, p_at))::date;
  if lower(coalesce(p_kind, '')) = 'coin_monthly' then
    v_from := date_trunc('month', v_local::timestamp)::date;
    v_to := (date_trunc('month', v_local::timestamp) + interval '1 month')::date;
  else
    -- Postgres date_trunc('week') is Monday.
    v_from := date_trunc('week', v_local::timestamp)::date;
    v_to := v_from + 7;
  end if;
  starts_at := v_from::timestamp at time zone v_tz;
  ends_at := v_to::timestamp at time zone v_tz;
  day_count := (v_to - v_from);
  return next;
end;
$$;

create or replace function public.official_coin_challenge_id(p_kind text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.challenges where official_kind = p_kind limit 1;
$$;

create or replace function public.is_official_coin_challenge(ch challenges)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce((ch).official_kind, '') in ('coin_weekly', 'coin_monthly');
$$;

-- ---------------------------------------------------------------------------
-- 4. Window-scoped day counts
-- ---------------------------------------------------------------------------

create or replace function public.official_coin_days_in_window(
  p_challenge_id uuid,
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct c.period_key)::int
  from public.challenge_checkins c
  where c.challenge_id = p_challenge_id
    and c.user_id = p_user_id
    and c.status = 'submitted'
    and c.submitted_at is not null
    and p_from is not null
    and p_to is not null
    and c.period_key >= (timezone(public.official_coin_tz(), p_from))::date
    and c.period_key < (timezone(public.official_coin_tz(), p_to))::date;
$$;

/** Days logged in the room's CURRENT window. Never all-time. */
create or replace function public.official_coin_day_count(
  p_challenge_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or not public.is_official_coin_challenge(ch) then
    return 0;
  end if;
  return public.official_coin_days_in_window(
    p_challenge_id, p_user_id, ch.starts_at, ch.ends_at
  );
end;
$$;

/**
 * Days this person may still fill in the current window.
 * Mid-window join counts only remaining Chicago calendar days
 * (Thursday join -> 4 of 7 that week).
 */
create or replace function public.official_coin_allowed_days(
  p_challenge_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  v_tz text := public.official_coin_tz();
  v_from timestamptz;
  v_joined timestamptz;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or not public.is_official_coin_challenge(ch) then
    return 0;
  end if;

  select greatest(coalesce(p.window_starts_at, ch.starts_at), ch.starts_at)
    into v_joined
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id and p.user_id = p_user_id;

  v_from := coalesce(v_joined, ch.starts_at);
  return greatest(
    (timezone(v_tz, ch.ends_at))::date - (timezone(v_tz, v_from))::date,
    0
  );
end;
$$;

-- Board days: Official Coin counts the current Chicago window only.
create or replace function public.challenge_board_days(p_challenge_id uuid, p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  ch public.challenges%rowtype;
  v_days int := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if public.is_official_coin_challenge(ch) then
    return public.official_coin_day_count(p_challenge_id, p_user_id);
  end if;
  if coalesce(ch.is_official, false) then
    begin
      return public.official_valid_day_count(p_challenge_id, p_user_id);
    exception when others then
      null;
    end;
  end if;
  -- Unique qualifying periods with required proof. Never join posts / hidden_from_home.
  v_days := public.submitted_checkin_count(p_challenge_id, p_user_id);
  return greatest(coalesce(v_days, 0), 0);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The two standing rooms
-- ---------------------------------------------------------------------------

do $$
declare
  v_bob uuid;
  v_kind text;
  v_title text;
  v_guarantee int;
  v_reset text;
  v_freq text;
  v_desc text;
  v_rules text;
  v_win record;
begin
  v_bob := coalesce(
    public.official_profile_id(),
    (select id from public.profiles where lower(username) = 'blob' limit 1),
    '81dfe427-d413-4c60-bd4a-e710c95077ad'::uuid
  );

  foreach v_kind in array array['coin_weekly', 'coin_monthly']
  loop
    select * into v_win from public.official_coin_window_bounds(v_kind, now());

    if v_kind = 'coin_weekly' then
      v_title := 'Official Weekly Coin';
      v_guarantee := 100;
      v_reset := 'weekly_chicago';
      v_freq := 'weekly';
      v_desc := 'The house room. Log a workout each Chicago day this week. '
        || 'When Sunday ends, 100 coins split by days logged.';
      v_rules := 'Log a workout each Chicago day this week. When Sunday ends, '
        || '100 coins split by days logged. Joining mid-week means you can only '
        || 'log the days left. Misses do not drop you.';
    else
      v_title := 'Official Monthly Coin';
      v_guarantee := 1000;
      v_reset := 'monthly_chicago';
      v_freq := 'monthly';
      v_desc := 'The house room. Log a workout each Chicago day this month. '
        || 'When the month ends, 1,000 coins split by days logged.';
      v_rules := 'Log a workout each Chicago day this month. When the month ends, '
        || '1,000 coins split by days logged. Joining mid-month means you can only '
        || 'log the days left. Misses do not drop you.';
    end if;

    if not exists (select 1 from public.challenges where official_kind = v_kind) then
      insert into public.challenges (
        title, task, description, rules,
        is_official, created_by, sponsor_name,
        buy_in_amount, prize_pool, currency, challenge_lane,
        host_funded, host_budget, funding_model, creator_contribution,
        days_required, min_minutes, misses_allowed, min_participants,
        status, starts_at, ends_at, official_started_at,
        visibility, privacy_mode, category,
        challenge_type, format, scoring_method, frequency,
        timezone, proof_type, proof_review, proofs, proof_requirements,
        payout_mode, prize_structure, host_rigor, is_unlimited,
        creator_participating, start_mode, end_mode,
        official_kind, score_mode, window_reset, prize_guarantee_coins
      ) values (
        v_title, 'Log a workout', v_desc, v_rules,
        true, v_bob, 'blOb',
        0, 0, 'coins', 'coins',
        true, v_guarantee, 'host_funded', 0,
        v_win.day_count, 30, 0, 1,
        'live', v_win.starts_at, v_win.ends_at, v_win.starts_at,
        'public', 'public', 'fitness',
        'consistency', 'consistency', 'consistency', v_freq,
        public.official_coin_tz(), 'photo', 'auto',
        '[{"id":"pre","name":"Pre-selfie","method":"photo"},
          {"id":"post","name":"Post-selfie","method":"photo"},
          {"id":"hr","name":"Workout","method":"hr"}]'::jsonb,
        '[{"type":"pre_selfie","required":true},
          {"type":"post_selfie","required":true},
          {"type":"hr_monitor","required":true}]'::jsonb,
        'even_split_remaining', 'equal_split', 'normal', false,
        false, 'fixed', 'length',
        v_kind, 'count_days', v_reset, v_guarantee
      );
    else
      update public.challenges
      set title = v_title,
          description = v_desc,
          rules = v_rules,
          sponsor_name = 'blOb',
          score_mode = 'count_days',
          window_reset = v_reset,
          prize_guarantee_coins = v_guarantee,
          host_funded = true,
          host_budget = v_guarantee,
          buy_in_amount = 0,
          currency = 'coins',
          challenge_lane = 'coins',
          frequency = v_freq,
          timezone = public.official_coin_tz(),
          min_participants = 1,
          misses_allowed = 0,
          is_unlimited = false,
          status = 'live',
          updated_at = now()
      where official_kind = v_kind;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Enrollment
-- ---------------------------------------------------------------------------

/** Both rooms, current windows, room_id default. Idempotent. */
create or replace function public.official_coin_enroll(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  ch public.challenges%rowtype;
  v_added int := 0;
  v_rooms uuid[] := '{}';
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'NO_USER');
  end if;
  -- A signed-in caller may only enroll themselves. Server jobs run with no JWT.
  if auth.uid() is not null
     and p_user_id is distinct from auth.uid()
     and not public.is_official_ops() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'NO_PROFILE');
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_user_id and official_coin_opted_out_at is not null
  ) then
    return jsonb_build_object('ok', true, 'added', 0, 'reason', 'OPTED_OUT');
  end if;

  foreach v_kind in array array['coin_weekly', 'coin_monthly']
  loop
    select * into ch from public.challenges where official_kind = v_kind;
    continue when not found;

    insert into public.challenge_participants (
      challenge_id, user_id, status, currency, buy_in_paid, points,
      roster_role, room_id, window_starts_at, window_ends_at
    ) values (
      ch.id, p_user_id, 'active', 'coins', 0, 0,
      'participant', 'default',
      greatest(ch.starts_at, now()), ch.ends_at
    )
    on conflict do nothing;

    if found then
      v_added := v_added + 1;
      v_rooms := v_rooms || ch.id;
    end if;

    begin
      perform public.refresh_participant_progress(ch.id, p_user_id);
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'rooms', to_jsonb(v_rooms));
end;
$$;

/** Server job. Every profiles row that has not opted out. Never admin_mass_join. */
create or replace function public.official_coin_enroll_all()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec record;
  v_res jsonb;
  v_users int := 0;
  v_added int := 0;
begin
  for rec in
    select id from public.profiles
    where official_coin_opted_out_at is null
    order by created_at nulls first
  loop
    begin
      v_res := public.official_coin_enroll(rec.id);
      v_users := v_users + 1;
      v_added := v_added + coalesce((v_res->>'added')::int, 0);
    exception when others then
      raise log 'official coin enroll skip user=% sqlstate=% sqlerrm=%', rec.id, sqlstate, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'users', v_users, 'memberships_added', v_added);
end;
$$;

-- Auto-enroll never counts as the "first Official join" coin grant.
create or replace function public.trg_grant_first_official_join()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = new.challenge_id;
  if not found then
    return new;
  end if;
  if public.is_official_coin_challenge(ch) then
    return new;
  end if;
  if coalesce(ch.is_official, false) then
    perform public.claim_user_grant(new.user_id, 'first_official_join');
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

-- New users: enroll as soon as username + display_name persist,
-- including the "Set this up later" path.
create or replace function public.trg_official_coin_autoenroll()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(btrim(new.display_name), '') = '' then
    return new;
  end if;
  if coalesce(new.username, '') like 'blob\_%' then
    return new;
  end if;
  if new.official_coin_opted_out_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(btrim(old.display_name), '') <> ''
     and old.username is not distinct from new.username then
    return new;
  end if;
  perform public.official_coin_enroll(new.id);
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists profiles_official_coin_autoenroll on public.profiles;
create trigger profiles_official_coin_autoenroll
  after insert or update of username, display_name
  on public.profiles
  for each row execute function public.trg_official_coin_autoenroll();

-- Profile complete also enrolls directly, so the client sees both rooms on the
-- very next read even if the trigger is ever disabled.
create or replace function public.complete_my_profile(
  p_username text,
  p_display_name text,
  p_bio text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_display text;
  v_bio text;
  v_stub text;
  v_out public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  v_username := lower(btrim(coalesce(p_username, '')));
  v_username := regexp_replace(v_username, '^@+', '');
  v_display := btrim(coalesce(p_display_name, ''));
  v_bio := nullif(btrim(coalesce(p_bio, '')), '');
  v_stub := 'blob_' || substr(replace(v_uid::text, '-', ''), 1, 10);

  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'USERNAME_INVALID' using errcode = '22023';
  end if;
  if v_username like 'blob_%' then
    raise exception 'USERNAME_RESERVED' using errcode = '22023';
  end if;
  if char_length(v_display) < 2 or char_length(v_display) > 48 then
    raise exception 'DISPLAY_NAME_REQUIRED' using errcode = '22023';
  end if;
  if v_bio is not null and char_length(v_bio) > 160 then
    raise exception 'BIO_TOO_LONG' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles
    where username = v_username and id <> v_uid
  ) then
    raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end if;

  insert into public.profiles (id, username)
  values (v_uid, v_stub)
  on conflict (id) do nothing;

  begin
    update public.profiles
    set
      username = v_username,
      display_name = v_display,
      bio = v_bio
    where id = v_uid
    returning * into v_out;
  exception
    when unique_violation then
      raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end;

  if not found or v_out.id is null then
    raise exception 'PROFILE_MISSING' using errcode = 'P0002';
  end if;

  begin
    perform public.official_coin_enroll(v_uid);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'username', v_out.username,
    'display_name', v_out.display_name
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. One Official Check-In -> both rooms, one Chicago date
-- ---------------------------------------------------------------------------

/**
 * Submit the room the proofs were staged on, then mirror the same proof set
 * into the sibling room for the SAME Chicago date and submit it too.
 * Two challenge_checkins, two Live posts, one date.
 * Proof uniqueness families differ (weekly vs monthly), so the lock still holds:
 * one proof may count one weekly AND one monthly, never two of either.
 */
create or replace function public.official_coin_checkin(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_src public.challenges%rowtype;
  v_dst public.challenges%rowtype;
  v_period date;
  v_row public.challenge_checkins%rowtype;
  v_primary jsonb;
  v_mirror jsonb := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_src from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  v_primary := public.submit_checkin(p_challenge_id, null);

  if not public.is_official_coin_challenge(v_src) then
    return coalesce(v_primary, '{}'::jsonb) || jsonb_build_object('mirrored', false);
  end if;

  select * into v_dst
  from public.challenges
  where official_kind = case
    when v_src.official_kind = 'coin_weekly' then 'coin_monthly'
    else 'coin_weekly'
  end;
  if not found then
    return coalesce(v_primary, '{}'::jsonb) || jsonb_build_object('mirrored', false);
  end if;

  if not exists (
    select 1 from public.challenge_participants
    where challenge_id = v_dst.id and user_id = v_uid
  ) then
    return coalesce(v_primary, '{}'::jsonb) || jsonb_build_object('mirrored', false);
  end if;

  v_period := public.checkin_period_for(v_src);

  select * into v_row
  from public.challenge_checkins
  where challenge_id = v_src.id
    and user_id = v_uid
    and period_key = v_period
  order by checkin_slot desc
  limit 1;
  if not found then
    return coalesce(v_primary, '{}'::jsonb) || jsonb_build_object('mirrored', false);
  end if;

  -- The proof-uniqueness trigger writes checkin_proof_locks, which has an FK to
  -- challenge_checkins. Open the row empty first, then attach the proofs, so the
  -- lock rows land after the check-in row exists.
  insert into public.challenge_checkins (
    user_id, challenge_id, period_key, status, started_at
  ) values (
    v_uid, v_dst.id, v_period, 'in_progress', coalesce(v_row.started_at, now())
  )
  on conflict (challenge_id, user_id, period_key, checkin_slot) do nothing;

  update public.challenge_checkins
  set proof_parts = coalesce(v_row.proof_parts, '{}'::jsonb),
      pre_selfie_url = v_row.pre_selfie_url,
      post_selfie_url = v_row.post_selfie_url,
      hr_monitor_url = v_row.hr_monitor_url,
      notes = coalesce(v_row.notes, notes),
      health_workout_id = v_row.health_workout_id,
      distance_meters = v_row.distance_meters,
      updated_at = now()
  where challenge_id = v_dst.id
    and user_id = v_uid
    and period_key = v_period
    and status is distinct from 'submitted';

  begin
    v_mirror := public.submit_checkin(v_dst.id, null);
  exception when others then
    raise log 'official coin mirror skip user=% dst=% sqlstate=% sqlerrm=%',
      v_uid, v_dst.id, sqlstate, sqlerrm;
  end;

  return coalesce(v_primary, '{}'::jsonb) || jsonb_build_object(
    'mirrored', v_mirror is not null,
    'mirror', v_mirror,
    'sibling_id', v_dst.id,
    'period_key', v_period
  );
end;
$$;

/** Has this person already filled today's Chicago slot on an Official Coin room? */
create or replace function public.official_coin_checked_in_today(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.challenge_checkins c
    join public.challenges ch on ch.id = c.challenge_id
    where c.user_id = coalesce(p_user_id, auth.uid())
      and ch.official_kind in ('coin_weekly', 'coin_monthly')
      and c.period_key = public.official_coin_today()
      and c.status = 'submitted'
      and c.submitted_at is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- 8. Settlement: days / sum(days) x guarantee, after the real window end
-- ---------------------------------------------------------------------------

create or replace function public.official_coin_credit(
  p_challenge_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_window_starts_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or coalesce(p_amount, 0) <= 0 then
    return;
  end if;

  update public.profiles
  set coins = coalesce(coins, 0) + p_amount,
      credits = coalesce(credits, coins, 0) + p_amount
  where id = p_user_id;

  insert into public.challenge_payouts (challenge_id, user_id, amount)
  values (p_challenge_id, p_user_id, p_amount);

  insert into public.wallet_ledger (
    user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
  ) values (
    p_user_id, p_challenge_id, 'coins', p_amount,
    'distribute_win', 'official_coin_prize',
    jsonb_build_object(
      'official_coin', true,
      'window_starts_at', p_window_starts_at
    ),
    p_challenge_id
  );
end;
$$;

/**
 * Split the house guarantee by days logged in one closed window.
 * Largest remainder, so the room pays the guarantee exactly.
 * Zero-day members get 0. Ghosts never grow the pot.
 * Nobody logged anything -> coins stay house. There was no buy-in to refund.
 */
create or replace function public.official_coin_settle(
  p_challenge_id uuid,
  p_window_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  w public.official_coin_windows%rowtype;
  rec record;
  v_total int := 0;
  v_guarantee int := 0;
  v_paid int := 0;
  v_amount int;
  v_title text;
  v_href text;
  v_winners int := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or not public.is_official_coin_challenge(ch) then
    return jsonb_build_object('ok', false, 'reason', 'NOT_OFFICIAL_COIN');
  end if;

  select * into w
  from public.official_coin_windows
  where challenge_id = p_challenge_id and starts_at = p_window_starts_at
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NO_WINDOW');
  end if;
  if w.settled_at is not null then
    return jsonb_build_object('ok', true, 'already_settled', true);
  end if;

  -- Never settle before the real window end plus the proof-review beat.
  if now() < w.ends_at + public.settlement_review_window() then
    return jsonb_build_object(
      'ok', true,
      'settled', false,
      'reason', 'REVIEW_WINDOW',
      'ready_at', w.ends_at + public.settlement_review_window()
    );
  end if;

  v_guarantee := greatest(coalesce(w.guarantee_coins, 0), 0);
  v_title := public.settlement_receipt_title(ch);
  v_href := '/challenges/' || p_challenge_id::text || '?tab=overview';

  -- Only days logged inside this window by people still on the roster.
  -- Zeros get 0. Ghosts never grow the pot.
  select coalesce(sum(d.days), 0), count(*) filter (where d.days > 0)
    into v_total, v_winners
  from (
    select public.official_coin_days_in_window(
             p_challenge_id, p.user_id, w.starts_at, w.ends_at
           ) as days
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and public.live_joined_participant(p.status, p.eliminated_at)
  ) d;

  if v_total = 0 or v_guarantee = 0 then
    update public.official_coin_windows
    set settled_at = now(), total_days = coalesce(v_total, 0), paid_coins = 0
    where id = w.id;
    return jsonb_build_object(
      'ok', true, 'settled', true, 'total_days', coalesce(v_total, 0),
      'paid_coins', 0, 'house_kept', v_guarantee
    );
  end if;

  -- days/sum(days) x guarantee, largest remainder so the room pays it exactly.
  for rec in
    with loggers as (
      select p.user_id,
             public.official_coin_days_in_window(
               p_challenge_id, p.user_id, w.starts_at, w.ends_at
             ) as days
      from public.challenge_participants p
      where p.challenge_id = p_challenge_id
        and public.live_joined_participant(p.status, p.eliminated_at)
    ),
    base as (
      select l.user_id,
             l.days,
             floor(l.days::numeric * v_guarantee / v_total)::int as whole,
             row_number() over (
               order by
                 (l.days::numeric * v_guarantee / v_total)
                   - floor(l.days::numeric * v_guarantee / v_total) desc,
                 l.days desc,
                 l.user_id
             )::int as rn
      from loggers l
      where l.days > 0
    ),
    sums as (select coalesce(sum(whole), 0)::int as whole_sum from base)
    select b.user_id,
           b.days,
           b.whole + case when b.rn <= (v_guarantee - s.whole_sum) then 1 else 0 end as amount
    from base b cross join sums s
    order by b.rn
  loop
    v_amount := rec.amount;
    if v_amount <= 0 then
      continue;
    end if;
    begin
      perform public.official_coin_credit(p_challenge_id, rec.user_id, v_amount, w.starts_at);
      v_paid := v_paid + v_amount;
      perform public.insert_notification(
        rec.user_id,
        'payout_received',
        v_title || ' Prize',
        v_title || ' settled. ' || v_amount::text || ' coins are in your wallet.',
        jsonb_build_object(
          'type', 'payout_received',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'challenge_title', v_title,
          'amount', v_amount,
          'currency', 'coins',
          'href', v_href,
          'url', v_href,
          'tab', 'overview',
          'dedupe_key', 'official-coin-payout:' || p_challenge_id::text
            || ':' || to_char(w.starts_at at time zone 'UTC', 'YYYYMMDD')
            || ':' || rec.user_id::text
        ),
        null
      );
    exception when others then
      raise log 'official coin payout skip user=% challenge=% sqlstate=% sqlerrm=%',
        rec.user_id, p_challenge_id, sqlstate, sqlerrm;
    end;
  end loop;

  update public.official_coin_windows
  set settled_at = now(), total_days = v_total, paid_coins = v_paid
  where id = w.id;

  return jsonb_build_object(
    'ok', true, 'settled', true, 'total_days', v_total,
    'winners', v_winners, 'paid_coins', v_paid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Roll: close prior window, settle it, reopen the SAME row on the next one
-- ---------------------------------------------------------------------------

create or replace function public.official_coin_roll_windows()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  w record;
  rec record;
  v_rolled int := 0;
  v_settled int := 0;
begin
  for ch in
    select * from public.challenges
    where official_kind in ('coin_weekly', 'coin_monthly')
    for update skip locked
  loop
    select * into w from public.official_coin_window_bounds(ch.official_kind, now());

    -- Make sure the window that is open right now is on the ledger.
    insert into public.official_coin_windows (
      challenge_id, official_kind, starts_at, ends_at, guarantee_coins, day_count
    ) values (
      ch.id, ch.official_kind, w.starts_at, w.ends_at,
      greatest(coalesce(ch.prize_guarantee_coins, 0), 0), w.day_count
    )
    on conflict (challenge_id, starts_at) do nothing;

    if ch.starts_at is distinct from w.starts_at
       or ch.ends_at is distinct from w.ends_at
       or coalesce(ch.days_required, 0) <> w.day_count
       or ch.status is distinct from 'live' then
      update public.challenges
      set starts_at = w.starts_at,
          ends_at = w.ends_at,
          official_started_at = w.starts_at,
          days_required = w.day_count,
          status = 'live',
          settled_at = null,
          distributed_at = null,
          updated_at = now()
      where id = ch.id;

      -- Same roster next window. Opted-out people are already gone.
      update public.challenge_participants
      set window_starts_at = w.starts_at,
          window_ends_at = w.ends_at,
          days_completed = 0,
          completed_at = null,
          result = 'pending',
          status = case when coalesce(status, 'active') = 'withdrawn' then status else 'active' end
      where challenge_id = ch.id
        and (window_starts_at is distinct from w.starts_at);

      v_rolled := v_rolled + 1;
    end if;
  end loop;

  -- Settle every closed window whose review beat has passed.
  for rec in
    select ow.challenge_id, ow.starts_at
    from public.official_coin_windows ow
    where ow.settled_at is null
      and now() >= ow.ends_at + public.settlement_review_window()
    order by ow.ends_at
  loop
    begin
      perform public.official_coin_settle(rec.challenge_id, rec.starts_at);
      v_settled := v_settled + 1;
    exception when others then
      raise log 'official coin settle skip challenge=% window=% sqlstate=% sqlerrm=%',
        rec.challenge_id, rec.starts_at, sqlstate, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'rolled', v_rolled, 'settled', v_settled);
end;
$$;

-- The generic settlement engine must never touch a standing Official Coin room.
create or replace function public.settlement_should_run(p_challenge challenges)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if public.is_official_coin_challenge(p_challenge) then
    return false;
  end if;
  if p_challenge.distributed_at is not null or p_challenge.status = 'settled' then
    return false;
  end if;
  if p_challenge.status in ('cancelled', 'cancelled_underfilled', 'draft') then
    return false;
  end if;
  if coalesce(p_challenge.is_unlimited, false)
     or lower(coalesce(p_challenge.end_mode, '')) = 'indefinite_lms'
     or lower(coalesce(p_challenge.format, '')) = 'lms'
     or lower(coalesce(p_challenge.challenge_type, '')) = 'lms' then
    return false;
  end if;
  if public.settlement_is_illegal_pair(p_challenge) then
    return false;
  end if;
  -- Never pay on last check-in. Wait until real end + 2 hour review window.
  if not public.settlement_review_ready(p_challenge) then
    raise log 'settlement skip review_window challenge_id=% ready_at=% now=%',
      p_challenge.id,
      public.settlement_review_ready_at(p_challenge),
      now();
    return false;
  end if;
  return true;
end;
$function$;

create or replace function public.tick_settlements()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  rec record;
  v_c public.challenges%rowtype;
  v_ready timestamptz;
  v_end timestamptz;
begin
  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and not coalesce(c.is_callout, false)
      and coalesce(c.official_kind, '') = ''
      and c.status in ('upcoming', 'open')
      and public.settlement_effective_ends_at(c) is not null
      and now() >= public.settlement_effective_ends_at(c)
      and c.official_started_at is null
    for update skip locked
  loop
    begin
      update public.challenges
      set status = 'cancelled_underfilled', updated_at = now()
      where id = rec.id
        and status in ('upcoming', 'open')
        and distributed_at is null
        and official_started_at is null;
      perform public.refund_challenge_underfilled(rec.id);
    exception
      when others then
        raise log 'underfilled skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;

  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and not coalesce(c.is_callout, false)
      and coalesce(c.official_kind, '') = ''
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and not coalesce(c.is_unlimited, false)
      and public.settlement_clock_ended(c)
    for update skip locked
  loop
    select * into v_c from public.challenges where id = rec.id;
    if not found then
      continue;
    end if;
    if coalesce(v_c.is_callout, false) then
      continue;
    end if;
    if v_c.status = 'settled' or v_c.distributed_at is not null then
      continue;
    end if;
    if v_c.status in ('live', 'in_progress') then
      update public.challenges
      set status = 'ended', updated_at = now()
      where id = rec.id
        and status in ('live', 'in_progress')
        and distributed_at is null;
    end if;
    if not public.settlement_should_run(v_c) then
      v_ready := public.settlement_review_ready_at(v_c);
      v_end := public.settlement_effective_ends_at(v_c);
      raise log 'settlement skip review_window challenge_id=% ends_at=% ready_at=% now=%',
        rec.id, v_end, v_ready, now();
      continue;
    end if;
    begin
      update public.challenges
      set status = 'settling', updated_at = now()
      where id = rec.id and status is distinct from 'settled';
      perform public.settle_ended_challenge(rec.id);
    exception
      when others then
        raise log 'settlement skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 10. Leave / rejoin Official Coin (leave_challenge stays blocked for Official)
-- ---------------------------------------------------------------------------

create or replace function public.official_coin_leave()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_left int := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.profiles
  set official_coin_opted_out_at = now()
  where id = v_uid;

  delete from public.challenge_checkins c
  using public.challenges ch
  where ch.id = c.challenge_id
    and ch.official_kind in ('coin_weekly', 'coin_monthly')
    and c.user_id = v_uid
    and c.status in ('in_progress', 'ready');

  with gone as (
    delete from public.challenge_participants p
    using public.challenges ch
    where ch.id = p.challenge_id
      and ch.official_kind in ('coin_weekly', 'coin_monthly')
      and p.user_id = v_uid
    returning p.challenge_id
  )
  select count(*)::int into v_left from gone;

  return jsonb_build_object('ok', true, 'left', v_left);
end;
$$;

create or replace function public.official_coin_rejoin()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  update public.profiles
  set official_coin_opted_out_at = null
  where id = v_uid;
  -- window_starts_at = now() -> remaining days of the current window only.
  return public.official_coin_enroll(v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------

grant execute on function public.official_coin_tz() to authenticated, anon;
grant execute on function public.official_coin_today() to authenticated, anon;
grant execute on function public.official_coin_window_bounds(text, timestamptz) to authenticated, anon;
grant execute on function public.official_coin_challenge_id(text) to authenticated, anon;
grant execute on function public.is_official_coin_challenge(challenges) to authenticated, anon;
grant execute on function public.official_coin_days_in_window(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.official_coin_day_count(uuid, uuid) to authenticated;
grant execute on function public.official_coin_allowed_days(uuid, uuid) to authenticated;
grant execute on function public.official_coin_checkin(uuid) to authenticated;
grant execute on function public.official_coin_checked_in_today(uuid) to authenticated;
grant execute on function public.official_coin_enroll(uuid) to authenticated;
grant execute on function public.official_coin_roll_windows() to authenticated;
grant execute on function public.official_coin_leave() to authenticated;
grant execute on function public.official_coin_rejoin() to authenticated;

-- Server-owned. The roll job calls these as definer; nobody calls them from a client.
revoke execute on function public.official_coin_enroll_all() from public, anon, authenticated;
revoke execute on function public.official_coin_settle(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.official_coin_credit(uuid, uuid, integer, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Open the current windows and backfill every existing profile
-- ---------------------------------------------------------------------------

select public.official_coin_roll_windows();
select public.official_coin_enroll_all();

notify pgrst, 'reload schema';
