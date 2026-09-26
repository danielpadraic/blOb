-- Official CASH joins stay shut until payouts go live.
--
-- Mirrors the client ship switch. The TS constant is the real one:
--   lib/officialCash.ts -> CASH_OFFICIAL_JOINS_LIVE
-- A crafted request must not be able to buy a cash Official ticket while that
-- is false, so the same hold lives here.
--
-- Touches nothing else: Official Coin, free rooms, user-created $ rooms,
-- host-funded bucks rooms that are not Official, and already-joined
-- participants all keep their existing rules.

/**
 * The server half of CASH_OFFICIAL_JOINS_LIVE.
 * flip with CASH_OFFICIAL_JOINS_LIVE in lib/officialCash.ts
 */
create or replace function public.official_cash_joins_live()
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- flip with CASH_OFFICIAL_JOINS_LIVE
  select false;
$$;

comment on function public.official_cash_joins_live() is
  'Finix contest MID hold. Keep in step with CASH_OFFICIAL_JOINS_LIVE in lib/officialCash.ts.';

/** A house real-money Official with a paid entry, never an Official Coin room. */
create or replace function public.official_cash_join_blocked(ch challenges)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.challenge_is_official_cash(ch)
    and coalesce((ch).official_kind, '') = ''
    and coalesce((ch).buy_in_amount, 0) > 0
    and not public.official_cash_joins_live();
$$;

grant execute on function public.official_cash_joins_live() to authenticated, anon;
grant execute on function public.official_cash_join_blocked(challenges) to authenticated, anon;

-- Refuse the paid join at the one RPC that moves the money.
-- `join_challenge` delegates here, so both doors are covered.
create or replace function public.join_challenge_ungated(
  p_challenge_id uuid,
  p_roster_role text default 'participant'::text,
  p_scoring_lane text default null::text,
  p_self_moderator boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_balance numeric;
  v_count int;
  v_need numeric;
  v_cur text;
  v_dob text;
  v_until timestamptz;
  v_role text;
  v_lane text;
  v_cfg jsonb;
  v_has_lanes boolean;
  v_can_self_mod boolean;
  v_rigor text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  -- Cash Officials are shut while payouts are held. No debit, no escrow, no row.
  if public.official_cash_join_blocked(v_c) then
    raise exception 'CASH_OFFICIALS_NOT_LIVE' using errcode = 'P0001';
  end if;

  if public.friendship_is_blocked(v_uid, v_c.created_by) then
    raise exception 'NOT_INVITED';
  end if;

  if coalesce(v_c.is_callout, false) then
    raise exception 'This Callout is cheer only. Watching — no entry, no prize.' using errcode = 'P0001';
  end if;

  if v_c.is_official
     and not public.challenge_skips_cash_geo(p_challenge_id)
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
      'judging', 'settled', 'settling', 'ended',
      'cancelled', 'cancelled_underfilled', 'distributing'
    ) then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.status not in (
      'open', 'upcoming', 'starting', 'in_progress', 'live', 'filling', 'arming'
    ) then
      raise exception 'JOIN_CLOSED';
    end if;
    v_until := coalesce(v_c.join_until_at, v_c.starts_at);
    if not public.challenge_invite_join_open_after_start(v_c)
       and v_until is not null
       and now() >= v_until then
      raise exception 'JOIN_CLOSED';
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
     and v_c.created_by is distinct from v_uid then
    if not public.user_can_access_challenge(p_challenge_id, v_uid) then
      raise exception 'NOT_INVITED';
    end if;
  end if;

  select count(*) into v_count from challenge_participants
  where challenge_id = p_challenge_id and status <> 'refunded_pre_start';

  if v_c.max_participants is not null and v_count >= v_c.max_participants then
    raise exception 'LOBBY_FULL';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_c.is_official, false) then
    v_dob := public.official_dob_status(v_uid);
    if v_dob = 'DOB_REQUIRED' then
      raise exception 'DOB_REQUIRED';
    end if;
    if v_dob = 'UNDERAGE' then
      raise exception 'UNDERAGE';
    end if;
  end if;

  if public.requires_official_body_metrics(v_c) then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
  end if;

  v_role := lower(trim(coalesce(p_roster_role, 'participant')));
  if v_role not in ('participant', 'observer') then
    raise exception 'BAD_ROSTER_ROLE';
  end if;

  v_cfg := coalesce(v_c.scoring_config, v_c.comparable_points_config, '{}'::jsonb);
  v_has_lanes := jsonb_typeof(v_cfg->'lanes') = 'array' and jsonb_array_length(v_cfg->'lanes') > 0;
  v_lane := nullif(trim(coalesce(p_scoring_lane, '')), '');
  if v_role = 'observer' then
    v_lane := null;
  elsif v_has_lanes then
    if v_lane is null then
      raise exception 'SIDE_REQUIRED';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_cfg->'lanes') lane
      where lane->>'id' = v_lane
    ) then
      raise exception 'BAD_SIDE';
    end if;
  else
    v_lane := null;
  end if;

  v_rigor := lower(coalesce(v_c.host_rigor, 'normal'));
  v_can_self_mod :=
    coalesce(v_c.privacy_mode, '') in ('private', 'private_corporate')
    and coalesce(v_c.is_official, false) = false
    and v_rigor in ('friendly', 'normal')
    and not (
      lower(coalesce(v_c.currency, 'coins')) in ('bucks', 'usd', 'cash')
      and coalesce(v_c.buy_in_amount, 0) > 0
    );
  if p_self_moderator and not v_can_self_mod then
    raise exception 'SELF_MOD_FORBIDDEN';
  end if;

  v_cur := case when v_c.currency = 'bucks' then 'bucks' else 'coins' end;
  if v_cur = 'coins' then
    select coalesce(coins, credits, 0) into v_balance from profiles where id = v_uid for update;
  else
    select coalesce(bucks, 0) into v_balance from profiles where id = v_uid for update;
  end if;

  if coalesce(v_balance, 0) < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_cur = 'coins' then
      update profiles
      set coins = coalesce(coins, credits, 0) - v_c.buy_in_amount
      where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_uid, p_challenge_id, v_cur, -v_c.buy_in_amount,
      'join_escrow', 'join_escrow',
      '{}'::jsonb,
      p_challenge_id
    );
  end if;

  insert into challenge_participants (
    challenge_id, user_id, buy_in_paid, currency, status, scoring_lane, roster_role, points
  ) values (
    p_challenge_id, v_uid, v_c.buy_in_amount, v_cur, 'active', v_lane, v_role, 0
  );

  if p_self_moderator then
    insert into public.challenge_moderators (challenge_id, user_id, assigned_by)
    values (p_challenge_id, v_uid, v_uid)
    on conflict (challenge_id, user_id) do nothing;
  end if;

  begin
    update public.challenge_invites
    set status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where challenge_id = p_challenge_id
      and invitee_id = v_uid
      and status = 'pending';
  exception when others then
    null;
  end;

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
  elsif coalesce(v_c.is_official, false) = false then
    begin
      perform public.tick_one_user_challenge_start(p_challenge_id);
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$function$;

notify pgrst, 'reload schema';
