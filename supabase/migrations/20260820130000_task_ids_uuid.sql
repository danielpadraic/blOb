-- workout_submissions.task_ids is uuid[] on production.
-- log_workout / log_health_workout were inserting jsonb (42804).

create or replace function public.as_task_id_uuids(p_ids jsonb)
returns uuid[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(x), '{}'::uuid[])
  from (
    select distinct trim(tid)::uuid as x
    from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) as tid
    where trim(tid) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) parsed;
$$;

create or replace function public.as_task_id_uuids(p_ids text[])
returns uuid[]
language sql
immutable
set search_path = public
as $$
  select public.as_task_id_uuids(to_jsonb(coalesce(p_ids, '{}'::text[])));
$$;

grant execute on function public.as_task_id_uuids(jsonb) to authenticated;
grant execute on function public.as_task_id_uuids(text[]) to authenticated;

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
  v_task_uuids uuid[] := '{}';
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
      raise exception 'Check-in is closed for this challenge.';
    end if;
    p_submission_date := (v_win->>'date')::date;
  end if;

  if ch.status in ('judging', 'settled') then
    raise exception 'Check-in is closed for this challenge.';
  end if;

  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Check-in is closed for this challenge.';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join this challenge before you check in.';
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
    raise exception 'ALREADY_LOGGED_TODAY';
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
             and coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id', '') = ''
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
        if rec.proof_type in ('hr_monitor', 'hr') and not v_hr_ok then
          raise exception 'Upload every required proof before you log.';
        end if;
      end loop;
    end if;
  end if;

  v_task_uuids := public.as_task_id_uuids(v_tasks);

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
    v_task_uuids,
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
      'task_ids', to_jsonb(s.task_ids),
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
    raise exception 'ALREADY_LOGGED_TODAY';
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
    select count(distinct tid::text) into v_task_count
    from public.workout_submissions s
    cross join lateral unnest(coalesce(s.task_ids, '{}'::uuid[])) as tid
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id;

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
  if v_row.status = 'submitted' then
    raise exception 'ALREADY_LOGGED_TODAY';
  end if;
  if not public.checkin_proofs_ready(ch, v_row.proof_parts) then
    raise exception 'MISSING_PROOFS';
  end if;

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

  update public.challenge_checkins
  set
    status = 'submitted',
    submitted_at = now(),
    workout_submission_id = (v_logged->>'id')::uuid,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

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

  return v_logged || jsonb_build_object('checkin', public.checkin_row_json(v_row.id));
end;
$$;

grant execute on function public.submit_checkin(uuid) to authenticated;

notify pgrst, 'reload schema';
