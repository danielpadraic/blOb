-- Skill Tournament funding: entry fees + host funds make the prize.
-- Settlement (settle_ended_challenge) is unchanged and still reads prize_pool.

create or replace function public.top_up_challenge_prize(
  p_challenge_id uuid,
  p_amount numeric,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_cur text;
  v_balance numeric;
  v_amt numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_amt := round(coalesce(p_amount, 0), 2);
  if v_amt <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  if v_c.created_by is distinct from v_uid then
    raise exception 'NOT_HOST';
  end if;
  if coalesce(v_c.is_official, false) then
    raise exception 'NOT_HOST';
  end if;
  if v_c.status in (
    'ended', 'settling', 'judging', 'distributing', 'settled',
    'cancelled', 'cancelled_underfilled'
  ) or v_c.distributed_at is not null then
    raise exception 'ALREADY_SETTLED';
  end if;

  if p_request_id is not null and exists (
    select 1
    from public.wallet_ledger
    where challenge_id = p_challenge_id
      and user_id = v_uid
      and entry_type = 'creator_fund_escrow'
      and metadata->>'request_id' = p_request_id::text
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'challenge_id', p_challenge_id,
      'prize_pool', v_c.prize_pool,
      'host_contribution', v_c.creator_contribution
    );
  end if;

  v_cur := case when v_c.currency = 'bucks' then 'bucks' else 'coins' end;
  if v_cur = 'coins' then
    select coalesce(coins, credits, 0) into v_balance from public.profiles where id = v_uid for update;
  else
    select coalesce(bucks, 0) into v_balance from public.profiles where id = v_uid for update;
  end if;
  if v_balance is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if v_balance < v_amt then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_cur = 'coins' then
    update public.profiles
    set coins = coalesce(coins, credits, 0) - v_amt
    where id = v_uid;
  else
    update public.profiles
    set bucks = coalesce(bucks, 0) - v_amt
    where id = v_uid;
  end if;

  update public.challenges
  set prize_pool = coalesce(prize_pool, 0) + v_amt,
      creator_contribution = coalesce(creator_contribution, 0) + v_amt,
      host_funded = true,
      funding_model = case
        when coalesce(buy_in_amount, 0) > 0 then 'hybrid'
        else 'creator'
      end,
      updated_at = now()
  where id = p_challenge_id
  returning * into v_c;

  insert into public.wallet_ledger (
    user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
  ) values (
    v_uid, p_challenge_id, v_cur, -v_amt,
    'creator_fund_escrow', 'creator_fund_escrow',
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'kind', 'host_top_up',
      'request_id', p_request_id
    ),
    p_challenge_id
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', v_c.prize_pool,
    'host_contribution', v_c.creator_contribution
  );
end;
$$;

create or replace function public.get_challenge_funding(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'entry_fee', coalesce(v_c.buy_in_amount, 0),
    'host_contribution', coalesce(v_c.creator_contribution, 0),
    'entry_fees_collected', greatest(coalesce(v_c.prize_pool, 0) - coalesce(v_c.creator_contribution, 0), 0),
    'prize_total', coalesce(v_c.prize_pool, 0),
    'currency', coalesce(v_c.currency, 'coins')
  );
end;
$$;

grant execute on function public.top_up_challenge_prize(uuid, numeric, uuid) to authenticated;
grant execute on function public.get_challenge_funding(uuid) to authenticated;

-- $ Skill Tournaments may charge an entry fee. Private / Corporate still cannot.
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
  v_lane text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_title text;
  v_draft uuid;
  v_unlimited boolean;
  v_funding text;
  v_privacy text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_title := nullif(btrim(coalesce(p_payload->>'title', '')), '');
  if v_title is null then
    raise exception 'TITLE_REQUIRED';
  end if;

  v_currency := lower(coalesce(nullif(p_payload->>'currency', ''), 'coins'));
  if v_currency not in ('coins', 'bucks') then
    raise exception 'INVALID_CURRENCY';
  end if;

  v_lane := lower(coalesce(nullif(p_payload->>'challenge_lane', ''), 'coins'));
  if v_lane = 'official' then
    v_lane := 'coins';
  end if;
  if v_lane not in ('coins', 'private') then
    v_lane := 'coins';
  end if;

  v_buy_in := coalesce((p_payload->>'buy_in_amount')::numeric, 0);
  v_creator_contribution := coalesce(
    (p_payload->>'creator_contribution')::numeric,
    (p_payload->>'host_budget')::numeric,
    0
  );
  v_max := nullif(p_payload->>'max_participants', '')::int;
  v_min := greatest(coalesce((p_payload->>'min_participants')::int, 2), 1);
  v_participating := case
    when p_payload ? 'creator_participates' then (p_payload->>'creator_participates')::boolean
    when p_payload ? 'creator_participating' then (p_payload->>'creator_participating')::boolean
    else true
  end;
  v_visibility := lower(coalesce(p_payload->>'visibility', 'public'));
  if v_visibility not in ('public', 'unlisted', 'private', 'friends', 'invite') then
    v_visibility := 'public';
  end if;
  v_privacy := lower(coalesce(p_payload->>'privacy_mode', ''));
  v_host_funded := coalesce((p_payload->>'host_funded')::boolean, v_creator_contribution > 0, false);
  if v_lane = 'private' or v_privacy in ('private', 'private_corporate') then
    v_buy_in := 0;
    if v_visibility not in ('private', 'invite') then
      v_visibility := 'invite';
    end if;
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
    else coalesce(p_payload->>'proof_type', 'photo')
  end;
  if v_proof_type not in ('photo', 'video', 'check_in', 'checkin', 'honor', 'hr', 'pre_selfie') then
    v_proof_type := 'photo';
  end if;

  v_frequency := coalesce(p_payload->>'frequency', 'daily');
  v_required := coalesce(
    nullif(p_payload->>'required_checkins', '')::int,
    nullif(p_payload->>'target_count', '')::int,
    nullif(p_payload->>'days_required', '')::int,
    1
  );
  v_starts := nullif(p_payload->>'starts_at', '')::timestamptz;
  v_ends := nullif(p_payload->>'ends_at', '')::timestamptz;
  v_unlimited := coalesce(
    (p_payload->>'is_unlimited')::boolean,
    coalesce(p_payload->>'end_mode', '') = 'indefinite_lms',
    v_format = 'lms',
    false
  );
  if v_unlimited then
    v_ends := null;
  end if;
  v_draft := nullif(p_payload->>'draft_id', '')::uuid;
  if v_buy_in > 0 and v_creator_contribution > 0 then
    v_funding := 'hybrid';
  elsif v_creator_contribution > 0 then
    v_funding := 'creator';
  else
    v_funding := 'participants';
  end if;
  v_host_funded := v_creator_contribution > 0;

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

  if v_starts is not null and v_starts <= now() then
    raise exception 'START_IN_PAST';
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
    challenge_lane, start_mode, starts_at,
    end_mode, ends_at, length_value, length_unit, is_unlimited,
    max_participants, min_participants, buy_in_amount, currency,
    creator_participating, days_required, min_minutes, proof_requirements, proofs, tasks, rules_list,
    status, prize_pool, prize_structure, top_places_mode, top_places_value,
    top_places_distribution, funding_model, creator_contribution,
    distribution_mode, is_official, series_id, frequency, target_count,
    host_funded, host_budget, format, task, required_checkins, misses_allowed,
    proof_type, proof_review, payout_mode, timezone, start_rule,
    cover_image_url, rules_video_url, discoverability
  ) values (
    v_uid,
    v_title,
    p_payload->>'description',
    p_payload->>'rules',
    coalesce(nullif(p_payload->>'category', ''), 'fitness'),
    v_visibility,
    case when v_format = 'points' then 'points' else 'consistency' end,
    v_lane,
    coalesce(p_payload->>'start_mode', 'fixed'),
    v_starts,
    coalesce(p_payload->>'end_mode', 'length'),
    v_ends,
    nullif(p_payload->>'length_value', '')::int,
    p_payload->>'length_unit',
    v_unlimited,
    v_max,
    v_min,
    v_buy_in,
    v_currency,
    v_participating,
    coalesce(v_required, 1),
    greatest(coalesce(nullif(p_payload->>'min_minutes', '')::int, 1), 1),
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
    v_funding,
    v_creator_contribution,
    coalesce(p_payload->>'distribution_mode', 'auto'),
    false,
    null,
    v_frequency,
    v_required,
    v_host_funded,
    coalesce(nullif(p_payload->>'host_budget', '')::numeric, 0),
    v_format,
    nullif(p_payload->>'task', ''),
    v_required,
    greatest(coalesce((p_payload->>'misses_allowed')::int, 0), 0),
    v_proof_type,
    coalesce(p_payload->>'proof_review', 'auto'),
    coalesce(p_payload->>'payout_mode', 'even_split_remaining'),
    coalesce(nullif(p_payload->>'timezone', ''), 'UTC'),
    coalesce(p_payload->>'start_rule', 'at_starts_at'),
    nullif(p_payload->>'cover_image_url', ''),
    nullif(p_payload->>'rules_video_url', ''),
    case
      when v_visibility in ('public', 'unlisted') then null
      when coalesce(p_payload->>'discoverability', '') in ('invite_only', 'friends_of_friends')
        then p_payload->>'discoverability'
      when v_visibility in ('private', 'invite') and v_currency = 'bucks' then 'invite_only'
      when v_visibility in ('private', 'invite') then 'friends_of_friends'
      else null
    end
  ) returning * into v_row;

  v_id := v_row.id;

  if v_creator_contribution > 0 then
    if v_currency = 'coins' then
      update profiles set coins = coins - v_creator_contribution where id = v_uid;
    else
      update profiles set bucks = bucks - v_creator_contribution where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_creator_contribution where id = v_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (
      v_uid, v_id, v_currency, -v_creator_contribution, 'creator_fund_escrow', 'creator_fund_escrow',
      jsonb_build_object('challenge_id', v_id, 'kind', 'host_contribution')
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
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
      values (
        v_uid, v_id, v_currency, -v_buy_in, 'join_escrow', 'join_escrow',
        jsonb_build_object('challenge_id', v_id, 'kind', 'entry_fee', 'creator_join', true)
      );
    end if;
    insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
    values (v_id, v_uid, v_buy_in, v_currency, 'active')
    on conflict (challenge_id, user_id) do nothing;
  end if;

  begin
    if v_draft is not null then
      delete from challenge_drafts where id = v_draft and owner_id = v_uid;
    end if;
  exception when others then
    begin
      delete from challenge_drafts where user_id = v_uid;
    exception when others then
      null;
    end;
  end;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_id,
    'prize_pool', (select prize_pool from challenges where id = v_id)
  );
end;
$$;

create or replace function public.leave_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_cur text;
  v_amt numeric := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if coalesce(v_c.is_official, false) or coalesce(v_c.series_id, '') <> '' then
    raise exception 'LEAVE_NOT_ALLOWED';
  end if;

  if v_c.status in (
    'live', 'ended', 'settling', 'judging', 'settled', 'cancelled',
    'cancelled_underfilled', 'distributing'
  ) then
    raise exception 'ALREADY_STARTED';
  end if;

  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'already_left', true, 'refunded', 0);
  end if;

  if coalesce(v_p.status, 'joined') in ('refunded_pre_start', 'withdrawn') then
    delete from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = v_uid;
    return jsonb_build_object('ok', true, 'already_left', true, 'refunded', 0);
  end if;

  v_cur := case
    when coalesce(v_p.currency, v_c.currency, 'coins') = 'bucks' then 'bucks'
    else 'coins'
  end;
  v_amt := greatest(coalesce(v_p.buy_in_paid, v_c.buy_in_amount, 0), 0);

  if v_amt > 0 then
    if v_cur = 'coins' then
      update public.profiles
      set coins = coalesce(coins, credits, 0) + v_amt
      where id = v_uid;
    else
      update public.profiles
      set bucks = coalesce(bucks, 0) + v_amt
      where id = v_uid;
    end if;
    update public.challenges
    set prize_pool = greatest(coalesce(prize_pool, 0) - v_amt, 0),
        updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_uid, p_challenge_id, v_cur, v_amt,
      'leave_refund', 'leave_refund',
      jsonb_build_object('challenge_id', p_challenge_id, 'kind', 'entry_fee_refund'),
      p_challenge_id
    );
  end if;

  begin
    delete from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = v_uid
      and status in ('in_progress', 'ready');
  exception when others then
    null;
  end;

  delete from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid;

  begin
    perform public.tick_one_user_challenge_start(p_challenge_id);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'refunded', v_amt,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
end;
$$;
