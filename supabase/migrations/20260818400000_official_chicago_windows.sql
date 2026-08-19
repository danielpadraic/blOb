-- Official series: America/Chicago day windows. One proof fills one window.
-- User-created challenge time handling is unchanged.

alter table public.official_series
  add column if not exists timezone text not null default 'America/Chicago';

update public.official_series
set timezone = 'America/Chicago'
where timezone is distinct from 'America/Chicago';

alter table public.challenges
  add column if not exists day_windows jsonb;

comment on column public.official_series.timezone is
  'IANA zone for every instance of this series. Official guarantee weeks use America/Chicago.';
comment on column public.challenges.day_windows is
  'Official series only: ordered [{day, date, starts_at, ends_at}]. Null for user-created challenges.';

create or replace function public.official_compute_day_windows(
  p_starts_at timestamptz,
  p_tz text default 'America/Chicago',
  p_days int default 7
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'America/Chicago');
  v_days int := greatest(coalesce(p_days, 7), 1);
  v_s_date date;
  v_windows jsonb := '[]'::jsonb;
  v_i int;
  v_cal date;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_starts_at is null then
    return '[]'::jsonb;
  end if;
  if v_tz = 'UTC' then
    v_tz := 'America/Chicago';
  end if;

  v_s_date := (p_starts_at at time zone v_tz)::date;

  -- Day 1: [S, 23:59:59.999 CT on the next calendar date after S’s CT date]
  v_start := p_starts_at;
  v_end := ((v_s_date + 1)::timestamp + time '23:59:59.999') at time zone v_tz;
  v_windows := jsonb_build_array(
    jsonb_build_object(
      'day', 1,
      'date', v_s_date,
      'starts_at', v_start,
      'ends_at', v_end
    )
  );

  -- Days 2–N: CT calendar dates S_date+n, each [00:00, 23:59:59.999]
  for v_i in 2..v_days loop
    v_cal := v_s_date + v_i;
    v_start := v_cal::timestamp at time zone v_tz;
    v_end := (v_cal::timestamp + time '23:59:59.999') at time zone v_tz;
    v_windows := v_windows || jsonb_build_array(
      jsonb_build_object(
        'day', v_i,
        'date', v_cal,
        'starts_at', v_start,
        'ends_at', v_end
      )
    );
  end loop;

  return v_windows;
end;
$$;

create or replace function public.official_window_at(p_windows jsonb, p_at timestamptz)
returns jsonb
language sql
stable
as $$
  select w
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) w
  where p_at >= (w->>'starts_at')::timestamptz
    and p_at <= (w->>'ends_at')::timestamptz
  order by (w->>'day')::int
  limit 1;
$$;

create or replace function public.official_ensure_windows(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_tz text;
  v_days int;
  v_windows jsonb;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return '[]'::jsonb;
  end if;
  if not coalesce(ch.is_official, false) or coalesce(ch.series_id, '') = '' then
    return coalesce(ch.day_windows, '[]'::jsonb);
  end if;

  v_tz := coalesce(nullif(btrim(ch.timezone), ''), 'America/Chicago');
  if v_tz = 'UTC' then
    v_tz := 'America/Chicago';
  end if;
  v_days := greatest(coalesce(ch.days_required, ch.target_count, 7), 1);
  v_windows := ch.day_windows;

  if ch.starts_at is null then
    return coalesce(v_windows, '[]'::jsonb);
  end if;

  if v_windows is null or jsonb_typeof(v_windows) <> 'array' or jsonb_array_length(v_windows) = 0 then
    v_windows := public.official_compute_day_windows(ch.starts_at, v_tz, v_days);
    update public.challenges
    set
      timezone = v_tz,
      day_windows = v_windows,
      ends_at = (v_windows -> -1 ->> 'ends_at')::timestamptz,
      updated_at = now()
    where id = p_challenge_id;
  end if;

  return v_windows;
end;
$$;

create or replace function public.official_valid_day_count(p_challenge_id uuid, p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_windows jsonb;
  v_days int := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;

  if not coalesce(ch.is_official, false) or coalesce(ch.series_id, '') = '' then
    select count(*) into v_days
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id;
    return greatest(coalesce(v_days, 0), 0);
  end if;

  v_windows := coalesce(ch.day_windows, '[]'::jsonb);
  if jsonb_typeof(v_windows) <> 'array' or jsonb_array_length(v_windows) = 0 then
    if ch.starts_at is not null then
      v_windows := public.official_compute_day_windows(
        ch.starts_at,
        coalesce(nullif(ch.timezone, 'UTC'), 'America/Chicago'),
        greatest(coalesce(ch.days_required, 7), 1)
      );
    end if;
  end if;

  select count(distinct (w->>'day')::int) into v_days
  from public.workout_submissions s
  join lateral jsonb_array_elements(coalesce(v_windows, '[]'::jsonb)) w on true
  where s.challenge_id = p_challenge_id
    and s.user_id = p_user_id
    and public.official_submission_is_valid(
      s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
    )
    and s.created_at >= (w->>'starts_at')::timestamptz
    and s.created_at <= (w->>'ends_at')::timestamptz;

  return greatest(coalesce(v_days, 0), 0);
end;
$$;

grant execute on function public.official_compute_day_windows(timestamptz, text, int) to authenticated, anon;
grant execute on function public.official_window_at(jsonb, timestamptz) to authenticated, anon;
grant execute on function public.official_ensure_windows(uuid) to authenticated;
grant execute on function public.official_valid_day_count(uuid, uuid) to authenticated;

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

  perform public.sync_challenge_misses();
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.tick_official_series() to authenticated, service_role;

create or replace function public.official_series_insert_filling(
  p_slug text,
  p_rolled_pot numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.official_series%rowtype;
  v_host uuid;
  v_id uuid;
  v_title text;
  v_buyin numeric(12,2);
  v_guarantee numeric(12,2);
  v_proofs jsonb;
  v_tz text;
begin
  perform pg_advisory_xact_lock(hashtext('official_series:' || coalesce(p_slug, '')));

  select * into v_s from public.official_series where slug = p_slug;
  if not found then
    raise exception 'OFFICIAL_SERIES_NOT_FOUND';
  end if;

  select id into v_id
  from public.challenges
  where series_id = p_slug
    and status in ('filling', 'arming')
  order by created_at desc
  limit 1
  for update;

  if v_id is not null then
    if coalesce(p_rolled_pot, 0) > 0 then
      update public.challenges
      set prize_pool = prize_pool + coalesce(p_rolled_pot, 0), updated_at = now()
      where id = v_id;
    end if;
    return v_id;
  end if;

  v_host := public.official_series_host_id();
  if v_host is null then
    raise exception 'OFFICIAL_HOST_MISSING';
  end if;

  v_tz := coalesce(nullif(btrim(v_s.timezone), ''), 'America/Chicago');
  if v_tz = 'UTC' then
    v_tz := 'America/Chicago';
  end if;
  v_buyin := round(v_s.buyin_cents / 100.0, 2);
  v_guarantee := round(v_s.guarantee_cents / 100.0, 2);
  v_title := case
    when v_s.currency = 'bucks' then v_s.title
    else '10 Coin Guarantee'
  end;
  v_proofs := jsonb_build_array(
    jsonb_build_object('id', 'pre', 'name', 'Pre-selfie', 'method', 'photo'),
    jsonb_build_object('id', 'post', 'name', 'Post-selfie', 'method', 'photo'),
    jsonb_build_object('id', 'hr', 'name', 'Heart rate', 'method', 'hr')
  );

  insert into public.challenges (
    title,
    description,
    rules,
    is_official,
    series_id,
    created_by,
    buy_in_amount,
    host_budget,
    creator_contribution,
    prize_pool,
    days_required,
    target_count,
    required_checkins,
    min_minutes,
    misses_allowed,
    status,
    starts_at,
    ends_at,
    armed_at,
    official_started_at,
    category,
    challenge_type,
    format,
    visibility,
    discoverability,
    challenge_lane,
    frequency,
    proofs,
    proof_requirements,
    proof_type,
    proof_review,
    tasks,
    prize_structure,
    payout_mode,
    funding_model,
    max_participants,
    min_participants,
    is_unlimited,
    currency,
    start_rule,
    start_mode,
    end_mode,
    length_value,
    length_unit,
    creator_participating,
    host_funded,
    task,
    timezone
  ) values (
    v_title,
    'Show up every day. Thirty honest minutes. A picture before, a picture after, and HR proof — screenshot is enough.',
    'Complete 7 workouts of at least 30 minutes in 7 days. Each required day needs a pre-selfie, a post-selfie, and HR proof (a Fitness screenshot or an attached workout). Official days end at 11:59 p.m. Central Time. If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee. If nobody finishes and there are no valid days, the guarantee rolls into the next Official week.',
    true,
    p_slug,
    v_host,
    v_buyin,
    v_guarantee,
    v_guarantee,
    round(coalesce(p_rolled_pot, 0), 2),
    v_s.duration_days,
    v_s.duration_days,
    v_s.duration_days,
    v_s.min_minutes,
    v_s.misses_allowed,
    'filling',
    null,
    null,
    null,
    null,
    'fitness',
    'consistency',
    'consistency',
    'public',
    null,
    'coins',
    'daily',
    v_proofs,
    '[{"type":"pre_selfie","required":true},{"type":"post_selfie","required":true},{"type":"hr_monitor","required":true}]'::jsonb,
    'photo',
    'auto',
    '[]'::jsonb,
    'equal_split',
    'even_split_remaining',
    'participants',
    null,
    1,
    false,
    v_s.currency,
    'legacy',
    null,
    'length',
    v_s.duration_days,
    'days',
    false,
    false,
    '30 min elevated HR',
    v_tz
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.log_workout(
  p_challenge_id uuid,
  p_submission_date date default (timezone('utc', now()))::date,
  p_pre_selfie_url text default null,
  p_post_selfie_url text default null,
  p_hr_monitor_url text default null,
  p_notes text default null,
  p_task_ids jsonb default '[]'::jsonb,
  p_proof_parts jsonb default '{}'::jsonb,
  p_health_workout_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  v_uid uuid := auth.uid();
  v_tasks text[] := '{}';
  v_valid text[] := '{}';
  v_unknown text[] := '{}';
  v_id uuid;
  v_days int;
  rec record;
  v_proofs jsonb;
  v_part jsonb;
  v_method text;
  v_has_parts boolean;
  v_hr_ok boolean;
  v_windows jsonb;
  v_win jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_submission_date is null then
    p_submission_date := (timezone('utc', now()))::date;
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
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
      raise exception 'Logging is closed for this challenge.';
    end if;
    p_submission_date := (v_win->>'date')::date;
  end if;

  if ch.status in ('judging', 'settled') then
    raise exception 'Logging is closed for this challenge.';
  end if;

  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Logging is closed for this challenge.';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if part.eliminated_at is not null then
    raise exception 'You have been eliminated from this challenge.';
  end if;

  if exists (
    select 1
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = v_uid
      and s.submission_date = p_submission_date
  ) then
    raise exception 'You’ve already logged a workout for today.';
  end if;

  if p_health_workout_id is not null then
    if to_regclass('public.health_workouts') is null then
      raise exception 'That workout is not available.';
    elsif not exists (
      select 1 from public.health_workouts hw
      where hw.id = p_health_workout_id and hw.user_id = v_uid
    ) then
      raise exception 'That workout is not available.';
    end if;
  end if;

  v_hr_ok := coalesce(p_hr_monitor_url, '') <> '' or p_health_workout_id is not null;

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select coalesce(array_agg(trim(tid)), '{}') into v_tasks
    from (
      select distinct trim(tid) as tid
      from jsonb_array_elements_text(coalesce(p_task_ids, '[]'::jsonb)) as tid
      where length(trim(tid)) > 0
    ) cleaned;

    if coalesce(array_length(v_tasks, 1), 0) = 0 then
      raise exception 'Pick at least one task you completed.';
    end if;

    select coalesce(array_agg(t->>'id'), '{}') into v_valid
    from jsonb_array_elements(coalesce(ch.tasks, '[]'::jsonb)) t
    where coalesce(t->>'id', '') <> '';

    select coalesce(array_agg(tid), '{}') into v_unknown
    from unnest(v_tasks) as tid
    where tid <> all (coalesce(v_valid, '{}'));

    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'Those tasks are not part of this challenge.';
    end if;
  else
    v_tasks := '{}';
    v_proofs := coalesce(ch.proofs, '[]'::jsonb);
    v_has_parts := jsonb_typeof(coalesce(p_proof_parts, '{}'::jsonb)) = 'object'
      and coalesce(p_proof_parts, '{}'::jsonb) <> '{}'::jsonb;
    if v_has_parts and jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0 then
      for rec in
        select elem
        from jsonb_array_elements(v_proofs) elem
      loop
        v_method := coalesce(rec.elem->>'method', 'photo');
        v_part := coalesce(p_proof_parts -> coalesce(rec.elem->>'id', ''), '{}'::jsonb);
        if v_method = 'honor' then
          continue;
        elsif v_method = 'checkin' then
          if coalesce(nullif(v_part->>'text', ''), nullif(v_part->>'url', ''), '') = '' then
            raise exception 'MISSING_PROOFS';
          end if;
        elsif v_method = 'hr' then
          if coalesce(v_part->>'url', '') = ''
             and coalesce(v_part->>'healthWorkoutId', '') = ''
             and not v_hr_ok then
            raise exception 'MISSING_PROOFS';
          end if;
        else
          if coalesce(v_part->>'url', '') = '' then
            raise exception 'MISSING_PROOFS';
          end if;
        end if;
      end loop;
    else
      for rec in
        select coalesce(req->>'type', '') as proof_type
        from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
        where coalesce((req->>'required')::boolean, true)
      loop
        if rec.proof_type = 'pre_selfie' and coalesce(p_pre_selfie_url, '') = '' then
          raise exception 'Upload every required proof before you log.';
        end if;
        if rec.proof_type = 'post_selfie' and coalesce(p_post_selfie_url, '') = '' then
          raise exception 'Upload every required proof before you log.';
        end if;
        if rec.proof_type = 'hr_monitor' and not v_hr_ok then
          raise exception 'Upload every required proof before you log.';
        end if;
      end loop;
    end if;
  end if;

  insert into public.workout_submissions (
    challenge_id,
    user_id,
    submission_date,
    pre_selfie_url,
    post_selfie_url,
    hr_monitor_url,
    notes,
    status,
    task_ids,
    proof_parts,
    proof_kind,
    health_workout_id
  ) values (
    p_challenge_id,
    v_uid,
    p_submission_date,
    p_pre_selfie_url,
    p_post_selfie_url,
    p_hr_monitor_url,
    p_notes,
    'pending_review',
    to_jsonb(coalesce(v_tasks, '{}')),
    coalesce(p_proof_parts, '{}'::jsonb),
    case when p_health_workout_id is not null then 'health_workout' else 'camera' end,
    p_health_workout_id
  )
  returning id into v_id;

  v_days := public.refresh_participant_progress(p_challenge_id, v_uid);

  return (
    select jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'user_id', s.user_id,
      'submission_date', s.submission_date,
      'pre_selfie_url', s.pre_selfie_url,
      'post_selfie_url', s.post_selfie_url,
      'hr_monitor_url', s.hr_monitor_url,
      'notes', s.notes,
      'status', s.status,
      'created_at', s.created_at,
      'task_ids', s.task_ids,
      'proof_parts', s.proof_parts,
      'proof_kind', s.proof_kind,
      'health_workout_id', s.health_workout_id,
      'days_completed', v_days
    )
    from public.workout_submissions s
    where s.id = v_id
  );
exception
  when unique_violation then
    raise exception 'You’ve already logged a workout for today.';
end;
$$;

grant execute on function public.log_workout(uuid, date, text, text, text, text, jsonb, jsonb, uuid) to authenticated;

create or replace function public.refresh_participant_progress(
  p_challenge_id uuid,
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_days int := 0;
  v_target int := 1;
  v_task_count int := 0;
begin
  select * into ch
  from public.challenges
  where id = p_challenge_id;

  if not found then
    return 0;
  end if;

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select count(distinct tid) into v_task_count
    from public.workout_submissions s
    cross join lateral jsonb_array_elements_text(coalesce(s.task_ids, '[]'::jsonb)) as tid
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id
      and length(trim(tid)) > 0;

    if coalesce(v_task_count, 0) > 0 then
      v_days := v_task_count;
    else
      select count(*) into v_days
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = p_user_id;
    end if;

    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
      v_days := public.official_valid_day_count(p_challenge_id, p_user_id);
    else
      select count(*) into v_days
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = p_user_id;
    end if;

    v_target := greatest(coalesce(ch.target_count, ch.days_required), 1);
  end if;

  v_days := greatest(coalesce(v_days, 0), 0);

  update public.challenge_participants
    set days_completed = v_days,
        completed_at = case
          when coalesce(ch.is_unlimited, false) then completed_at
          when v_days >= v_target then coalesce(completed_at, now())
          else null
        end,
        status = case
          when coalesce(status, 'joined') = 'withdrawn' then status
          when coalesce(ch.is_unlimited, false) then status
          when v_days >= v_target then 'completed'
          when status = 'completed' then 'joined'
          else status
        end
    where challenge_id = p_challenge_id
      and user_id = p_user_id;

  return v_days;
end;
$$;

create or replace function public.sync_challenge_misses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  v_expected int;
  v_elapsed_days int;
  v_weeks int;
  v_windows jsonb;
begin
  for ch in
    select *
    from public.challenges
    where status in ('in_progress', 'live')
      and coalesce(format, 'consistency') = 'consistency'
      and coalesce(is_unlimited, false) = false
      and starts_at is not null
      and now() >= starts_at
  loop
    if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
      v_windows := public.official_ensure_windows(ch.id);
      select count(*) into v_expected
      from jsonb_array_elements(coalesce(v_windows, '[]'::jsonb)) w
      where now() > (w->>'ends_at')::timestamptz;
      v_expected := greatest(coalesce(v_expected, 0), 0);

      update public.challenge_participants p
      set
        status = 'eliminated',
        eliminated_at = coalesce(p.eliminated_at, now())
      where p.challenge_id = ch.id
        and p.status in ('active', 'joined')
        and p.eliminated_at is null
        and (coalesce(p.days_completed, 0) + coalesce(ch.misses_allowed, 0)) < v_expected;
      continue;
    end if;

    v_elapsed_days := greatest(
      floor(extract(epoch from (least(now(), coalesce(ch.ends_at, now())) - ch.starts_at)) / 86400)::int,
      0
    );

    if ch.frequency in ('once') then
      continue;
    elsif ch.frequency in ('3x_week', 'weekly') then
      v_weeks := greatest(ceil(v_elapsed_days / 7.0)::int, 0);
      if ch.frequency = '3x_week' then
        v_expected := v_weeks * 3;
      else
        v_expected := v_weeks * greatest(coalesce(ch.target_count, 1), 1);
      end if;
    elsif ch.frequency = 'custom' then
      v_expected := least(
        coalesce(ch.required_checkins, ch.target_count, 1),
        v_elapsed_days
      );
    else
      v_expected := v_elapsed_days;
    end if;

    v_expected := greatest(v_expected, 0);

    update public.challenge_participants p
    set
      status = 'eliminated',
      eliminated_at = coalesce(p.eliminated_at, now())
    where p.challenge_id = ch.id
      and p.status in ('active', 'joined')
      and p.eliminated_at is null
      and (coalesce(p.days_completed, 0) + coalesce(ch.misses_allowed, 0)) < v_expected;
  end loop;
end;
$$;

create or replace function public.distribute_official_guarantee(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p numeric;
  v_g numeric;
  v_n int;
  v_finisher_c int;
  v_required int;
  v_day_total int;
  v_pay numeric;
  v_platform numeric;
  v_lane text;
  v_fill uuid;
  v_share numeric;
  v_paid numeric := 0;
  v_left numeric;
  rec record;
  v_i int := 0;
  v_count int;
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  if v_c.distributed_at is not null then
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  v_p := round(coalesce(v_c.prize_pool, 0), 2);
  v_g := round(greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0), 2);
  if v_g > v_p then
    v_g := v_p;
  end if;
  v_required := greatest(
    coalesce(v_c.target_count, 0),
    coalesce(v_c.days_required, 0),
    coalesce(v_c.required_checkins, 0),
    1
  );

  select count(*) into v_n
  from challenge_participants
  where challenge_id = p_challenge_id
    and status is distinct from 'refunded_pre_start';

  select count(*) into v_finisher_c
  from challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.status is distinct from 'refunded_pre_start'
    and public.official_valid_day_count(p.challenge_id, p.user_id) >= v_required;

  select coalesce(sum(d.cnt), 0) into v_day_total
  from (
    select public.official_valid_day_count(p.challenge_id, p.user_id) as cnt
    from challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.status is distinct from 'refunded_pre_start'
  ) d;

  if v_finisher_c >= 10 or (v_finisher_c = v_n and v_finisher_c >= 1) then
    v_lane := 'split_pot';
    v_pay := v_p;
    v_platform := 0;
  elsif v_finisher_c >= 1 then
    v_lane := 'split_guarantee';
    v_pay := v_g;
    v_platform := round(v_p - v_g, 2);
  elsif v_day_total > 0 then
    v_lane := 'prorata_guarantee';
    v_pay := v_g;
    v_platform := round(v_p - v_g, 2);
  else
    v_lane := 'roll_guarantee';
    v_pay := 0;
    v_platform := round(v_p - v_g, 2);
    if v_g > 0 and v_c.series_id is not null then
      v_fill := public.official_series_insert_filling(v_c.series_id, v_g);
    end if;
  end if;

  if v_platform < 0 then
    v_platform := 0;
  end if;

  if v_lane = 'split_pot' or v_lane = 'split_guarantee' then
    v_count := v_finisher_c;
    v_share := round(v_pay / v_count, 2);
    v_left := round(v_pay - (v_share * v_count), 2);
    for rec in
      select p.user_id
      from challenge_participants p
      where p.challenge_id = p_challenge_id
        and p.status is distinct from 'refunded_pre_start'
        and public.official_valid_day_count(p.challenge_id, p.user_id) >= v_required
      order by p.joined_at asc, p.user_id asc
    loop
      v_i := v_i + 1;
      perform public.official_credit_payout(
        p_challenge_id,
        rec.user_id,
        v_c.currency,
        v_share + case when v_i = v_count then v_left else 0 end,
        'distribute_win'
      );
      v_paid := v_paid + v_share + case when v_i = v_count then v_left else 0 end;
    end loop;
  elsif v_lane = 'prorata_guarantee' then
    select count(*) into v_count
    from challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.status is distinct from 'refunded_pre_start'
      and public.official_valid_day_count(p.challenge_id, p.user_id) > 0;
    for rec in
      select
        p.user_id,
        public.official_valid_day_count(p.challenge_id, p.user_id) as days
      from challenge_participants p
      where p.challenge_id = p_challenge_id
        and p.status is distinct from 'refunded_pre_start'
      order by p.joined_at asc, p.user_id asc
    loop
      if rec.days <= 0 then
        continue;
      end if;
      v_i := v_i + 1;
      v_share := round(v_pay * rec.days / v_day_total, 2);
      if v_i = v_count then
        v_share := round(v_pay - v_paid, 2);
      end if;
      perform public.official_credit_payout(p_challenge_id, rec.user_id, v_c.currency, v_share, 'distribute_win');
      v_paid := v_paid + v_share;
    end loop;
  end if;

  if v_platform > 0 then
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (
      null,
      p_challenge_id,
      v_c.currency,
      v_platform,
      'platform_retain',
      'official_platform',
      jsonb_build_object(
        'lane', v_lane,
        'P', v_p,
        'G', v_g,
        'C', v_finisher_c,
        'N', v_n
      )
    );
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object(
    'ok', true,
    'lane', v_lane,
    'P', v_p,
    'G', v_g,
    'C', v_finisher_c,
    'N', v_n,
    'paid', v_paid,
    'platform', v_platform,
    'filling_id', v_fill,
    'distributed_at', now()
  );
end;
$$;

grant execute on function public.distribute_official_guarantee(uuid) to authenticated;

update public.challenges
set
  timezone = 'America/Chicago',
  rules = 'Complete 7 workouts of at least 30 minutes in 7 days. Each required day needs a pre-selfie, a post-selfie, and HR proof (a Fitness screenshot or an attached workout). Official days end at 11:59 p.m. Central Time. If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee. If nobody finishes and there are no valid days, the guarantee rolls into the next Official week.'
where is_official
  and series_id is not null
  and status in ('filling', 'arming', 'live');

-- Stamp windows on any already-live Official instance from its starts_at.
update public.challenges c
set
  timezone = 'America/Chicago',
  day_windows = public.official_compute_day_windows(c.starts_at, 'America/Chicago', greatest(coalesce(c.days_required, 7), 1)),
  ends_at = (
    public.official_compute_day_windows(c.starts_at, 'America/Chicago', greatest(coalesce(c.days_required, 7), 1))
    -> -1 ->> 'ends_at'
  )::timestamptz,
  updated_at = now()
where c.is_official
  and c.series_id is not null
  and c.status = 'live'
  and c.starts_at is not null;

notify pgrst, 'reload schema';
