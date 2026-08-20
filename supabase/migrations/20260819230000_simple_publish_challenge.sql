-- One publish_challenge RPC for normal users. Drops the overloaded stub that
-- PostgREST resolved as PGRST203 / "sideways". Host is auto-enrolled.
-- Does not require is_official, is_creator, or series_id.

alter table public.challenges drop constraint if exists challenges_visibility_check;
alter table public.challenges
  add constraint challenges_visibility_check
  check (visibility in ('public', 'private', 'unlisted', 'friends', 'invite'));

alter table public.challenges drop constraint if exists challenges_lane_money_safety_check;
alter table public.challenges
  add constraint challenges_lane_money_safety_check
  check (
    coalesce(is_official, false)
    or challenge_lane is null
    or challenge_lane in ('private', 'official')
    or (challenge_lane = 'coins' and currency in ('coins', 'bucks'))
  );

drop function if exists public.publish_challenge(jsonb, uuid);
drop function if exists public.publish_challenge(jsonb);

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
  v_visibility := lower(coalesce(p_payload->>'visibility', 'public'));
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
  if v_lane = 'private' then
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
  v_funding := coalesce(
    p_payload->>'funding_model',
    case when v_host_funded then 'creator' else 'participants' end
  );
  if v_funding in ('participant_buy_in', 'free') then
    v_funding := 'participants';
  end if;
  if v_funding in ('creator_funded') then
    v_funding := 'creator';
  end if;
  if v_funding not in ('creator', 'hybrid', 'participants') then
    v_funding := case when v_host_funded then 'creator' else 'participants' end;
  end if;

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
    v_creator_contribution,
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
      jsonb_build_object('challenge_id', v_id)
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
        jsonb_build_object('creator_join', true)
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

create or replace function public.join_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_balance numeric;
  v_count int;
  v_need numeric;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.is_official
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    raise exception 'GEO_BLOCKED';
  end if;

  if v_c.series_id is not null then
    if v_c.status not in ('filling', 'arming') then
      raise exception 'ALREADY_STARTED';
    end if;
  elsif v_c.is_official then
    raise exception 'NOT_JOINABLE';
  else
    if v_c.status in (
      'live', 'in_progress', 'judging', 'settled',
      'cancelled', 'cancelled_underfilled', 'distributing'
    ) then
      raise exception 'ALREADY_STARTED';
    end if;
    if v_c.starts_at is not null and now() >= v_c.starts_at then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.official_started_at is not null then
      raise exception 'ALREADY_STARTED';
    end if;
    if v_c.status not in ('open', 'starting', 'upcoming', 'filling', 'arming') then
      raise exception 'NOT_JOINABLE';
    end if;
  end if;

  if exists (select 1 from challenge_participants where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'ALREADY_JOINED';
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is distinct from v_uid
     and not public.are_accepted_friends(v_c.created_by, v_uid) then
    raise exception 'FRIENDS_ONLY';
  end if;

  if public.is_invite_only_challenge(v_c)
     and v_c.created_by is distinct from v_uid
     and not public.user_can_access_challenge(p_challenge_id, v_uid) then
    raise exception 'NOT_INVITED';
  end if;

  select count(*) into v_count from challenge_participants
  where challenge_id = p_challenge_id and status <> 'refunded_pre_start';

  if v_c.max_participants is not null and v_count >= v_c.max_participants then
    raise exception 'LOBBY_FULL';
  end if;

  if v_c.is_official then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
  end if;

  if v_c.currency = 'coins' then
    select coins into v_balance from profiles where id = v_uid for update;
  else
    select bucks into v_balance from profiles where id = v_uid for update;
  end if;

  if v_balance < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_c.currency = 'coins' then
      update profiles set coins = coins - v_c.buy_in_amount where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (
      v_uid, p_challenge_id, v_c.currency, -v_c.buy_in_amount, 'join_escrow', 'join_escrow',
      '{}'::jsonb
    );
  end if;

  insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, v_uid, v_c.buy_in_amount, v_c.currency, 'active');

  update public.challenge_invites
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now())
  where challenge_id = p_challenge_id
    and invitee_id = v_uid
    and status = 'pending';

  if v_c.series_id is not null then
    select 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0)
      into v_need
    from public.challenges
    where id = p_challenge_id;
    if v_need > 0 then
      update public.challenges
      set status = 'arming', armed_at = coalesce(armed_at, now()), updated_at = now()
      where id = p_challenge_id
        and status = 'filling'
        and coalesce(prize_pool, 0) >= v_need;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;
