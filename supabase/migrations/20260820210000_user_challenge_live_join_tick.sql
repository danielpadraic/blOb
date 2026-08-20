-- User-created: stay joinable after starts_at until live. Tick one challenge
-- (join + page sync) so min-met goes live and under-min rolls without waiting
-- for cron. Official fill/arming unchanged.

create or replace function public.tick_one_user_challenge_start(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.challenges%rowtype;
  v_joined int;
  v_need int;
begin
  select * into rec from public.challenges where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'action', 'missing');
  end if;
  if coalesce(rec.is_official, false) or coalesce(rec.series_id, '') <> '' then
    return jsonb_build_object('ok', true, 'action', 'official');
  end if;
  if rec.status in ('live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled', 'distributing') then
    return jsonb_build_object('ok', true, 'action', 'skip');
  end if;
  if rec.status not in ('upcoming', 'open', 'starting', 'in_progress') then
    return jsonb_build_object('ok', true, 'action', 'skip');
  end if;
  if rec.starts_at is null or now() < rec.starts_at then
    return jsonb_build_object('ok', true, 'action', 'waiting');
  end if;
  if rec.ends_at is not null and now() >= rec.ends_at then
    return jsonb_build_object('ok', true, 'action', 'ended');
  end if;

  v_joined := public.challenge_joined_count(rec.id);
  v_need := public.user_challenge_min_needed(rec.min_participants);
  if v_joined >= v_need then
    update public.challenges
    set
      status = 'live',
      official_started_at = coalesce(official_started_at, starts_at),
      start_roll_pending = false,
      start_roll_shift_days = 0,
      updated_at = now()
    where id = rec.id;
    return jsonb_build_object('ok', true, 'action', 'live');
  end if;

  perform public.roll_user_challenge_start(rec.id);
  return jsonb_build_object('ok', true, 'action', 'rolled');
end;
$$;

grant execute on function public.tick_one_user_challenge_start(uuid) to authenticated, service_role;

create or replace function public.tick_user_challenge_starts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_result jsonb;
  v_live int := 0;
  v_rolled int := 0;
begin
  for rec in
    select id
    from public.challenges
    where coalesce(is_official, false) = false
      and coalesce(series_id, '') = ''
      and status in ('upcoming', 'open', 'starting', 'in_progress')
      and starts_at is not null
      and now() >= starts_at
      and (ends_at is null or now() < ends_at)
      and status is distinct from 'live'
  loop
    begin
      v_result := public.tick_one_user_challenge_start(rec.id);
      if v_result->>'action' = 'live' then
        v_live := v_live + 1;
      elsif v_result->>'action' = 'rolled' then
        v_rolled := v_rolled + 1;
      end if;
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'went_live', v_live, 'rolled', v_rolled);
end;
$$;

grant execute on function public.tick_user_challenge_starts() to authenticated, service_role;

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
$$;

grant execute on function public.join_challenge(uuid) to authenticated;

notify pgrst, 'reload schema';
