-- Total-count challenges can log more than one check-in on the same calendar day.

alter table public.challenge_checkins
  add column if not exists checkin_slot integer not null default 1;

alter table public.workout_submissions
  add column if not exists checkin_slot integer not null default 1;

alter table public.challenge_checkins
  drop constraint if exists challenge_checkins_challenge_id_user_id_period_key_key;

drop index if exists public.challenge_checkins_user_period_uidx;

create unique index if not exists challenge_checkins_user_period_slot_uidx
  on public.challenge_checkins (challenge_id, user_id, period_key, checkin_slot);

alter table public.workout_submissions
  drop constraint if exists workout_submissions_challenge_id_user_id_submission_date_key;

alter table public.workout_submissions
  drop constraint if exists workout_submissions_day_unique;

create unique index if not exists workout_submissions_user_day_slot_uidx
  on public.workout_submissions (challenge_id, user_id, submission_date, checkin_slot);

create or replace function public.challenge_uses_total_count(ch public.challenges)
returns boolean
language sql
stable
as $$
  select
    coalesce(ch.scoring_method, '') is distinct from 'comparable_points'
    and coalesce(ch.challenge_type, '') is distinct from 'points'
    and coalesce(ch.is_official, false) = false
    and coalesce(ch.frequency, 'daily') in ('once', 'custom')
    and coalesce(ch.target_count, 0) > 0;
$$;

create or replace function public.checkin_current_row(
  ch public.challenges,
  p_uid uuid,
  p_period date
)
returns public.challenge_checkins
language plpgsql
as $$
declare
  v_row public.challenge_checkins%rowtype;
begin
  perform 1
  from public.challenge_checkins
  where challenge_id = ch.id and user_id = p_uid and period_key = p_period
  for update;

  select * into v_row
  from public.challenge_checkins
  where challenge_id = ch.id
    and user_id = p_uid
    and period_key = p_period
    and (status is distinct from 'submitted' or submitted_at is null)
  order by checkin_slot desc
  limit 1;

  if found then
    return v_row;
  end if;

  select * into v_row
  from public.challenge_checkins
  where challenge_id = ch.id and user_id = p_uid and period_key = p_period
  order by checkin_slot desc
  limit 1;

  return v_row;
end;
$$;

create or replace function public.checkin_open_row(
  ch public.challenges,
  p_uid uuid,
  p_period date
)
returns public.challenge_checkins
language plpgsql
as $$
declare
  v_row public.challenge_checkins%rowtype;
  v_slot int := 1;
  v_done int := 0;
  v_target int := 1;
begin
  v_row := public.checkin_current_row(ch, p_uid, p_period);
  if v_row.id is not null and (v_row.status is distinct from 'submitted' or v_row.submitted_at is null) then
    return v_row;
  end if;

  if v_row.id is not null then
    if not public.challenge_uses_total_count(ch) then
      return v_row;
    end if;
    select count(*)::int into v_done
    from public.challenge_checkins
    where challenge_id = ch.id
      and user_id = p_uid
      and status = 'submitted'
      and submitted_at is not null;
    v_target := greatest(coalesce(ch.target_count, 1), 1);
    if v_done >= v_target then
      return v_row;
    end if;
    v_slot := coalesce(v_row.checkin_slot, 1) + 1;
  end if;

  insert into public.challenge_checkins (
    user_id, challenge_id, period_key, checkin_slot, status, proof_parts, scoring_version
  ) values (
    p_uid, ch.id, p_period, v_slot, 'in_progress', '{}'::jsonb, coalesce(ch.scoring_version, 1)
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.save_checkin_proof(
  p_challenge_id uuid,
  p_proof_id text default null,
  p_proof_part jsonb default null,
  p_health_workout_id uuid default null,
  p_notes text default null,
  p_extra_media text[] default null,
  p_clear_proof boolean default false
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
  v_stage text;
  v_content text;
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
  v_row := public.checkin_open_row(ch, v_uid, v_period);
  v_new := v_row.created_at >= now() - interval '2 seconds'
    and coalesce(v_row.proof_parts, '{}'::jsonb) = '{}'::jsonb;

  if v_row.status = 'submitted' and v_row.submitted_at is not null then
    return public.checkin_row_json(v_row.id);
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

  if p_clear_proof and p_proof_id is not null then
    v_parts := v_parts - p_proof_id;
  elsif p_proof_id is not null and p_proof_part is not null then
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
    elsif v_name like '%pre%' and v_name not like '%check-out%' and v_name not like '%checkout%' then
      if v_url <> '' then
        v_row.pre_selfie_url := v_url;
      end if;
    elsif v_name like '%post%' or v_name like '%check-out%' or v_name like '%checkout%' then
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

  if p_notes is not null then
    v_row.notes := nullif(btrim(p_notes), '');
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

  if p_proof_id is not null and not p_clear_proof then
    insert into public.challenge_checkin_proofs (
      checkin_id, proof_id, method, url, note, health_workout_id
    ) values (
      v_row.id,
      p_proof_id,
      coalesce(nullif(v_method, ''), coalesce(v_part->>'method', 'photo')),
      nullif(v_url, ''),
      nullif(v_part->>'text', ''),
      coalesce(p_health_workout_id, v_row.health_workout_id)
    )
    on conflict (checkin_id, proof_id) do update set
      method = excluded.method,
      url = excluded.url,
      note = excluded.note,
      health_workout_id = excluded.health_workout_id,
      updated_at = now();
  end if;

  if p_clear_proof and p_proof_id is not null then
    delete from public.challenge_checkin_proofs
    where checkin_id = v_row.id and proof_id = p_proof_id;
  end if;

  v_media := public.checkin_unique_urls(
    public.checkin_proof_media_urls(ch, v_parts, v_row) || coalesce(p_extra_media, '{}'::text[])
  );
  v_stage := case when v_status = 'ready' then 'complete' when v_new then 'started' else 'proof' end;
  v_content := public.checkin_post_caption(v_status = 'ready', v_row.notes);

  if v_new or p_proof_id is not null or p_notes is not null or p_extra_media is not null then
    perform public.post_checkin_stage(
      v_uid, p_challenge_id, v_row.id, v_content, v_media, v_stage
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
  v_row := public.checkin_current_row(ch, v_uid, v_period);

  if v_row.id is null then
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
      checkin_slot,
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
      coalesce(v_row.checkin_slot, 1),
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
        and s.checkin_slot = coalesce(v_row.checkin_slot, 1)
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

  v_media := public.checkin_proof_media_urls(ch, v_row.proof_parts, v_row);

  perform public.post_checkin_stage(
    v_uid,
    p_challenge_id,
    v_row.id,
    public.checkin_post_caption(true, v_row.notes),
    v_media,
    'complete'
  );

  if v_workout is not null then
    v_logged := jsonb_build_object('id', v_workout);
  end if;

  return coalesce(v_logged, '{}'::jsonb) || jsonb_build_object('checkin', public.checkin_row_json(v_row.id));
end;
$$;

grant execute on function public.challenge_uses_total_count(public.challenges) to authenticated;
grant execute on function public.checkin_current_row(public.challenges, uuid, date) to authenticated;
grant execute on function public.checkin_open_row(public.challenges, uuid, date) to authenticated;
