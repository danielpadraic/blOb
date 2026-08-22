-- One progressive check-in story per period: update the same post, append media,
-- mark Check-in Complete. Start gates / NOT_STARTED are unchanged.

create or replace function public.checkin_unique_urls(p_urls text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(u order by ord)
      from (
        select u, min(ord) as ord
        from unnest(coalesce(p_urls, '{}'::text[])) with ordinality as t(u, ord)
        where coalesce(u, '') <> ''
        group by u
      ) s
    ),
    '{}'::text[]
  );
$$;

create or replace function public.checkin_proof_media_urls(
  ch public.challenges,
  p_parts jsonb,
  p_row public.challenge_checkins
)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_media text[] := '{}';
  v_elem jsonb;
  v_url text;
begin
  for v_elem in
    select value from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb))
  loop
    v_url := coalesce(nullif(p_parts -> coalesce(v_elem->>'id', '') ->> 'url', ''), '');
    if v_url <> '' and not (v_url = any (v_media)) then
      v_media := v_media || v_url;
    end if;
  end loop;
  foreach v_url in array array[
    p_row.pre_selfie_url,
    p_row.post_selfie_url,
    p_row.hr_monitor_url
  ]
  loop
    if coalesce(v_url, '') <> '' and not (v_url = any (v_media)) then
      v_media := v_media || v_url;
    end if;
  end loop;
  return v_media;
end;
$$;

create or replace function public.checkin_post_caption(p_complete boolean, p_notes text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_complete and coalesce(nullif(btrim(p_notes), ''), '') <> '' then
      'Check-in Complete' || chr(10) || btrim(p_notes)
    when p_complete then
      'Check-in Complete'
    when coalesce(nullif(btrim(p_notes), ''), '') <> '' then
      btrim(p_notes)
    else
      'Started check-in.'
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
declare
  v_id uuid;
  v_old text[] := '{}';
  v_media text[] := '{}';
begin
  select id, coalesce(media_urls, '{}')
    into v_id, v_old
  from public.posts
  where checkin_id = p_checkin_id
    and deleted_at is null
  order by created_at asc, id asc
  limit 1;

  v_media := public.checkin_unique_urls(coalesce(v_old, '{}') || coalesce(p_media, '{}'));

  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(v_media, 1), 0) = 0 then
    return;
  end if;

  if v_id is not null then
    update public.posts
    set
      content = coalesce(nullif(btrim(p_content), ''), content),
      media_urls = v_media,
      checkin_stage = p_stage,
      source = 'checkin',
      challenge_id = coalesce(challenge_id, p_challenge_id)
    where id = v_id;
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
    checkin_stage,
    source
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    v_media,
    'public',
    '{}',
    p_checkin_id,
    p_stage,
    'checkin'
  );
end;
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

  v_media := public.checkin_proof_media_urls(ch, v_parts, v_row);
  v_stage := case when v_status = 'ready' then 'complete' when v_new then 'started' else 'proof' end;
  v_content := public.checkin_post_caption(v_status = 'ready', v_row.notes);

  if v_new or p_proof_id is not null then
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

create or replace function public.trg_notify_checkin_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source is distinct from 'checkin' then
    return new;
  end if;
  if new.challenge_id is null or new.author_id is null then
    return new;
  end if;
  if coalesce(new.checkin_stage, '') not in ('submitted', 'complete') then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.checkin_stage, '') in ('submitted', 'complete') then
    return new;
  end if;
  perform public.notify_challenge_checkin(new.challenge_id, new.author_id, new.id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_notify_checkin on public.posts;
create trigger posts_notify_checkin
  after insert or update of checkin_stage, source on public.posts
  for each row
  execute function public.trg_notify_checkin_post();

do $$
declare
  rec record;
  v_keep uuid;
  v_media text[] := '{}';
  v_url text;
  v_stage text;
  v_content text;
  v_row record;
begin
  for rec in
    select checkin_id
    from public.posts
    where checkin_id is not null
      and deleted_at is null
    group by checkin_id
    having count(*) > 1
  loop
    v_media := '{}';
    v_keep := null;
    v_stage := null;
    v_content := null;
    for v_row in
      select id, media_urls, checkin_stage, content
      from public.posts
      where checkin_id = rec.checkin_id
        and deleted_at is null
      order by created_at asc, id asc
    loop
      if v_keep is null then
        v_keep := v_row.id;
        v_content := v_row.content;
        v_stage := v_row.checkin_stage;
      end if;
      if v_row.media_urls is not null then
        foreach v_url in array v_row.media_urls loop
          if coalesce(v_url, '') <> '' and not (v_url = any (v_media)) then
            v_media := v_media || v_url;
          end if;
        end loop;
      end if;
      if v_row.checkin_stage in ('submitted', 'complete') then
        v_stage := v_row.checkin_stage;
        if coalesce(v_row.content, '') <> '' then
          v_content := v_row.content;
        end if;
      end if;
    end loop;
    update public.posts
    set
      media_urls = v_media,
      checkin_stage = coalesce(v_stage, checkin_stage),
      content = coalesce(v_content, content),
      source = 'checkin'
    where id = v_keep;
    update public.posts
    set deleted_at = now()
    where checkin_id = rec.checkin_id
      and id is distinct from v_keep
      and deleted_at is null;
  end loop;
end;
$$;

create unique index if not exists posts_one_live_checkin_idx
  on public.posts (checkin_id)
  where checkin_id is not null and deleted_at is null;

grant execute on function public.checkin_unique_urls(text[]) to authenticated;
grant execute on function public.checkin_proof_media_urls(public.challenges, jsonb, public.challenge_checkins) to authenticated;
grant execute on function public.checkin_post_caption(boolean, text) to authenticated;
grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.submit_checkin(uuid) to authenticated;

notify pgrst, 'reload schema';
