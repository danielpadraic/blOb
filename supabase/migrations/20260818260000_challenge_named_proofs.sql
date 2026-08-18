-- Named proofs: a log is one period check-in that must include every required proof.

alter table public.challenges
  add column if not exists proofs jsonb not null default '[]'::jsonb;

comment on column public.challenges.proofs is
  'Named proof list [{id, name, method}]. methods: photo | video | checkin | honor | hr. One log needs all of them.';

alter table public.workout_submissions
  add column if not exists proof_parts jsonb not null default '{}'::jsonb;

comment on column public.workout_submissions.proof_parts is
  'Parts for this log, keyed by challenge proof id.';

alter table public.challenges drop constraint if exists challenges_proof_type_allowed;
alter table public.challenges
  add constraint challenges_proof_type_allowed
  check (proof_type in ('photo', 'video', 'check_in', 'checkin', 'honor', 'hr', 'pre_selfie'));

-- Prefer existing proof_requirements (official 3-proof, Simple photo/video/check-in).
update public.challenges c
set proofs = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'name', case
          when coalesce(req->>'type', '') = 'pre_selfie' then 'Pre-selfie'
          when coalesce(req->>'type', '') = 'post_selfie' then 'Post-selfie'
          when coalesce(req->>'type', '') = 'hr_monitor' then 'Heart rate'
          else ''
        end,
        'method', case
          when coalesce(req->>'type', '') = 'video' then 'video'
          when coalesce(req->>'type', '') in ('text_note', 'link') then 'checkin'
          when coalesce(req->>'type', '') = 'hr_monitor' then 'hr'
          else 'photo'
        end
      )
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(c.proof_requirements, '[]'::jsonb)) req
  where coalesce((req->>'required')::boolean, true)
    and coalesce(req->>'type', '') <> ''
)
where coalesce(jsonb_array_length(c.proofs), 0) = 0
  and jsonb_typeof(coalesce(c.proof_requirements, '[]'::jsonb)) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(c.proof_requirements, '[]'::jsonb)) req
    where coalesce((req->>'required')::boolean, true)
      and coalesce(req->>'type', '') <> ''
  );

-- Empty proofs (honor, or no requirements): one unnamed row from proof_type.
update public.challenges
set proofs = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', '',
    'method', case
      when proof_type = 'video' then 'video'
      when proof_type in ('check_in', 'checkin') then 'checkin'
      when proof_type = 'honor' then 'honor'
      when proof_type in ('hr', 'hr_monitor') then 'hr'
      else 'photo'
    end
  )
)
where coalesce(jsonb_array_length(proofs), 0) = 0;

create or replace function public.publish_challenge(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_currency text;
  v_buy_in numeric;
  v_creator_contribution numeric;
  v_max int;
  v_min int;
  v_participating boolean;
  v_balance numeric;
  v_needed numeric;
  v_row public.challenges%rowtype;
  v_visibility text;
  v_host_funded boolean;
  v_format text;
  v_proof_type text;
  v_frequency text;
  v_required int;
  v_proofs jsonb;
  v_first_method text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_currency := coalesce(p_payload->>'currency', 'coins');
  if v_currency not in ('coins', 'bucks') then
    raise exception 'INVALID_CURRENCY';
  end if;

  v_buy_in := coalesce((p_payload->>'buy_in_amount')::numeric, 0);
  v_creator_contribution := coalesce(
    (p_payload->>'host_budget')::numeric,
    (p_payload->>'creator_contribution')::numeric,
    0
  );
  v_max := nullif(p_payload->>'max_participants', '')::int;
  v_min := greatest(coalesce((p_payload->>'min_participants')::int, 2), 1);
  v_participating := case
    when p_payload ? 'creator_participates' then (p_payload->>'creator_participates')::boolean
    when p_payload ? 'creator_participating' then (p_payload->>'creator_participating')::boolean
    else true
  end;
  v_visibility := coalesce(p_payload->>'visibility', 'public');
  if v_visibility not in ('public', 'unlisted', 'private', 'friends', 'invite') then
    v_visibility := 'public';
  end if;
  v_host_funded := coalesce(
    (p_payload->>'host_funded')::boolean,
    v_currency = 'bucks',
    false
  );
  if v_currency = 'bucks' then
    v_host_funded := true;
    v_buy_in := 0;
  end if;
  v_format := coalesce(p_payload->>'format', p_payload->>'challenge_type', 'consistency');
  if v_format not in ('consistency', 'points', 'lms') then
    v_format := 'consistency';
  end if;

  v_proofs := coalesce(p_payload->'proofs', '[]'::jsonb);
  if jsonb_typeof(v_proofs) <> 'array' then
    v_proofs := '[]'::jsonb;
  end if;
  if jsonb_array_length(v_proofs) = 0 and v_format <> 'points' then
    v_proof_type := coalesce(p_payload->>'proof_type', 'photo');
    v_proofs := jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'name', '',
        'method', case
          when v_proof_type = 'video' then 'video'
          when v_proof_type in ('check_in', 'checkin') then 'checkin'
          when v_proof_type = 'honor' then 'honor'
          when v_proof_type in ('hr', 'hr_monitor') then 'hr'
          else 'photo'
        end
      )
    );
  end if;
  v_first_method := coalesce(v_proofs->0->>'method', 'photo');
  v_proof_type := case
    when v_first_method = 'checkin' then 'check_in'
    when v_first_method in ('photo', 'video', 'honor', 'hr') then v_first_method
    else 'photo'
  end;
  if v_proof_type not in ('photo', 'video', 'check_in', 'checkin', 'honor', 'hr', 'pre_selfie') then
    v_proof_type := 'photo';
  end if;

  v_frequency := coalesce(p_payload->>'frequency', 'daily');
  v_required := coalesce(
    nullif(p_payload->>'required_checkins', '')::int,
    nullif(p_payload->>'target_count', '')::int,
    nullif(p_payload->>'days_required', '')::int
  );

  if v_max is not null and v_max < 1 then
    raise exception 'MAX_PARTICIPANTS_MIN_1';
  end if;

  if coalesce(p_payload->>'end_mode', '') = 'indefinite_lms'
     and v_format <> 'consistency' and v_format <> 'lms' then
    raise exception 'LMS_REQUIRES_CONSISTENCY';
  end if;

  if coalesce(p_payload->>'start_mode', '') = 'full_lobby' and (v_max is null) then
    raise exception 'FULL_LOBBY_REQUIRES_MAX';
  end if;

  if v_currency = 'coins' then
    select coins into v_balance from profiles where id = v_uid for update;
  else
    select bucks into v_balance from profiles where id = v_uid for update;
  end if;

  if v_balance is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_creator_contribution < 0 or v_buy_in < 0 then
    raise exception 'NEGATIVE_AMOUNT';
  end if;

  v_needed := v_creator_contribution;
  if v_participating then
    v_needed := v_needed + v_buy_in;
  end if;
  if v_balance < v_needed then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into challenges (
    created_by, title, description, rules, category, visibility, challenge_type,
    start_mode, starts_at, start_within_value, start_within_unit,
    full_lobby_start_time, full_lobby_day_offset,
    end_mode, ends_at, length_value, length_unit, is_unlimited,
    max_participants, min_participants, buy_in_amount, currency,
    creator_participating, days_required, min_minutes, proof_requirements, proofs, tasks, rules_list,
    status, prize_pool, prize_structure, top_places_mode, top_places_value,
    top_places_distribution, scaled_first_place_pct, funding_model, creator_contribution,
    distribution_mode, distribution_scheduled_at, is_official, frequency, target_count,
    host_funded, host_budget, format, task, required_checkins, misses_allowed,
    proof_type, proof_review, payout_mode, timezone, start_rule
  ) values (
    v_uid,
    coalesce(p_payload->>'title', 'Untitled challenge'),
    p_payload->>'description',
    p_payload->>'rules',
    p_payload->>'category',
    v_visibility,
    case when v_format = 'points' then 'points' else 'consistency' end,
    coalesce(p_payload->>'start_mode', 'fixed'),
    nullif(p_payload->>'starts_at', '')::timestamptz,
    nullif(p_payload->>'start_within_value', '')::int,
    p_payload->>'start_within_unit',
    nullif(p_payload->>'full_lobby_start_time', '')::time,
    coalesce((p_payload->>'full_lobby_day_offset')::int, 0),
    coalesce(p_payload->>'end_mode', 'length'),
    nullif(p_payload->>'ends_at', '')::timestamptz,
    nullif(p_payload->>'length_value', '')::int,
    p_payload->>'length_unit',
    coalesce(
      (p_payload->>'is_unlimited')::boolean,
      coalesce(p_payload->>'end_mode', '') = 'indefinite_lms',
      v_format = 'lms'
    ),
    v_max,
    v_min,
    v_buy_in,
    v_currency,
    v_participating,
    coalesce(v_required, nullif(p_payload->>'days_required', '')::int),
    nullif(p_payload->>'min_minutes', '')::int,
    coalesce(p_payload->'proof_requirements', '[]'::jsonb),
    v_proofs,
    coalesce(p_payload->'tasks', '[]'::jsonb),
    coalesce(p_payload->'rules_list', '[]'::jsonb),
    'open',
    0,
    coalesce(
      p_payload->>'prize_structure',
      case
        when coalesce(p_payload->>'payout_mode', 'even_split_remaining') = 'winner_take_all' then 'winner_take_all'
        when coalesce(p_payload->>'payout_mode', '') = 'top_places' then 'top_places'
        else 'equal_split'
      end
    ),
    p_payload->>'top_places_mode',
    nullif(p_payload->>'top_places_value', '')::numeric,
    p_payload->>'top_places_distribution',
    nullif(p_payload->>'scaled_first_place_pct', '')::numeric,
    coalesce(
      p_payload->>'funding_model',
      case when v_host_funded then 'creator' else 'participants' end
    ),
    v_creator_contribution,
    coalesce(p_payload->>'distribution_mode', 'auto'),
    nullif(p_payload->>'distribution_scheduled_at', '')::timestamptz,
    coalesce((p_payload->>'is_official')::boolean, false),
    v_frequency,
    v_required,
    v_host_funded,
    v_creator_contribution,
    v_format,
    nullif(p_payload->>'task', ''),
    v_required,
    greatest(coalesce((p_payload->>'misses_allowed')::int, 0), 0),
    v_proof_type,
    coalesce(p_payload->>'proof_review', 'auto'),
    coalesce(p_payload->>'payout_mode', 'even_split_remaining'),
    coalesce(nullif(p_payload->>'timezone', ''), 'UTC'),
    coalesce(p_payload->>'start_rule', 'at_starts_at')
  ) returning * into v_row;

  v_id := v_row.id;

  if v_creator_contribution > 0 then
    if v_currency = 'coins' then
      update profiles set coins = coins - v_creator_contribution where id = v_uid;
    else
      update profiles set bucks = bucks - v_creator_contribution where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_creator_contribution where id = v_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      v_uid, v_id, v_currency, -v_creator_contribution, 'creator_fund_escrow', 'creator_fund_escrow',
      jsonb_build_object('challenge_id', v_id), 'challenge', v_id::text
    );
  end if;

  if v_participating then
    if v_buy_in > 0 then
      if v_currency = 'coins' then
        update profiles set coins = coins - v_buy_in where id = v_uid;
      else
        update profiles set bucks = bucks - v_buy_in where id = v_uid;
      end if;
      update challenges set prize_pool = prize_pool + v_buy_in where id = v_id;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (
        v_uid, v_id, v_currency, -v_buy_in, 'join_escrow', 'join_escrow',
        jsonb_build_object('creator_join', true), 'challenge', v_id::text
      );
    end if;
    insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
    values (v_id, v_uid, v_buy_in, v_currency, 'active');
  end if;

  delete from challenge_drafts where user_id = v_uid;

  return jsonb_build_object('ok', true, 'challenge_id', v_id, 'prize_pool', (select prize_pool from challenges where id = v_id));
end;
$$;

grant execute on function public.publish_challenge(jsonb) to authenticated;

drop function if exists public.log_workout(uuid, date, text, text, text, text, jsonb);
drop function if exists public.log_workout(uuid, text, text, text, text);

create or replace function public.log_workout(
  p_challenge_id uuid,
  p_submission_date date default (timezone('utc', now()))::date,
  p_pre_selfie_url text default null,
  p_post_selfie_url text default null,
  p_hr_monitor_url text default null,
  p_notes text default null,
  p_task_ids jsonb default '[]'::jsonb,
  p_proof_parts jsonb default '{}'::jsonb
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
  v_proofs jsonb;
  v_part jsonb;
  v_method text;
  v_has_parts boolean;
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
        if rec.proof_type = 'hr_monitor' and coalesce(p_hr_monitor_url, '') = '' then
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
    proof_parts
  ) values (
    p_challenge_id,
    v_uid,
    p_submission_date,
    p_pre_selfie_url,
    p_post_selfie_url,
    p_hr_monitor_url,
    p_notes,
    'pending_review',
    to_jsonb(coalesce(v_tasks, '{}')),
    coalesce(p_proof_parts, '{}'::jsonb)
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
      'proof_parts', s.proof_parts,
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

grant execute on function public.log_workout(uuid, date, text, text, text, text, jsonb, jsonb) to authenticated;
