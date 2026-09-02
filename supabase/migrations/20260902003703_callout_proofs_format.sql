-- Callout Slice 3: persist Simple proof + consistency/points format onto the
-- challenge spawned at accept. Honor settle stays if proof cannot rank.
-- Safe to re-run.

alter table public.callouts
  add column if not exists proofs jsonb not null default '[]'::jsonb,
  add column if not exists format text not null default 'consistency';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'callouts_format_check'
      and conrelid = 'public.callouts'::regclass
  ) then
    alter table public.callouts
      add constraint callouts_format_check
      check (format = any (array['consistency'::text, 'points'::text]));
  end if;
end $$;

create or replace function public.callout_normalized_format(p_format text)
returns text
language sql
immutable
as $$
  select case when lower(coalesce(p_format, '')) = 'points' then 'points' else 'consistency' end;
$$;

create or replace function public.callout_normalized_proofs(p_proofs jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_method text;
  v_name text;
  v_id text;
  v_n int := 0;
begin
  if jsonb_typeof(p_proofs) = 'array' then
    for v_elem in select value from jsonb_array_elements(p_proofs)
    loop
      exit when v_n >= 3;
      v_method := lower(coalesce(nullif(btrim(v_elem->>'method'), ''), 'photo'));
      if v_method not in ('photo', 'video', 'checkin', 'honor', 'hr', 'distance', 'location') then
        v_method := 'photo';
      end if;
      v_name := nullif(btrim(coalesce(v_elem->>'name', '')), '');
      if v_name is null then
        v_name := case v_method
          when 'video' then 'Post a video of the work.'
          when 'checkin' then 'Write a short note that you did the work.'
          when 'honor' then 'Confirm on your honor that you did the work.'
          when 'hr' then 'Share proof of at least 30 minutes of elevated heart rate.'
          when 'distance' then 'Log the distance.'
          when 'location' then 'Check in at the place.'
          else 'Post a photo of the work.'
        end;
      end if;
      v_id := coalesce(nullif(btrim(v_elem->>'id'), ''), 'callout_proof_' || (v_n + 1)::text);
      v_out := v_out || jsonb_build_array(
        jsonb_build_object(
          'id', v_id,
          'name', v_name,
          'method', v_method,
          'minutes', case when v_method = 'hr' then greatest(coalesce((v_elem->>'minutes')::int, 30), 1) else null end,
          'distance_meters', case when v_method = 'distance' then (v_elem->>'distance_meters')::numeric else null end,
          'place', case when v_method = 'location' then v_elem->'place' else null end
        )
      );
      v_n := v_n + 1;
    end loop;
  end if;
  if v_n = 0 then
    return jsonb_build_array(
      jsonb_build_object(
        'id', 'callout_photo',
        'name', 'Post a photo of the work.',
        'method', 'photo'
      )
    );
  end if;
  return v_out;
end;
$$;

create or replace function public.callout_proof_requirements(p_proofs jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_type text;
begin
  for v_elem in select value from jsonb_array_elements(coalesce(p_proofs, '[]'::jsonb))
  loop
    v_type := case lower(coalesce(v_elem->>'method', 'photo'))
      when 'video' then 'video'
      when 'checkin' then 'text_note'
      when 'honor' then 'honor'
      when 'hr' then 'hr_monitor'
      when 'distance' then 'distance'
      when 'location' then 'location'
      else 'photo'
    end;
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', v_type, 'required', true));
  end loop;
  if jsonb_array_length(v_out) = 0 then
    return jsonb_build_array(jsonb_build_object('type', 'photo', 'required', true));
  end if;
  return v_out;
end;
$$;

create or replace function public.callout_first_proof_type(p_proofs jsonb)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_proofs->0->>'method', 'photo'))
    when 'video' then 'video'
    when 'checkin' then 'check_in'
    when 'honor' then 'honor'
    else 'photo'
  end;
$$;

-- ---------------------------------------------------------------------------
-- create_callout with proofs + format (5-arg still works)
-- ---------------------------------------------------------------------------

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_amount numeric,
  p_currency text,
  p_win_condition text,
  p_deadline timestamptz,
  p_proofs jsonb,
  p_format text
)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_amount numeric(12,2);
  v_currency text;
  v_task text;
  v_win text;
  v_row public.callouts%rowtype;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_opponent_id is null or p_opponent_id = v_me then
    raise exception 'Pick someone else to call out' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;
  if not public.callout_opponent_allowed(v_me, p_opponent_id) then
    raise exception 'You can only call out a friend or someone in a live challenge with you' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.callouts
    where status = 'pending'
      and (
        (challenger_id = v_me and opponent_id = p_opponent_id)
        or (challenger_id = p_opponent_id and opponent_id = v_me)
      )
  ) then
    raise exception 'You already have a pending call-out with them' using errcode = 'P0001';
  end if;

  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Stake at least 0.01' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a stake at 10,000 or less' using errcode = 'P0001';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Set a deadline in the future' using errcode = 'P0001';
  end if;

  v_task := btrim(coalesce(p_win_condition, ''));
  if lower(v_task) like 'callout:%' then
    v_task := btrim(substr(v_task, 9));
  end if;
  if length(v_task) < 3 then
    raise exception 'Say what a win looks like' using errcode = 'P0001';
  end if;
  v_win := 'Callout: ' || v_task;

  insert into public.callouts (
    challenger_id, opponent_id, title, description, currency, stake_amount,
    win_condition, deadline, status, held, proofs, format
  ) values (
    v_me, p_opponent_id, v_win, v_task, v_currency, v_amount,
    v_win, p_deadline, 'pending', false,
    public.callout_normalized_proofs(p_proofs),
    public.callout_normalized_format(p_format)
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_amount numeric,
  p_currency text,
  p_win_condition text,
  p_deadline timestamptz
)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_callout(
    p_opponent_id, p_amount, p_currency, p_win_condition, p_deadline,
    '[]'::jsonb, 'consistency'
  );
end;
$$;

grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Attach uses stored proofs + format (replaces Slice 2 photo+honor default)
-- ---------------------------------------------------------------------------

create or replace function public.attach_callout_challenge(p_callout public.callouts)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_task text;
  v_days int;
  v_ends timestamptz;
  v_id uuid;
  v_proofs jsonb;
  v_format text;
  v_points boolean;
  v_hr int;
begin
  if p_callout.challenge_id is not null then
    return p_callout.challenge_id;
  end if;

  v_title := coalesce(nullif(btrim(p_callout.win_condition), ''), nullif(btrim(p_callout.title), ''), 'Callout:');
  if lower(v_title) not like 'callout:%' then
    v_title := 'Callout: ' || v_title;
  end if;
  v_task := btrim(substr(v_title, 9));
  v_ends := coalesce(p_callout.deadline, now() + interval '7 days');
  v_days := greatest(1, ceil(extract(epoch from (v_ends - now())) / 86400.0)::int);
  v_proofs := public.callout_normalized_proofs(p_callout.proofs);
  v_format := public.callout_normalized_format(p_callout.format);
  v_points := v_format = 'points';
  v_hr := coalesce(
    (
      select max(greatest(coalesce((elem->>'minutes')::int, 30), 1))
      from jsonb_array_elements(v_proofs) elem
      where elem->>'method' = 'hr'
    ),
    30
  );

  insert into public.challenges (
    title,
    description,
    rules,
    created_by,
    buy_in_amount,
    days_required,
    min_minutes,
    proof_requirements,
    proofs,
    proof_type,
    proof_review,
    status,
    starts_at,
    ends_at,
    timezone,
    prize_pool,
    prize_structure,
    funding_model,
    creator_contribution,
    max_participants,
    min_participants,
    is_unlimited,
    category,
    challenge_type,
    visibility,
    privacy_mode,
    challenge_lane,
    currency,
    host_funded,
    host_budget,
    format,
    misses_allowed,
    payout_mode,
    start_rule,
    frequency,
    target_count,
    task,
    tasks,
    is_official,
    is_callout,
    is_sponsored,
    creator_participating,
    length_value,
    length_unit,
    scoring_method,
    profile_visibility
  ) values (
    v_title,
    v_task,
    v_title,
    p_callout.challenger_id,
    p_callout.stake_amount,
    v_days,
    v_hr,
    public.callout_proof_requirements(v_proofs),
    v_proofs,
    public.callout_first_proof_type(v_proofs),
    'auto',
    'live',
    now(),
    v_ends,
    'UTC',
    round(p_callout.stake_amount * 2, 2),
    case when v_points then 'winner_take_all' else 'equal_split' end,
    'participants',
    0,
    2,
    2,
    false,
    'other',
    v_format,
    'private',
    'private',
    'private',
    p_callout.currency,
    false,
    0,
    v_format,
    0,
    case when v_points then 'winner_take_all' else 'even_split_remaining' end,
    'legacy',
    'once',
    1,
    v_task,
    case when v_points then jsonb_build_array(
      jsonb_build_object(
        'id', 'callout_task',
        'title', v_task,
        'points', 10,
        'proof_required', true,
        'once', false
      )
    ) else '[]'::jsonb end,
    false,
    true,
    false,
    true,
    v_days,
    'days',
    case when v_points then 'ranked' else 'consistency' end,
    'friends'
  )
  returning id into v_id;

  insert into public.challenge_participants (
    challenge_id, user_id, status, buy_in_paid, currency, result
  ) values
    (v_id, p_callout.challenger_id, 'active', p_callout.stake_amount, p_callout.currency, 'pending'),
    (v_id, p_callout.opponent_id, 'active', p_callout.stake_amount, p_callout.currency, 'pending');

  update public.callouts
  set challenge_id = v_id, updated_at = now()
  where id = p_callout.id;

  return v_id;
end;
$$;

revoke all on function public.attach_callout_challenge(public.callouts) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rank from required proof when both completed and scores differ
-- ---------------------------------------------------------------------------

create or replace function public.callout_ranked_winner_id(p_callout_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.callouts%rowtype;
  v_ch public.challenges%rowtype;
  v_a_done int;
  v_b_done int;
  v_a_score numeric;
  v_b_score numeric;
begin
  select * into v_row from public.callouts where id = p_callout_id;
  if not found or v_row.challenge_id is null then
    return null;
  end if;
  if v_row.status = 'disputed' then
    return null;
  end if;
  select * into v_ch from public.challenges where id = v_row.challenge_id;
  if not found then
    return null;
  end if;

  v_a_done := coalesce(public.submitted_checkin_count(v_row.challenge_id, v_row.challenger_id), 0);
  v_b_done := coalesce(public.submitted_checkin_count(v_row.challenge_id, v_row.opponent_id), 0);
  if v_a_done < 1 or v_b_done < 1 then
    return null;
  end if;

  if public.callout_normalized_format(coalesce(v_row.format, v_ch.format)) = 'points' then
    v_a_score := coalesce(public.challenge_board_points(v_row.challenge_id, v_row.challenger_id), 0);
    v_b_score := coalesce(public.challenge_board_points(v_row.challenge_id, v_row.opponent_id), 0);
  else
    v_a_score := coalesce(public.challenge_board_days(v_row.challenge_id, v_row.challenger_id), v_a_done);
    v_b_score := coalesce(public.challenge_board_days(v_row.challenge_id, v_row.opponent_id), v_b_done);
  end if;

  if v_a_score = v_b_score then
    return null;
  end if;
  if v_a_score > v_b_score then
    return v_row.challenger_id;
  end if;
  return v_row.opponent_id;
end;
$$;

revoke all on function public.callout_ranked_winner_id(uuid) from public, anon;
grant execute on function public.callout_ranked_winner_id(uuid) to authenticated;

create or replace function public.submit_callout_result(p_callout_id uuid, p_winner_id uuid)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
  v_my_pick uuid;
  v_their_pick uuid;
  v_prize numeric(12,2);
  v_ranked uuid;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_me not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Not your call-out' using errcode = '42501';
  end if;
  if v_row.status not in ('active', 'resolving', 'disputed') then
    raise exception 'This call-out is not open for a result' using errcode = 'P0001';
  end if;
  if p_winner_id is null or p_winner_id not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Pick one of the two people in this call-out' using errcode = 'P0001';
  end if;

  v_ranked := public.callout_ranked_winner_id(p_callout_id);
  if v_ranked is not null and v_row.status is distinct from 'disputed' then
    v_prize := round(v_row.stake_amount * 2, 2);
    if v_row.held then
      perform public.callout_wallet_release(
        v_ranked, v_row.currency, v_prize, p_callout_id, 'callout_payout'
      );
    end if;
    update public.callouts
      set winner_id = v_ranked,
          held = false,
          status = 'settled',
          updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    perform public.close_callout_challenge(v_row.challenge_id, 'settled');
    return v_row;
  end if;

  if v_me = v_row.challenger_id then
    v_row.challenger_pick := p_winner_id;
  else
    v_row.opponent_pick := p_winner_id;
  end if;

  v_my_pick := case when v_me = v_row.challenger_id then v_row.challenger_pick else v_row.opponent_pick end;
  v_their_pick := case when v_me = v_row.challenger_id then v_row.opponent_pick else v_row.challenger_pick end;

  if v_their_pick is null then
    update public.callouts
      set challenger_pick = v_row.challenger_pick,
          opponent_pick = v_row.opponent_pick,
          status = 'resolving',
          updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    return v_row;
  end if;

  if v_my_pick = v_their_pick then
    v_prize := round(v_row.stake_amount * 2, 2);
    if v_row.held then
      perform public.callout_wallet_release(
        v_my_pick, v_row.currency, v_prize, p_callout_id, 'callout_payout'
      );
    end if;
    update public.callouts
      set challenger_pick = v_row.challenger_pick,
          opponent_pick = v_row.opponent_pick,
          winner_id = v_my_pick,
          held = false,
          status = 'settled',
          updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    perform public.close_callout_challenge(v_row.challenge_id, 'settled');
    return v_row;
  end if;

  update public.callouts
    set challenger_pick = v_row.challenger_pick,
        opponent_pick = v_row.opponent_pick,
        status = 'disputed',
        updated_at = now()
    where id = p_callout_id
    returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.submit_callout_result(uuid, uuid) to authenticated;

-- Challenge tick must not pay a Callout pot.
create or replace function public.tick_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_c public.challenges%rowtype;
  v_ready timestamptz;
begin
  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and not coalesce(c.is_callout, false)
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and not coalesce(c.is_unlimited, false)
      and public.settlement_clock_ended(c)
    for update skip locked
  loop
    select * into v_c from public.challenges where id = rec.id;
    if not found then
      continue;
    end if;
    if coalesce(v_c.is_callout, false) then
      continue;
    end if;
    if v_c.status = 'settled' or v_c.distributed_at is not null then
      continue;
    end if;
    if v_c.status in ('live', 'in_progress') then
      update public.challenges
      set status = 'ended', updated_at = now()
      where id = rec.id
        and status in ('live', 'in_progress')
        and distributed_at is null;
    end if;
    if not public.settlement_should_run(v_c) then
      v_ready := public.settlement_review_ready_at(v_c);
      raise log 'settlement skip review_window challenge_id=% ready_at=% now=%',
        rec.id, v_ready, now();
      continue;
    end if;
    begin
      update public.challenges
      set status = 'settling', updated_at = now()
      where id = rec.id and status is distinct from 'settled';
      perform public.settle_ended_challenge(rec.id);
    exception
      when others then
        raise log 'settlement skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;
end;
$$;

grant execute on function public.tick_settlements() to authenticated, service_role;
