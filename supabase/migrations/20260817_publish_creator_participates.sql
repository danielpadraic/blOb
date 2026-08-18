-- Honor creator_participates on publish: join + charge only when the toggle is on.

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
  v_participating boolean;
  v_balance numeric;
  v_needed numeric;
  v_row public.challenges%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_currency := coalesce(p_payload->>'currency', 'coins');
  if v_currency not in ('coins', 'bucks') then
    raise exception 'INVALID_CURRENCY';
  end if;

  v_buy_in := coalesce((p_payload->>'buy_in_amount')::numeric, 0);
  v_creator_contribution := coalesce((p_payload->>'creator_contribution')::numeric, 0);
  v_max := nullif(p_payload->>'max_participants', '')::int;
  v_participating := case
    when p_payload ? 'creator_participates' then (p_payload->>'creator_participates')::boolean
    when p_payload ? 'creator_participating' then (p_payload->>'creator_participating')::boolean
    else true
  end;

  if v_max is not null and v_max < 1 then
    raise exception 'MAX_PARTICIPANTS_MIN_1';
  end if;

  if coalesce(p_payload->>'end_mode', '') = 'indefinite_lms'
     and coalesce(p_payload->>'challenge_type', 'consistency') <> 'consistency' then
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
    creator_participating, days_required, min_minutes, proof_requirements, tasks, rules_list,
    status, prize_pool, prize_structure, top_places_mode, top_places_value,
    top_places_distribution, scaled_first_place_pct, funding_model, creator_contribution,
    distribution_mode, distribution_scheduled_at, is_official, frequency, target_count
  ) values (
    v_uid,
    coalesce(p_payload->>'title', 'Untitled challenge'),
    p_payload->>'description',
    p_payload->>'rules',
    p_payload->>'category',
    coalesce(p_payload->>'visibility', 'public'),
    coalesce(p_payload->>'challenge_type', 'consistency'),
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
      coalesce(p_payload->>'end_mode', '') = 'indefinite_lms'
    ),
    v_max,
    greatest(coalesce((p_payload->>'min_participants')::int, 1), 1),
    v_buy_in,
    v_currency,
    v_participating,
    nullif(p_payload->>'days_required', '')::int,
    nullif(p_payload->>'min_minutes', '')::int,
    coalesce(p_payload->'proof_requirements', '[]'::jsonb),
    coalesce(p_payload->'tasks', '[]'::jsonb),
    coalesce(p_payload->'rules_list', '[]'::jsonb),
    'open',
    0,
    coalesce(p_payload->>'prize_structure', 'equal_split'),
    p_payload->>'top_places_mode',
    nullif(p_payload->>'top_places_value', '')::numeric,
    p_payload->>'top_places_distribution',
    nullif(p_payload->>'scaled_first_place_pct', '')::numeric,
    coalesce(p_payload->>'funding_model', 'participants'),
    v_creator_contribution,
    coalesce(p_payload->>'distribution_mode', 'auto'),
    nullif(p_payload->>'distribution_scheduled_at', '')::timestamptz,
    coalesce((p_payload->>'is_official')::boolean, false),
    p_payload->>'frequency',
    nullif(p_payload->>'target_count', '')::int
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
