-- Check-in composer: optional caption (notes) + extra media append on the
-- existing progressive post. Same save_checkin_proof / post_checkin_stage path.

drop function if exists public.save_checkin_proof(uuid, text, jsonb, uuid);

create function public.save_checkin_proof(
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
        user_id, challenge_id, period_key, status, proof_parts, scoring_version
      ) values (
        v_uid,
        p_challenge_id,
        v_period,
        'in_progress',
        '{}'::jsonb,
        coalesce(ch.scoring_version, 1)
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

grant execute on function public.save_checkin_proof(uuid, text, jsonb, uuid, text, text[], boolean) to authenticated;
