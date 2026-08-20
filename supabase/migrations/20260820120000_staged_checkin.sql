-- Staged check-in: Begin → Continue → Submit.
-- Day / Caught Up / first_proof only count after submit (workout_submissions insert).

create table if not exists public.challenge_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  period_key date not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'ready', 'submitted')),
  proof_parts jsonb not null default '{}'::jsonb,
  pre_selfie_url text,
  post_selfie_url text,
  hr_monitor_url text,
  notes text,
  health_workout_id uuid,
  workout_submission_id uuid references public.workout_submissions(id) on delete set null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, user_id, period_key)
);

do $$
begin
  if to_regclass('public.health_workouts') is not null then
    begin
      alter table public.challenge_checkins
        add constraint challenge_checkins_health_workout_id_fkey
        foreign key (health_workout_id) references public.health_workouts(id) on delete set null;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

create index if not exists challenge_checkins_challenge_period_idx
  on public.challenge_checkins (challenge_id, period_key);

create index if not exists challenge_checkins_user_idx
  on public.challenge_checkins (user_id, started_at desc);

comment on table public.challenge_checkins is
  'One open check-in per user per period. Submit copies proofs onto workout_submissions.';

alter table public.posts
  add column if not exists checkin_id uuid references public.challenge_checkins(id) on delete set null;

alter table public.posts
  add column if not exists checkin_stage text;

create index if not exists posts_checkin_id_idx on public.posts (checkin_id)
  where checkin_id is not null;

comment on column public.posts.checkin_id is
  'Set on staged check-in posts. Challenge feed only — not a Home post.';

alter table public.challenge_checkins enable row level security;

drop policy if exists "Participants read challenge checkins" on public.challenge_checkins;
create policy "Participants read challenge checkins"
  on public.challenge_checkins for select
  using (
    exists (
      select 1
      from public.challenge_participants cp
      where cp.challenge_id = challenge_checkins.challenge_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Owners insert own checkins" on public.challenge_checkins;
create policy "Owners insert own checkins"
  on public.challenge_checkins for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.challenge_participants cp
      where cp.challenge_id = challenge_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Owners update own checkins" on public.challenge_checkins;
create policy "Owners update own checkins"
  on public.challenge_checkins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.challenge_checkins to authenticated;

create or replace function public.checkin_period_for(ch public.challenges)
returns date
language plpgsql
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
begin
  if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
    v_windows := public.official_ensure_windows(ch.id);
    v_win := public.official_window_at(v_windows, now());
    if v_win is not null then
      return (v_win->>'date')::date;
    end if;
  end if;
  return (timezone('utc', now()))::date;
end;
$$;

create or replace function public.checkin_proofs_ready(ch public.challenges, p_parts jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  rec record;
  v_proofs jsonb;
  v_part jsonb;
  v_method text;
  v_needs boolean := false;
begin
  v_proofs := coalesce(ch.proofs, '[]'::jsonb);
  if jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0 then
    for rec in select elem from jsonb_array_elements(v_proofs) elem
    loop
      v_method := coalesce(rec.elem->>'method', 'photo');
      if v_method = 'honor' then
        continue;
      end if;
      v_needs := true;
      v_part := coalesce(p_parts -> coalesce(rec.elem->>'id', ''), '{}'::jsonb);
      if v_method = 'checkin' then
        if coalesce(nullif(v_part->>'text', ''), nullif(v_part->>'url', ''), '') = '' then
          return false;
        end if;
      elsif v_method = 'hr' then
        if coalesce(v_part->>'url', '') = ''
           and coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id', '') = '' then
          return false;
        end if;
      else
        if coalesce(v_part->>'url', '') = '' then
          return false;
        end if;
      end if;
    end loop;
    return true;
  end if;

  for rec in
    select coalesce(req->>'type', '') as proof_type
    from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
    where coalesce((req->>'required')::boolean, true)
  loop
    v_needs := true;
    if rec.proof_type = 'pre_selfie' and coalesce(p_parts->'pre'->>'url', p_parts->'pre_selfie'->>'url', '') = '' then
      return false;
    end if;
    if rec.proof_type = 'post_selfie' and coalesce(p_parts->'post'->>'url', p_parts->'post_selfie'->>'url', '') = '' then
      return false;
    end if;
    if rec.proof_type in ('hr_monitor', 'hr')
       and coalesce(p_parts->'hr'->>'url', p_parts->'hr_monitor'->>'url', '') = ''
       and coalesce(p_parts->'hr'->>'healthWorkoutId', p_parts->'hr'->>'health_workout_id', '') = '' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.checkin_added_copy(ch public.challenges, p_proof_id text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_elem jsonb;
  v_method text;
  v_name text;
begin
  select elem into v_elem
  from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') = coalesce(p_proof_id, '')
  limit 1;
  v_method := coalesce(v_elem->>'method', '');
  v_name := lower(coalesce(v_elem->>'name', p_proof_id, ''));
  if v_method = 'hr' or v_name like '%heart rate%' or v_name like '%heart-rate%' then
    return 'Added heart-rate proof.';
  end if;
  if v_name like '%post%' then
    return 'Added post-workout selfie.';
  end if;
  if v_name like '%pre%' then
    return 'Added pre-workout selfie.';
  end if;
  if v_method = 'video' then
    return 'Added a video.';
  end if;
  if v_method = 'checkin' then
    return 'Added a check-in note.';
  end if;
  return 'Added a photo.';
end;
$$;

create or replace function public.post_checkin_stage(
  p_user_id uuid,
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_content text,
  p_media text[],
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(p_media, 1), 0) = 0 then
    return;
  end if;
  insert into public.posts (
    author_id,
    challenge_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    checkin_id,
    checkin_stage
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    coalesce(p_media, '{}'),
    'public',
    '{}',
    p_checkin_id,
    p_stage
  );
exception when others then
  begin
    insert into public.posts (author_id, challenge_id, content, media_urls, checkin_id, checkin_stage)
    values (
      p_user_id,
      p_challenge_id,
      nullif(btrim(p_content), ''),
      coalesce(p_media, '{}'),
      p_checkin_id,
      p_stage
    );
  exception when others then
    insert into public.posts (author_id, challenge_id, content, media_urls)
    values (
      p_user_id,
      p_challenge_id,
      nullif(btrim(p_content), ''),
      coalesce(p_media, '{}')
    );
  end;
end;
$$;

create or replace function public.checkin_assert_open(ch public.challenges, part public.challenge_participants)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
begin
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
  if ch.status in ('judging', 'settled', 'cancelled') then
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

create or replace function public.checkin_row_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select to_jsonb(c) from public.challenge_checkins c where c.id = p_id;
$$;

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

  if exists (
    select 1 from public.workout_submissions s
    where s.challenge_id = p_challenge_id and s.user_id = v_uid and s.submission_date = v_period
  ) then
    raise exception 'ALREADY_LOGGED_TODAY';
  end if;

  select * into v_row
  from public.challenge_checkins
  where challenge_id = p_challenge_id and user_id = v_uid and period_key = v_period
  for update;

  if found then
    if v_row.status = 'submitted' then
      raise exception 'ALREADY_LOGGED_TODAY';
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
      if v_row.status = 'submitted' then
        raise exception 'ALREADY_LOGGED_TODAY';
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

grant execute on function public.checkin_period_for(public.challenges) to authenticated;
grant execute on function public.checkin_proofs_ready(public.challenges, jsonb) to authenticated;
grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.submit_checkin(uuid) to authenticated;

notify pgrst, 'reload schema';
