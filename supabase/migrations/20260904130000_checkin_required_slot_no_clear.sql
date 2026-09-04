-- Lock: Replace a required category; never leave it empty.
-- save_checkin_proof honored p_clear_proof for any slot, so a required category
-- could end up empty and drop the row to in_progress. A required slot that is
-- already satisfied now ignores the clear and keeps its file. Replace
-- (p_proof_part) is unchanged. Extra media and post_checkin_stage are unchanged.

create or replace function public.checkin_slot_is_required(
  ch public.challenges,
  p_proof_id text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_proofs jsonb;
  v_id text := coalesce(btrim(p_proof_id), '');
begin
  if v_id = '' then
    return false;
  end if;

  v_proofs := coalesce(ch.proofs, '[]'::jsonb);
  if jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0 then
    return exists (
      select 1
      from jsonb_array_elements(v_proofs) elem
      where coalesce(elem->>'id', '') = v_id
        and coalesce(elem->>'method', 'photo') <> 'honor'
    );
  end if;

  return exists (
    select 1
    from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
    where coalesce((req->>'required')::boolean, true)
      and v_id = any (
        case coalesce(req->>'type', '')
          when 'pre_selfie' then array['pre', 'pre_selfie']
          when 'post_selfie' then array['post', 'post_selfie']
          when 'hr_monitor' then array['hr', 'hr_monitor']
          when 'hr' then array['hr', 'hr_monitor']
          when 'distance' then array['distance', 'miles']
          when 'location' then array['location']
          else array[coalesce(req->>'type', '')]
        end
      )
  );
end;
$$;

comment on function public.checkin_slot_is_required(public.challenges, text) is
  'True when this proof slot is a required (non-honor) category on the challenge.';

-- Per-slot mirror of checkin_proofs_ready so the clear guard uses the same rules.
create or replace function public.checkin_slot_satisfied(
  ch public.challenges,
  p_parts jsonb,
  p_proof_id text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_id text := coalesce(btrim(p_proof_id), '');
  v_elem jsonb;
  v_part jsonb;
  v_method text;
  v_required numeric;
begin
  if v_id = '' then
    return false;
  end if;

  v_part := coalesce(p_parts -> v_id, '{}'::jsonb);
  if v_part = '{}'::jsonb then
    return false;
  end if;

  select elem into v_elem
  from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') = v_id
  limit 1;

  v_method := coalesce(v_elem->>'method', v_part->>'method', 'photo');

  if v_method = 'honor' then
    return true;
  elsif v_method = 'checkin' then
    return coalesce(nullif(v_part->>'text', ''), nullif(v_part->>'url', ''), '') <> '';
  elsif v_method = 'hr' then
    return coalesce(v_part->>'url', '') <> ''
      or coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id', '') <> '';
  elsif v_method = 'distance' then
    v_required := coalesce(
      nullif((v_elem->>'distance_meters')::numeric, 0),
      nullif(ch.distance_meters_required, 0),
      1609.34
    );
    return public.checkin_part_distance_meters(v_part) >= v_required;
  elsif v_method = 'location' then
    return coalesce((v_part->>'in_fence')::boolean, false);
  end if;

  return coalesce(v_part->>'url', '') <> '';
end;
$$;

comment on function public.checkin_slot_satisfied(public.challenges, jsonb, text) is
  'True when this one proof slot already has a qualifying file / value.';

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
  v_was_submitted boolean := false;
  v_elem jsonb;
  v_stage text;
  v_content text;
  v_clear boolean := false;
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
  v_was_submitted := v_row.status = 'submitted' and v_row.submitted_at is not null;

  v_clear := coalesce(p_clear_proof, false);
  if v_clear
     and p_proof_id is not null
     and public.checkin_slot_is_required(ch, p_proof_id)
     and public.checkin_slot_satisfied(ch, coalesce(v_row.proof_parts, '{}'::jsonb), p_proof_id) then
    v_clear := false;
  end if;

  if v_was_submitted
     and not v_clear
     and not (p_proof_id is not null and p_proof_part is not null)
     and p_notes is null
     and p_extra_media is null then
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

  if v_clear and p_proof_id is not null then
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
    v_status := case when v_was_submitted then 'submitted' else 'ready' end;
  else
    v_status := 'in_progress';
  end if;

  update public.challenge_checkins
  set
    proof_parts = v_parts,
    status = v_status,
    submitted_at = case
      when v_status = 'submitted' then v_row.submitted_at
      when v_was_submitted then null
      else v_row.submitted_at
    end,
    pre_selfie_url = v_row.pre_selfie_url,
    post_selfie_url = v_row.post_selfie_url,
    hr_monitor_url = v_row.hr_monitor_url,
    notes = v_row.notes,
    health_workout_id = v_row.health_workout_id,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  if v_was_submitted and v_status is distinct from 'submitted' then
    perform public.refresh_participant_progress(p_challenge_id, v_uid);
  end if;

  if p_proof_id is not null and not v_clear then
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

  if v_clear and p_proof_id is not null then
    delete from public.challenge_checkin_proofs
    where checkin_id = v_row.id and proof_id = p_proof_id;
  end if;

  v_media := public.checkin_unique_urls(
    public.checkin_proof_media_urls(ch, v_parts, v_row) || coalesce(p_extra_media, '{}'::text[])
  );
  v_stage := case
    when v_status = 'submitted' then 'complete'
    when v_status = 'ready' then 'complete'
    when v_new then 'started'
    else 'proof'
  end;
  v_content := public.checkin_post_caption(v_status in ('ready', 'submitted'), v_row.notes);

  if v_new or p_proof_id is not null or p_notes is not null or p_extra_media is not null then
    perform public.post_checkin_stage(
      v_uid, p_challenge_id, v_row.id, v_content, v_media, v_stage
    );
  end if;

  return public.checkin_row_json(v_row.id);
end;
$$;

grant execute on function public.checkin_slot_is_required(public.challenges, text)
  to authenticated, service_role;
grant execute on function public.checkin_slot_satisfied(public.challenges, jsonb, text)
  to authenticated, service_role;
grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid, text, text[], boolean)
  to authenticated, service_role;
