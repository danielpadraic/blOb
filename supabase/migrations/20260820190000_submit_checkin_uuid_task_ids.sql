-- Submit writes workout_submissions.task_ids as uuid[], never jsonb (42804).
-- Days / Caught Up still count from submitted challenge_checkins only.

create or replace function public.as_task_id_uuids(p_ids uuid[])
returns uuid[]
language sql
immutable
set search_path = public
as $$
  select coalesce(p_ids, '{}'::uuid[]);
$$;

grant execute on function public.as_task_id_uuids(uuid[]) to authenticated;

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
  v_logged jsonb := '{}'::jsonb;
  v_media text[] := '{}';
  v_workout uuid;
  v_task_ids uuid[] := '{}'::uuid[];
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

  begin
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
      v_period,
      v_row.pre_selfie_url,
      v_row.post_selfie_url,
      v_row.hr_monitor_url,
      v_row.notes,
      'pending_review',
      v_task_ids,
      coalesce(v_row.proof_parts, '{}'::jsonb),
      case when v_row.health_workout_id is not null then 'health_workout' else 'camera' end,
      v_row.health_workout_id
    )
    returning id into v_workout;
  exception
    when unique_violation then
      select s.id into v_workout
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = v_uid
        and s.submission_date = v_period
      limit 1;
  end;

  update public.challenge_checkins
  set
    status = 'submitted',
    submitted_at = coalesce(submitted_at, now()),
    workout_submission_id = coalesce(v_workout, workout_submission_id),
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

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

  if v_workout is not null then
    v_logged := jsonb_build_object('id', v_workout);
  end if;

  return coalesce(v_logged, '{}'::jsonb) || jsonb_build_object('checkin', public.checkin_row_json(v_row.id));
end;
$$;

grant execute on function public.submit_checkin(uuid) to authenticated;

notify pgrst, 'reload schema';
