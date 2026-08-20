-- User-created challenges go live only at starts_at when joined >= min_participants (default 2).
-- Under min: roll starts_at +1 day and prompt the host keep-vs-shorten. Official series unchanged.

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
exception when others then
  null;
end $$;

do $$
begin
  alter table public.notifications add constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'mentioned',
    'profile_wall',
    'challenge_joined',
    'challenge_join_confirmed',
    'follow',
    'friend_request',
    'friend_accepted',
    'post_comment',
    'post_reaction',
    'post_reposted',
    'story_reaction',
    'story_comment',
    'story_shared',
    'coins_received',
    'coin_grant',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated',
    'challenge_starting',
    'challenge_checkin_reminder',
    'challenge_checkin',
    'competitor_dropped',
    'challenge_won',
    'challenge_lost',
    'payout_received',
    'profile_incomplete',
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
    'badge_unlocked',
    'challenge_cancelled',
    'message',
    'official_started',
    'proof_flagged',
    'start_rolled'
  ));
exception when others then
  alter table public.notifications drop constraint if exists notifications_type_known;
end $$;

alter table public.challenges
  add column if not exists start_roll_pending boolean not null default false;

alter table public.challenges
  add column if not exists start_roll_keep_days integer;

alter table public.challenges
  add column if not exists start_roll_shift_days integer not null default 0;

do $$
begin
  alter table public.challenges alter column min_participants set default 2;
exception when others then
  null;
end $$;

comment on column public.challenges.start_roll_pending is
  'Host must pick keep duration or shorten after an under-min start roll.';

create or replace function public.challenge_joined_count(p_challenge_id uuid)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and coalesce(status, 'joined') is distinct from 'refunded_pre_start'
    and coalesce(status, 'joined') is distinct from 'withdrawn';
$$;

create or replace function public.user_challenge_min_needed(p_min int)
returns int
language sql
immutable
set search_path = public
as $$
  select greatest(coalesce(p_min, 2), 2);
$$;

create or replace function public.format_start_roll_when(p_at timestamptz, p_tz text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
begin
  begin
    return trim(to_char(p_at at time zone v_tz, 'FMMon FMDD'));
  exception when others then
    return trim(to_char(p_at at time zone 'UTC', 'FMMon FMDD'));
  end;
end;
$$;

create or replace function public.notify_start_rolled(ch public.challenges)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_when text;
  v_body text;
  v_keep int;
  v_remain interval;
begin
  if ch.created_by is null then
    return;
  end if;
  v_when := public.format_start_roll_when(ch.starts_at, ch.timezone);
  v_body := 'Not enough people yet. Start moved to ' || v_when || '.';
  v_keep := greatest(coalesce(ch.start_roll_keep_days, 1), 1);
  v_remain := case
    when ch.ends_at is null then interval '1 day'
    else ch.ends_at - ch.starts_at
  end;
  perform public.notify_user(
    ch.created_by,
    null,
    'start_rolled',
    v_body,
    v_body,
    jsonb_build_object(
      'challenge_id', ch.id,
      'starts_at', ch.starts_at,
      'keep_days', v_keep,
      'can_shorten', (ch.ends_at is not null and v_remain >= interval '1 day'),
      'dedupe_key', 'start_rolled:' || ch.id::text || ':' || ch.starts_at::text
    )
  );
end;
$$;

create or replace function public.roll_user_challenge_start(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_keep int;
  v_shift int := 0;
  v_start timestamptz;
begin
  select * into ch from public.challenges where id = p_id for update;
  if not found then
    return;
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    return;
  end if;
  if ch.status in ('live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    return;
  end if;

  v_start := ch.starts_at;
  if v_start is null then
    return;
  end if;
  if ch.ends_at is not null then
    v_keep := greatest(1, ceil(extract(epoch from (ch.ends_at - v_start)) / 86400.0)::int);
  else
    v_keep := greatest(1, coalesce(ch.length_value, ch.days_required, 1)::int);
  end if;
  if coalesce(ch.start_roll_pending, false) and coalesce(ch.start_roll_keep_days, 0) > 0 then
    v_keep := ch.start_roll_keep_days;
  end if;

  while v_start <= now() loop
    v_start := v_start + interval '1 day';
    v_shift := v_shift + 1;
  end loop;
  if v_shift <= 0 then
    return;
  end if;

  update public.challenges
  set
    starts_at = v_start,
    status = case when status in ('upcoming', 'starting', 'in_progress') then 'open' else status end,
    official_started_at = null,
    start_roll_pending = true,
    start_roll_keep_days = v_keep,
    start_roll_shift_days = coalesce(start_roll_shift_days, 0) + v_shift,
    updated_at = now()
  where id = p_id
  returning * into ch;

  begin
    perform public.notify_start_rolled(ch);
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.tick_user_challenge_starts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_joined int;
  v_need int;
  v_live int := 0;
  v_rolled int := 0;
begin
  for rec in
    select *
    from public.challenges
    where coalesce(is_official, false) = false
      and coalesce(series_id, '') = ''
      and status in ('upcoming', 'open', 'starting', 'in_progress')
      and starts_at is not null
      and now() >= starts_at
      and (ends_at is null or now() < ends_at)
      and status is distinct from 'live'
    for update skip locked
  loop
    if rec.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
      continue;
    end if;
    v_joined := public.challenge_joined_count(rec.id);
    v_need := public.user_challenge_min_needed(rec.min_participants);
    if v_joined >= v_need then
      update public.challenges
      set
        status = 'live',
        official_started_at = coalesce(official_started_at, starts_at),
        start_roll_pending = false,
        start_roll_shift_days = 0,
        updated_at = now()
      where id = rec.id;
      v_live := v_live + 1;
    else
      perform public.roll_user_challenge_start(rec.id);
      v_rolled := v_rolled + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'went_live', v_live, 'rolled', v_rolled);
end;
$$;

grant execute on function public.tick_user_challenge_starts() to authenticated, service_role;

create or replace function public.nudge_challenge_start(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_keep int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if ch.status = 'live' then
    raise exception 'ALREADY_STARTED';
  end if;
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workout_submissions s where s.challenge_id = p_challenge_id
  ) then
    raise exception 'ALREADY_STARTED';
  end if;

  if ch.ends_at is not null then
    v_keep := greatest(1, ceil(extract(epoch from (ch.ends_at - ch.starts_at)) / 86400.0)::int);
  else
    v_keep := greatest(1, coalesce(ch.length_value, ch.days_required, 1)::int);
  end if;
  if coalesce(ch.start_roll_pending, false) and coalesce(ch.start_roll_keep_days, 0) > 0 then
    v_keep := ch.start_roll_keep_days;
  end if;

  update public.challenges
  set
    starts_at = starts_at + interval '1 day',
    start_roll_pending = true,
    start_roll_keep_days = v_keep,
    start_roll_shift_days = coalesce(start_roll_shift_days, 0) + 1,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return to_jsonb(ch);
end;
$$;

create or replace function public.resolve_start_roll(p_challenge_id uuid, p_keep boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_remain interval;
  v_shift int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not coalesce(ch.start_roll_pending, false) then
    return to_jsonb(ch);
  end if;

  v_shift := greatest(coalesce(ch.start_roll_shift_days, 1), 1);
  v_remain := case when ch.ends_at is null then interval '1 day' else ch.ends_at - ch.starts_at end;

  if p_keep then
    if ch.ends_at is not null then
      ch.ends_at := ch.ends_at + (v_shift * interval '1 day');
    end if;
  else
    if ch.ends_at is null or v_remain < interval '1 day' then
      raise exception 'DURATION_TOO_SHORT';
    end if;
    if ch.length_value is not null then
      ch.length_value := greatest(1, ch.length_value - v_shift);
    end if;
    if ch.days_required is not null then
      ch.days_required := greatest(1, ch.days_required - v_shift);
    end if;
  end if;

  update public.challenges
  set
    ends_at = ch.ends_at,
    length_value = ch.length_value,
    days_required = ch.days_required,
    start_roll_pending = false,
    start_roll_shift_days = 0,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return to_jsonb(ch);
end;
$$;

create or replace function public.update_user_challenge(p_challenge_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_min int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if ch.status = 'live' then
    raise exception 'ALREADY_STARTED';
  end if;
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.workout_submissions s where s.challenge_id = p_challenge_id) then
    raise exception 'ALREADY_STARTED';
  end if;

  v_min := greatest(coalesce(nullif(p_payload->>'min_participants', '')::int, ch.min_participants, 2), 2);

  update public.challenges
  set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
    description = coalesce(p_payload->>'description', description),
    rules = coalesce(p_payload->>'rules', rules),
    starts_at = coalesce(nullif(p_payload->>'starts_at', '')::timestamptz, starts_at),
    ends_at = case
      when coalesce((p_payload->>'is_unlimited')::boolean, is_unlimited) then null
      else coalesce(nullif(p_payload->>'ends_at', '')::timestamptz, ends_at)
    end,
    is_unlimited = coalesce((p_payload->>'is_unlimited')::boolean, is_unlimited),
    min_participants = v_min,
    days_required = coalesce(nullif(p_payload->>'days_required', '')::int, days_required),
    target_count = coalesce(nullif(p_payload->>'target_count', '')::int, target_count),
    min_minutes = coalesce(nullif(p_payload->>'min_minutes', '')::int, min_minutes),
    frequency = coalesce(p_payload->>'frequency', frequency),
    proofs = coalesce(p_payload->'proofs', proofs),
    proof_requirements = coalesce(p_payload->'proof_requirements', proof_requirements),
    tasks = coalesce(p_payload->'tasks', tasks),
    rules_list = coalesce(p_payload->'rules_list', rules_list),
    visibility = coalesce(p_payload->>'visibility', visibility),
    discoverability = coalesce(p_payload->>'discoverability', discoverability),
    task = coalesce(p_payload->>'task', task),
    length_value = coalesce(nullif(p_payload->>'length_value', '')::int, length_value),
    length_unit = coalesce(p_payload->>'length_unit', length_unit),
    required_checkins = coalesce(nullif(p_payload->>'required_checkins', '')::int, required_checkins),
    misses_allowed = coalesce(nullif(p_payload->>'misses_allowed', '')::int, misses_allowed),
    proof_type = coalesce(p_payload->>'proof_type', proof_type),
    cover_image_url = coalesce(p_payload->>'cover_image_url', cover_image_url),
    rules_video_url = coalesce(p_payload->>'rules_video_url', rules_video_url),
    start_roll_pending = false,
    start_roll_shift_days = 0,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return to_jsonb(ch);
end;
$$;

grant execute on function public.nudge_challenge_start(uuid) to authenticated;
grant execute on function public.resolve_start_roll(uuid, boolean) to authenticated;
grant execute on function public.update_user_challenge(uuid, jsonb) to authenticated;

create or replace function public.checkin_assert_open(ch public.challenges, part public.challenge_participants)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
begin
  if ch.status is distinct from 'live' then
    raise exception 'NOT_STARTED';
  end if;
  if ch.starts_at is not null and now() < ch.starts_at then
    raise exception 'NOT_STARTED';
  end if;
  if ch.official_started_at is not null and now() < ch.official_started_at then
    raise exception 'NOT_STARTED';
  end if;
  if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
    v_windows := public.official_ensure_windows(ch.id);
    v_win := public.official_window_at(v_windows, now());
    if v_win is null then
      raise exception 'Check-in is closed for this challenge.';
    end if;
  end if;
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    raise exception 'Check-in is closed for this challenge.';
  end if;
  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Check-in is closed for this challenge.';
  end if;
  if part.eliminated_at is not null then
    raise exception 'You have been eliminated from this challenge.';
  end if;
  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join this challenge before you check in.';
  end if;
end;
$$;

create or replace function public.guard_workout_on_closed_challenge()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.challenges
  where id = new.challenge_id;

  if v_status is distinct from 'live' then
    raise exception 'NOT_STARTED';
  end if;
  return new;
end;
$$;

create or replace function public.tick_official_series()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_s public.official_series%rowtype;
  v_duration int;
  v_tz text;
  v_start timestamptz;
  v_windows jsonb;
begin
  for v_s in select * from public.official_series loop
    perform pg_advisory_xact_lock(hashtext('official_series:' || v_s.slug));
    v_tz := coalesce(nullif(btrim(v_s.timezone), ''), 'America/Chicago');
    if v_tz = 'UTC' then
      v_tz := 'America/Chicago';
    end if;
    v_duration := coalesce(v_s.duration_days, 7);

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'live'
        and ends_at is not null
        and now() >= ends_at
        and distributed_at is null
      for update skip locked
    loop
      begin
        perform public.distribute_challenge(rec.id);
      exception when others then
        null;
      end;
    end loop;

    update public.challenges
    set
      status = 'arming',
      armed_at = coalesce(armed_at, now()),
      updated_at = now()
    where series_id = v_s.slug
      and is_official
      and status = 'filling'
      and 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0) > 0
      and coalesce(prize_pool, 0) >= 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0);

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'arming'
        and armed_at is not null
        and now() >= armed_at + interval '1 hour'
      for update skip locked
    loop
      v_start := now();
      v_windows := public.official_compute_day_windows(v_start, v_tz, v_duration);
      update public.challenges
      set
        status = 'live',
        starts_at = v_start,
        day_windows = v_windows,
        timezone = v_tz,
        ends_at = (v_windows -> -1 ->> 'ends_at')::timestamptz,
        official_started_at = coalesce(official_started_at, v_start),
        updated_at = now()
      where id = rec.id;
      perform public.official_series_insert_filling(v_s.slug, 0);
    end loop;

    update public.challenges c
    set
      timezone = v_tz,
      day_windows = public.official_compute_day_windows(c.starts_at, v_tz, v_duration),
      ends_at = (public.official_compute_day_windows(c.starts_at, v_tz, v_duration) -> -1 ->> 'ends_at')::timestamptz,
      updated_at = now()
    where c.series_id = v_s.slug
      and c.is_official
      and c.status = 'live'
      and c.starts_at is not null
      and (
        c.day_windows is null
        or jsonb_typeof(c.day_windows) is distinct from 'array'
        or jsonb_array_length(c.day_windows) = 0
      );

    if not exists (
      select 1 from public.challenges
      where series_id = v_s.slug and status in ('filling', 'arming')
    ) then
      perform public.official_series_insert_filling(v_s.slug, 0);
    end if;
  end loop;

  begin
    perform public.tick_user_challenge_starts();
  exception when others then
    null;
  end;
  perform public.sync_challenge_misses();
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.tick_official_series() to authenticated, service_role;

create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  perform public.tick_official_series();
  perform public.tick_user_challenge_starts();
  perform public.sync_challenge_misses();
  perform public.sync_unlimited_eliminations();

  for rec in
    select id
    from public.challenges
    where status in ('in_progress', 'live')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false
      and coalesce(payout_mode, 'even_split_remaining') = 'even_split_remaining'
      and coalesce(prize_structure, 'equal_split') not in ('winner_take_all', 'top_places')
      and distributed_at is null
    for update skip locked
  loop
    begin
      perform public.distribute_challenge(rec.id);
    exception when others then
      update public.challenges
      set status = 'judging'
      where id = rec.id and status in ('in_progress', 'live') and series_id is null;
    end;
  end loop;

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and series_id is null
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false
      and distributed_at is null;
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;

-- Running user challenges that already met min become live. Under-min in_progress goes back to open.
update public.challenges c
set status = 'live',
    official_started_at = coalesce(official_started_at, starts_at),
    updated_at = now()
where coalesce(is_official, false) = false
  and coalesce(series_id, '') = ''
  and status = 'in_progress'
  and (ends_at is null or now() < ends_at)
  and public.challenge_joined_count(c.id) >= public.user_challenge_min_needed(c.min_participants);

update public.challenges c
set status = 'open',
    official_started_at = null,
    updated_at = now()
where coalesce(is_official, false) = false
  and coalesce(series_id, '') = ''
  and status = 'in_progress'
  and (ends_at is null or now() < ends_at)
  and public.challenge_joined_count(c.id) < public.user_challenge_min_needed(c.min_participants);

do $$
begin
  perform public.tick_user_challenge_starts();
exception when others then
  raise notice 'tick_user_challenge_starts backfill: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid)
      from cron.job j
      where j.jobname in ('tick-official-series', 'tick-challenge-clocks');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'tick-official-series',
      '* * * * *',
      'select public.tick_official_series()'
    );
  end if;
exception when others then
  raise notice 'pg_cron skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
