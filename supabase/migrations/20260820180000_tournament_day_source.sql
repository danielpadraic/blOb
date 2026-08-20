-- Tournament day source of truth: submitted challenge_checkins only.
-- Official settle math (official_valid_day_count) is unchanged.

alter table public.challenge_checkins
  add column if not exists status text;
alter table public.challenge_checkins
  add column if not exists period_key date;
alter table public.challenge_checkins
  add column if not exists submitted_at timestamptz;

update public.challenge_checkins
set
  status = case
    when submitted_at is not null then 'submitted'
    when coalesce(status, '') in ('in_progress', 'ready', 'submitted') then status
    else 'in_progress'
  end,
  period_key = coalesce(
    period_key,
    (timezone('utc', submitted_at))::date,
    (timezone('utc', started_at))::date,
    (timezone('utc', created_at))::date
  )
where submitted_at is not null
   or period_key is null
   or coalesce(status, '') = '';

do $$
begin
  alter table public.challenge_checkins
    alter column status set default 'in_progress';
  alter table public.challenge_checkins
    alter column status set not null;
exception when others then
  null;
end $$;

do $$
begin
  alter table public.challenge_checkins
    alter column period_key set not null;
exception when others then
  null;
end $$;

alter table public.challenge_checkins drop constraint if exists challenge_checkins_status_check;
alter table public.challenge_checkins
  add constraint challenge_checkins_status_check
  check (status in ('in_progress', 'ready', 'submitted'));

alter table public.challenge_checkins drop constraint if exists challenge_checkins_submitted_chk;
alter table public.challenge_checkins
  add constraint challenge_checkins_submitted_chk
  check (status is distinct from 'submitted' or submitted_at is not null);

create unique index if not exists challenge_checkins_user_period_uidx
  on public.challenge_checkins (challenge_id, user_id, period_key);

comment on table public.challenge_checkins is
  'Tournament day source of truth. A period counts only when status=submitted and submitted_at is not null. Posts do not count.';

create or replace function public.submitted_checkin_count(p_challenge_id uuid, p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.challenge_checkins
  where challenge_id = p_challenge_id
    and user_id = p_user_id
    and status = 'submitted'
    and submitted_at is not null;
$$;

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
begin
  select * into ch
  from public.challenges
  where id = p_challenge_id;

  if not found then
    return 0;
  end if;

  v_days := public.submitted_checkin_count(p_challenge_id, p_user_id);

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
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

create or replace function public.sync_all_days_completed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenge_participants p
  set days_completed = s.n
  from (
    select
      p2.id,
      public.submitted_checkin_count(p2.challenge_id, p2.user_id) as n
    from public.challenge_participants p2
  ) s
  where p.id = s.id
    and p.days_completed is distinct from s.n;
end;
$$;

create or replace function public.trg_sync_days_from_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_participant_progress(old.challenge_id, old.user_id);
    return old;
  end if;
  perform public.refresh_participant_progress(new.challenge_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists challenge_checkins_sync_days on public.challenge_checkins;
create trigger challenge_checkins_sync_days
  after update of status, submitted_at or delete
  on public.challenge_checkins
  for each row execute function public.trg_sync_days_from_checkin();

create or replace function public.save_checkin_proof(
  p_challenge_id uuid,
  p_proof_id text default null,
  p_proof_part jsonb default null,
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
  v_period date;
  v_row public.challenge_checkins%rowtype;
  v_new boolean := false;
  v_parts jsonb;
  v_part jsonb;
  v_method text;
  v_name text;
  v_media text[] := '{}';
  v_url text;
  v_status text;
  v_had_proof boolean := false;
  v_elem jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  perform public.checkin_assert_open(ch, part);
  v_period := public.checkin_period_for(ch);

  select * into v_row
  from public.challenge_checkins
  where challenge_id = p_challenge_id and user_id = v_uid and period_key = v_period
  for update;

  if found then
    if v_row.status = 'submitted' and v_row.submitted_at is not null then
      return public.checkin_row_json(v_row.id);
    end if;
  else
    begin
      insert into public.challenge_checkins (
        user_id, challenge_id, period_key, status, proof_parts
      ) values (
        v_uid, p_challenge_id, v_period, 'in_progress', '{}'::jsonb
      )
      returning * into v_row;
      v_new := true;
    exception when unique_violation then
      select * into v_row
      from public.challenge_checkins
      where challenge_id = p_challenge_id and user_id = v_uid and period_key = v_period
      for update;
      if not found then
        raise;
      end if;
      if v_row.status = 'submitted' and v_row.submitted_at is not null then
        return public.checkin_row_json(v_row.id);
      end if;
    end;
  end if;

  v_parts := coalesce(v_row.proof_parts, '{}'::jsonb);
  if p_proof_id is null then
    for v_elem in
      select value
      from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) as t(value)
    loop
      if coalesce(v_elem->>'method', '') = 'honor' then
        v_parts := v_parts || jsonb_build_object(
          coalesce(nullif(v_elem->>'id', ''), 'honor'),
          jsonb_build_object('method', 'honor')
        );
      end if;
    end loop;
  end if;
  if p_proof_id is not null and p_proof_part is not null then
    v_had_proof := coalesce(v_parts -> p_proof_id, 'null'::jsonb) <> 'null'::jsonb
      and coalesce(v_parts -> p_proof_id, '{}'::jsonb) <> '{}'::jsonb;
    v_part := p_proof_part;
    if p_health_workout_id is not null and coalesce(v_part->>'healthWorkoutId', '') = '' then
      v_part := v_part || jsonb_build_object('healthWorkoutId', p_health_workout_id::text);
    end if;
    v_parts := v_parts || jsonb_build_object(p_proof_id, v_part);
    v_url := coalesce(nullif(v_part->>'url', ''), '');
    v_method := coalesce(v_part->>'method', '');
    select lower(coalesce(elem->>'name', '')) into v_name
    from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
    where coalesce(elem->>'id', '') = p_proof_id
    limit 1;
    if v_method = 'hr' or v_name like '%heart%' then
      if v_url <> '' then
        v_row.hr_monitor_url := v_url;
      end if;
    elsif v_name like '%pre%' then
      if v_url <> '' then
        v_row.pre_selfie_url := v_url;
      end if;
    elsif v_name like '%post%' then
      if v_url <> '' then
        v_row.post_selfie_url := v_url;
      end if;
    elsif v_url <> '' and coalesce(v_row.pre_selfie_url, '') = '' then
      v_row.pre_selfie_url := v_url;
    end if;
    if coalesce(v_part->>'text', '') <> '' then
      v_row.notes := v_part->>'text';
    end if;
  end if;

  if p_health_workout_id is not null then
    v_row.health_workout_id := p_health_workout_id;
  elsif coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id', '') <> '' then
    begin
      v_row.health_workout_id := coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id')::uuid;
    exception when others then
      null;
    end;
  end if;

  if public.checkin_proofs_ready(ch, v_parts) then
    v_status := 'ready';
  else
    v_status := 'in_progress';
  end if;

  update public.challenge_checkins
  set
    proof_parts = v_parts,
    status = v_status,
    pre_selfie_url = v_row.pre_selfie_url,
    post_selfie_url = v_row.post_selfie_url,
    hr_monitor_url = v_row.hr_monitor_url,
    notes = v_row.notes,
    health_workout_id = v_row.health_workout_id,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  if v_url <> '' then
    v_media := array[v_url];
  end if;

  if v_new then
    perform public.post_checkin_stage(
      v_uid, p_challenge_id, v_row.id, 'Started check-in.', v_media, 'started'
    );
  elsif p_proof_id is not null and not v_had_proof then
    perform public.post_checkin_stage(
      v_uid,
      p_challenge_id,
      v_row.id,
      public.checkin_added_copy(ch, p_proof_id),
      v_media,
      'proof'
    );
  end if;

  return public.checkin_row_json(v_row.id);
end;
$$;

create or replace function public.submit_checkin(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  v_uid uuid := auth.uid();
  v_period date;
  v_row public.challenge_checkins%rowtype;
  v_logged jsonb;
  v_media text[] := '{}';
  v_workout uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  perform public.checkin_assert_open(ch, part);
  v_period := public.checkin_period_for(ch);

  select * into v_row
  from public.challenge_checkins
  where challenge_id = p_challenge_id and user_id = v_uid and period_key = v_period
  for update;

  if not found then
    raise exception 'Begin check-in first.';
  end if;

  if v_row.status = 'submitted' and v_row.submitted_at is not null then
    perform public.refresh_participant_progress(p_challenge_id, v_uid);
    if v_row.workout_submission_id is not null then
      select jsonb_build_object('id', s.id) into v_logged
      from public.workout_submissions s
      where s.id = v_row.workout_submission_id;
    end if;
    return coalesce(v_logged, '{}'::jsonb) || jsonb_build_object('checkin', public.checkin_row_json(v_row.id));
  end if;

  if not public.checkin_proofs_ready(ch, v_row.proof_parts) then
    raise exception 'MISSING_PROOFS';
  end if;

  update public.challenge_checkins
  set
    status = 'submitted',
    submitted_at = coalesce(submitted_at, now()),
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  begin
    v_logged := public.log_workout(
      p_challenge_id,
      v_period,
      v_row.pre_selfie_url,
      v_row.post_selfie_url,
      v_row.hr_monitor_url,
      v_row.notes,
      '[]'::jsonb,
      v_row.proof_parts,
      v_row.health_workout_id
    );
    v_workout := (v_logged->>'id')::uuid;
  exception
    when unique_violation then
      select s.id into v_workout
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = v_uid
        and s.submission_date = v_period
      limit 1;
      v_logged := jsonb_build_object('id', v_workout);
    when others then
      if sqlerrm ilike '%ALREADY_LOGGED_TODAY%' then
        select s.id into v_workout
        from public.workout_submissions s
        where s.challenge_id = p_challenge_id
          and s.user_id = v_uid
          and s.submission_date = v_period
        limit 1;
        v_logged := jsonb_build_object('id', v_workout);
      else
        raise;
      end if;
  end;

  if v_workout is not null then
    update public.challenge_checkins
    set workout_submission_id = v_workout, updated_at = now()
    where id = v_row.id
    returning * into v_row;
  end if;

  perform public.refresh_participant_progress(p_challenge_id, v_uid);

  if coalesce(v_row.post_selfie_url, '') <> '' then
    v_media := array[v_row.post_selfie_url];
  elsif coalesce(v_row.pre_selfie_url, '') <> '' then
    v_media := array[v_row.pre_selfie_url];
  elsif coalesce(v_row.hr_monitor_url, '') <> '' then
    v_media := array[v_row.hr_monitor_url];
  end if;

  perform public.post_checkin_stage(
    v_uid, p_challenge_id, v_row.id, 'Checked in.', v_media, 'submitted'
  );

  return coalesce(v_logged, '{}'::jsonb) || jsonb_build_object('checkin', public.checkin_row_json(v_row.id));
end;
$$;

grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.submit_checkin(uuid) to authenticated;

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
  begin
    perform public.tick_bob_encouragements();
  exception when others then
    null;
  end;
  begin
    perform public.sync_all_days_completed();
  exception when others then
    null;
  end;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.tick_official_series() to authenticated, service_role;

do $$
begin
  perform public.sync_all_days_completed();
end $$;

notify pgrst, 'reload schema';
