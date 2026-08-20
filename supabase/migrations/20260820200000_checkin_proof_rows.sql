-- Proofs attach to the check-in id. log_workout.task_ids is uuid[], never jsonb (42804).

alter table public.workout_submissions
  alter column task_ids set default '{}'::uuid[];

create table if not exists public.challenge_checkin_proofs (
  checkin_id uuid not null references public.challenge_checkins(id) on delete cascade,
  proof_id text not null,
  method text not null default 'photo',
  url text,
  note text,
  health_workout_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (checkin_id, proof_id)
);

create index if not exists challenge_checkin_proofs_checkin_idx
  on public.challenge_checkin_proofs (checkin_id);

alter table public.challenge_checkin_proofs enable row level security;

drop policy if exists "Participants read checkin proofs" on public.challenge_checkin_proofs;
create policy "Participants read checkin proofs"
  on public.challenge_checkin_proofs for select
  using (
    exists (
      select 1
      from public.challenge_checkins c
      join public.challenge_participants cp
        on cp.challenge_id = c.challenge_id and cp.user_id = auth.uid()
      where c.id = challenge_checkin_proofs.checkin_id
    )
  );

drop policy if exists "Owners write own checkin proofs" on public.challenge_checkin_proofs;
create policy "Owners write own checkin proofs"
  on public.challenge_checkin_proofs for insert
  with check (
    exists (
      select 1 from public.challenge_checkins c
      where c.id = checkin_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Owners update own checkin proofs" on public.challenge_checkin_proofs;
create policy "Owners update own checkin proofs"
  on public.challenge_checkin_proofs for update
  using (
    exists (
      select 1 from public.challenge_checkins c
      where c.id = checkin_id and c.user_id = auth.uid()
    )
  );

grant select, insert, update on public.challenge_checkin_proofs to authenticated;

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

  if p_proof_id is not null then
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

drop function if exists public.log_workout(uuid, date, text, text, text, text, jsonb, jsonb, uuid);

create function public.log_workout(
  p_challenge_id uuid,
  p_submission_date date default (timezone('utc', now()))::date,
  p_pre_selfie_url text default null,
  p_post_selfie_url text default null,
  p_hr_monitor_url text default null,
  p_notes text default null,
  p_task_ids uuid[] default '{}'::uuid[],
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
  v_task_uuids uuid[] := '{}'::uuid[];
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
  v_task_uuids := coalesce(p_task_ids, '{}'::uuid[]);

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select coalesce(array_agg(x::text), '{}') into v_tasks
    from unnest(v_task_uuids) as x;

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

grant execute on function public.log_workout(uuid, date, text, text, text, text, uuid[], jsonb, uuid) to authenticated;
grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
