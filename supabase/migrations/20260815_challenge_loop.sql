-- Close the multi-participant challenge loop:
-- server-authoritative activity logging, progress, judging, and settlement compatibility.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Submissions can record which points-challenge tasks this log covers.
-- ---------------------------------------------------------------------------

alter table public.workout_submissions
  add column if not exists task_ids jsonb not null default '[]'::jsonb;

comment on column public.workout_submissions.task_ids is
  'Points challenges: task ids completed in this log. Empty for consistency / three-proof days.';

-- ---------------------------------------------------------------------------
-- Recalculate days_completed from submissions (never increment blindly).
-- Consistency: one point per unique calendar day.
-- Points: unique task ids across logs; fall back to log count if none recorded.
-- ---------------------------------------------------------------------------

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
    select count(*) into v_days
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id;

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

create or replace function public.trg_refresh_participant_progress()
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

drop trigger if exists workout_submissions_sync_days on public.workout_submissions;
drop trigger if exists workout_submissions_apply_progress on public.workout_submissions;

create trigger workout_submissions_apply_progress
  after insert or delete or update of task_ids
  on public.workout_submissions
  for each row execute function public.trg_refresh_participant_progress();

-- Keep the old name as a no-op increment so leftover approve-only callers cannot double-count.
create or replace function public.sync_days_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_participant_progress(new.challenge_id, new.user_id);
  return new;
end;
$$;

-- Repair existing rows so rings match the database.
do $$
declare
  rec record;
begin
  for rec in
    select distinct challenge_id, user_id
    from public.workout_submissions
  loop
    perform public.refresh_participant_progress(rec.challenge_id, rec.user_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic log: one calendar day, required proofs, optional task ids.
-- ---------------------------------------------------------------------------

create or replace function public.log_workout(
  p_challenge_id uuid,
  p_submission_date date,
  p_pre_selfie_url text default null,
  p_post_selfie_url text default null,
  p_hr_monitor_url text default null,
  p_notes text default null,
  p_task_ids jsonb default '[]'::jsonb
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
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_submission_date is null then
    raise exception 'Pick a calendar day to log.';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
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
      if rec.proof_type = 'hr_monitor' and coalesce(p_hr_monitor_url, '') = '' then
        raise exception 'Upload every required proof before you log.';
      end if;
    end loop;
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
    task_ids
  ) values (
    p_challenge_id,
    v_uid,
    p_submission_date,
    p_pre_selfie_url,
    p_post_selfie_url,
    p_hr_monitor_url,
    p_notes,
    'pending_review',
    to_jsonb(coalesce(v_tasks, '{}'))
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

grant execute on function public.refresh_participant_progress(uuid, uuid) to authenticated;
grant execute on function public.log_workout(uuid, date, text, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit judging step. Settlement stays on settle_challenge (idempotent).
-- ---------------------------------------------------------------------------

create or replace function public.mark_challenge_judging(p_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_uid uuid := auth.uid();
  v_is_participant boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status = 'settled' then
    return ch;
  end if;

  if ch.status = 'judging' then
    return ch;
  end if;

  select exists (
    select 1
    from public.challenge_participants p
    where p.challenge_id = ch.id
      and p.user_id = v_uid
      and coalesce(p.status, 'joined') <> 'withdrawn'
  ) into v_is_participant;

  if v_uid is distinct from ch.created_by then
    if coalesce(ch.is_unlimited, false) then
      raise exception 'Only the host can close this challenge before it ends.';
    end if;
    if ch.ends_at is null or now() < ch.ends_at then
      raise exception 'Only the host can close this challenge before it ends.';
    end if;
    if not v_is_participant then
      raise exception 'Only the host can close this challenge before it ends.';
    end if;
  end if;

  update public.challenges
    set status = 'judging'
    where id = ch.id
    returning * into ch;

  return ch;
end;
$$;

grant execute on function public.mark_challenge_judging(uuid) to authenticated;
