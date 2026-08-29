-- Format × payout pairing on publish/update only. Does not migrate existing rows
-- and does not change settle_ended_challenge.

create or replace function public.assert_format_payout_pair(
  p_format text,
  p_prize_structure text,
  p_payout_mode text
)
returns void
language plpgsql
immutable
as $$
declare
  v_format text := lower(coalesce(nullif(p_format, ''), 'consistency'));
  v_structure text := lower(coalesce(nullif(p_prize_structure, ''), ''));
  v_payout text := lower(coalesce(nullif(p_payout_mode, ''), ''));
begin
  if v_format in ('lms') then
    v_format := 'consistency';
  end if;
  if v_format = 'consistency' and v_structure = 'top_places' then
    raise exception 'CONSISTENCY_NO_TOP_PLACES';
  end if;
  if v_format in ('points', 'cumulative') and v_payout = 'even_split_remaining' then
    raise exception 'POINTS_NO_EVEN_SPLIT';
  end if;
end;
$$;

create or replace function public.trg_assert_format_payout_pair()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.format is not distinct from old.format
     and new.prize_structure is not distinct from old.prize_structure
     and new.payout_mode is not distinct from old.payout_mode then
    return new;
  end if;
  perform public.assert_format_payout_pair(new.format, new.prize_structure, new.payout_mode);
  return new;
end;
$$;

drop trigger if exists challenges_format_payout_pair on public.challenges;
create trigger challenges_format_payout_pair
  before insert or update of format, prize_structure, payout_mode
  on public.challenges
  for each row
  execute function public.trg_assert_format_payout_pair();

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
  v_days int;
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
  v_prize_structure text;
  v_payout_mode text;
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
  if v_currency = 'bucks' then
    v_buy_in := 0;
  end if;
  v_format := coalesce(p_payload->>'format', p_payload->>'challenge_type', 'consistency');
  if v_format not in ('consistency', 'points', 'lms', 'cumulative') then
    v_format := 'consistency';
  end if;

  v_proofs := coalesce(p_payload->'proofs', '[]'::jsonb);
  if jsonb_typeof(v_proofs) <> 'array' then
    v_proofs := '[]'::jsonb;
  end if;
  if jsonb_array_length(v_proofs) = 0 and v_format <> 'points' then
    v_proof_type := coalesce(p_payload->>'proof_type', 'honor');
    if v_proof_type = 'honor' then
      v_proofs := '[]'::jsonb;
    else
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
  end if;
  v_first_method := coalesce(v_proofs->0->>'method', 'honor');
  v_proof_type := case
    when v_first_method = 'checkin' then 'check_in'
    when v_first_method in ('photo', 'video', 'honor', 'hr') then v_first_method
    else coalesce(p_payload->>'proof_type', 'honor')
  end;
  if v_proof_type not in ('photo', 'video', 'check_in', 'checkin', 'honor', 'hr', 'pre_selfie') then
    v_proof_type := 'honor';
  end if;

  v_frequency := coalesce(p_payload->>'frequency', 'daily');
  v_days := greatest(
    coalesce(
      nullif(p_payload->>'length_value', '')::int,
      nullif(p_payload->>'days_required', '')::int,
      nullif(p_payload->>'duration_days', '')::int,
      nullif(p_payload->>'required_checkins', '')::int,
      nullif(p_payload->>'target_count', '')::int,
      1
    ),
    1
  );
  v_required := case
    when v_format = 'points' then coalesce(nullif(p_payload->>'target_count', '')::int, v_days)
    else v_days
  end;
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

  v_payout_mode := coalesce(p_payload->>'payout_mode', 'even_split_remaining');
  v_prize_structure := coalesce(
    p_payload->>'prize_structure',
    case
      when v_payout_mode = 'winner_take_all' then 'winner_take_all'
      when v_payout_mode = 'top_places' then 'top_places'
      else 'equal_split'
    end
  );
  perform public.assert_format_payout_pair(v_format, v_prize_structure, v_payout_mode);

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
    case
      when v_format = 'points' then 'points'
      when v_format = 'cumulative' then 'cumulative'
      else 'consistency'
    end,
    v_lane,
    coalesce(p_payload->>'start_mode', 'fixed'),
    v_starts,
    coalesce(p_payload->>'end_mode', 'length'),
    v_ends,
    case when v_unlimited then null else v_days end,
    p_payload->>'length_unit',
    v_unlimited,
    v_max,
    v_min,
    v_buy_in,
    v_currency,
    v_participating,
    coalesce(v_days, 1),
    greatest(coalesce(nullif(p_payload->>'min_minutes', '')::int, 1), 1),
    coalesce(p_payload->'proof_requirements', '[]'::jsonb),
    v_proofs,
    coalesce(p_payload->'tasks', '[]'::jsonb),
    coalesce(p_payload->'rules_list', '[]'::jsonb),
    'open',
    0,
    v_prize_structure,
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
    v_days,
    greatest(coalesce((p_payload->>'misses_allowed')::int, 0), 0),
    v_proof_type,
    coalesce(p_payload->>'proof_review', 'auto'),
    v_payout_mode,
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

grant execute on function public.publish_challenge(jsonb) to authenticated;
grant execute on function public.assert_format_payout_pair(text, text, text) to authenticated;

create or replace function public.update_user_challenge(p_challenge_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_min int;
  v_unlimited boolean;
  v_starts timestamptz;
  v_days int;
  v_ends timestamptz;
  v_format text;
  v_prize_structure text;
  v_payout_mode text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if ch.status = 'live' then
    raise exception 'ALREADY_STARTED';
  end if;
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.workout_submissions s where s.challenge_id = p_challenge_id) then
    raise exception 'ALREADY_STARTED';
  end if;

  v_min := greatest(coalesce(nullif(p_payload->>'min_participants', '')::int, ch.min_participants, 2), 2);
  v_unlimited := coalesce((p_payload->>'is_unlimited')::boolean, ch.is_unlimited);
  v_starts := coalesce(nullif(p_payload->>'starts_at', '')::timestamptz, ch.starts_at);
  v_days := case
    when v_unlimited then null
    else greatest(
      coalesce(
        nullif(p_payload->>'duration_days', '')::int,
        nullif(p_payload->>'length_value', '')::int,
        nullif(p_payload->>'days_required', '')::int,
        ch.length_value,
        ch.days_required,
        1
      ),
      1
    )
  end;
  v_ends := case
    when v_unlimited then null
    else public.user_challenge_ends_at(v_starts, v_days)
  end;
  v_format := coalesce(nullif(p_payload->>'format', ''), ch.format);
  v_prize_structure := coalesce(nullif(p_payload->>'prize_structure', ''), ch.prize_structure);
  v_payout_mode := coalesce(nullif(p_payload->>'payout_mode', ''), ch.payout_mode);
  if p_payload ? 'format' or p_payload ? 'prize_structure' or p_payload ? 'payout_mode' then
    perform public.assert_format_payout_pair(v_format, v_prize_structure, v_payout_mode);
  end if;

  update public.challenges
  set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
    description = coalesce(p_payload->>'description', description),
    rules = coalesce(p_payload->>'rules', rules),
    starts_at = v_starts,
    ends_at = v_ends,
    is_unlimited = v_unlimited,
    min_participants = v_min,
    days_required = coalesce(v_days, days_required),
    target_count = case
      when v_format = 'points' then coalesce(nullif(p_payload->>'target_count', '')::int, target_count)
      else coalesce(v_days, target_count)
    end,
    min_minutes = coalesce(nullif(p_payload->>'min_minutes', '')::int, min_minutes),
    frequency = coalesce(p_payload->>'frequency', frequency),
    proofs = coalesce(p_payload->'proofs', proofs),
    proof_requirements = coalesce(p_payload->'proof_requirements', proof_requirements),
    tasks = coalesce(p_payload->'tasks', tasks),
    rules_list = coalesce(p_payload->'rules_list', rules_list),
    visibility = coalesce(p_payload->>'visibility', visibility),
    discoverability = coalesce(p_payload->>'discoverability', discoverability),
    task = coalesce(p_payload->>'task', task),
    length_value = v_days,
    length_unit = case
      when v_unlimited then null
      else coalesce(p_payload->>'length_unit', length_unit, 'days')
    end,
    required_checkins = coalesce(v_days, required_checkins),
    misses_allowed = coalesce(nullif(p_payload->>'misses_allowed', '')::int, misses_allowed),
    proof_type = coalesce(p_payload->>'proof_type', proof_type),
    cover_image_url = coalesce(p_payload->>'cover_image_url', cover_image_url),
    rules_video_url = coalesce(p_payload->>'rules_video_url', rules_video_url),
    format = coalesce(nullif(p_payload->>'format', ''), format),
    challenge_type = coalesce(nullif(p_payload->>'challenge_type', ''), challenge_type),
    prize_structure = coalesce(nullif(p_payload->>'prize_structure', ''), prize_structure),
    payout_mode = coalesce(nullif(p_payload->>'payout_mode', ''), payout_mode),
    top_places_mode = case
      when p_payload ? 'top_places_mode' then nullif(p_payload->>'top_places_mode', '')
      else top_places_mode
    end,
    top_places_value = case
      when p_payload ? 'top_places_value' then nullif(p_payload->>'top_places_value', '')::numeric
      else top_places_value
    end,
    top_places_distribution = case
      when p_payload ? 'top_places_distribution' then nullif(p_payload->>'top_places_distribution', '')
      else top_places_distribution
    end,
    start_roll_pending = false,
    start_roll_shift_days = 0,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return to_jsonb(ch);
end;
$$;

grant execute on function public.update_user_challenge(uuid, jsonb) to authenticated;
