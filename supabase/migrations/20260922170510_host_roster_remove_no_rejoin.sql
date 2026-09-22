-- Host / moderator add-remove. Remove marks withdrawn (does not delete),
-- so the original invite cannot rejoin. Manual host_add reactivates.
-- Friendly + Normal until settle. Strict stays join-window / @blob.
-- Official cash stays @blob house tools. Do not db push --include-all.
-- TEST 8fce711b is not mutated.

alter table public.challenge_participants drop constraint if exists challenge_participants_status_check;
alter table public.challenge_participants
  add constraint challenge_participants_status_check
  check (status in (
    'active', 'completed', 'eliminated', 'failed', 'refunded_pre_start',
    'joined', 'pending', 'missed', 'withdrawn'
  ));

create or replace function public.host_add_participant(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_cur text;
  v_fee numeric := 0;
  v_charge numeric := 0;
  v_balance numeric := 0;
  v_status text;
  v_rigor text;
  v_staff boolean;
  v_ops boolean;
  v_until timestamptz;
  v_title text;
  v_href text;
  v_existing boolean := false;
  v_paid numeric := 0;
begin
  if auth.uid() is null or p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_ops := public.is_official_ops();
  v_staff := v_ops
    or v_c.created_by is not distinct from auth.uid()
    or exists (
      select 1 from public.challenge_moderators
      where challenge_id = p_challenge_id and user_id = auth.uid()
    );

  if not v_staff then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;

  -- @blob: any privacy_mode, after start, until settle (including Official cash).
  -- Friendly + Normal host/mod: until settle.
  -- Strict host/mod: join window only.
  -- Official cash host/mod: no — house tools only.
  v_rigor := lower(coalesce(v_c.host_rigor, 'normal'));
  if not v_ops then
    if public.challenge_is_official_cash(v_c) then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
    if v_rigor = 'strict' then
      v_until := coalesce(v_c.join_until_at, v_c.starts_at);
      if v_until is not null and now() >= v_until then
        raise exception 'Couldn’t add them.' using errcode = 'P0001';
      end if;
      if v_until is null and v_status in ('live', 'in_progress') then
        raise exception 'Couldn’t add them.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;
  if found then
    if lower(coalesce(v_p.status, '')) not in ('withdrawn', 'refunded_pre_start') then
      raise exception 'They’re already in.' using errcode = 'P0001';
    end if;
    v_existing := true;
    v_paid := greatest(coalesce(v_p.buy_in_paid, 0), 0);
  end if;

  if v_c.created_by is not null
     and public.friendship_is_blocked(v_c.created_by, p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);
  v_charge := case when v_existing and v_paid > 0 then 0 else v_fee end;

  if v_charge > 0 then
    if v_cur = 'coins' then
      select coalesce(coins, credits, 0) into v_balance from public.profiles where id = p_user_id for update;
    else
      select coalesce(bucks, 0) into v_balance from public.profiles where id = p_user_id for update;
    end if;
    if coalesce(v_balance, 0) < v_charge then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) - v_charge
      where id = p_user_id;
    else
      update public.profiles set bucks = bucks - v_charge where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_charge, updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, -v_charge,
      'join_escrow', 'join_escrow',
      jsonb_build_object('kind', 'host_add', 'reseated', v_existing),
      p_challenge_id
    );
  end if;

  if v_existing then
    update public.challenge_participants
      set status = 'active',
          buy_in_paid = case when v_charge > 0 then v_charge else v_paid end,
          currency = v_cur,
          eliminated_at = null
    where challenge_id = p_challenge_id and user_id = p_user_id;
  else
    insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
    values (p_challenge_id, p_user_id, v_fee, v_cur, 'active');
  end if;

  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_href := '/challenges/' || p_challenge_id::text || '?tab=overview';
  begin
    perform public.notify_user(
      p_user_id,
      auth.uid(),
      'challenge_joined',
      v_title,
      'You’ve been added to ' || v_title || '.',
      jsonb_build_object(
        'type', 'challenge_joined',
        'challenge_id', p_challenge_id,
        'challengeId', p_challenge_id,
        'href', v_href,
        'url', v_href
      )
    );
  exception when others then
    null;
  end;

  perform public.official_ops_log(
    p_challenge_id,
    p_user_id,
    'add',
    jsonb_build_object('kind', 'host_add', 'fee', v_charge, 'currency', v_cur, 'reseated', v_existing)
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
end;
$$;

create or replace function public.host_remove_participant(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_cur text;
  v_amt numeric := 0;
  v_status text;
  v_rigor text;
  v_staff boolean;
  v_ops boolean;
  v_until timestamptz;
  v_title text;
begin
  if auth.uid() is null or p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t remove them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t remove them.' using errcode = 'P0001';
  end if;

  v_ops := public.is_official_ops();
  v_staff := v_ops
    or v_c.created_by is not distinct from auth.uid()
    or exists (
      select 1 from public.challenge_moderators
      where challenge_id = p_challenge_id and user_id = auth.uid()
    );

  if not v_staff then
    raise exception 'Couldn’t remove them.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;

  v_rigor := lower(coalesce(v_c.host_rigor, 'normal'));
  if not v_ops then
    if public.challenge_is_official_cash(v_c) then
      raise exception 'Couldn’t remove them.' using errcode = 'P0001';
    end if;
    if v_rigor = 'strict' then
      v_until := coalesce(v_c.join_until_at, v_c.starts_at);
      if v_until is not null and now() >= v_until then
        raise exception 'Couldn’t remove them.' using errcode = 'P0001';
      end if;
      if v_until is null and v_status in ('live', 'in_progress') then
        raise exception 'Couldn’t remove them.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if v_c.created_by is not distinct from p_user_id then
    raise exception 'The host stays in.' using errcode = 'P0001';
  end if;

  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Couldn’t remove them.' using errcode = 'P0001';
  end if;
  if lower(coalesce(v_p.status, '')) in ('withdrawn', 'refunded_pre_start') then
    raise exception 'They’re already out.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_p.currency, v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_amt := greatest(coalesce(v_p.buy_in_paid, 0), 0);

  if v_amt > 0 then
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) + v_amt
      where id = p_user_id;
    else
      update public.profiles set bucks = coalesce(bucks, 0) + v_amt where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = greatest(coalesce(prize_pool, 0) - v_amt, 0), updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, v_amt,
      'leave_refund', 'host_remove',
      jsonb_build_object('kind', 'host_remove'),
      p_challenge_id
    );
  end if;

  update public.challenge_participants
    set status = 'withdrawn',
        buy_in_paid = 0
  where challenge_id = p_challenge_id and user_id = p_user_id;

  begin
    delete from public.challenge_moderators
    where challenge_id = p_challenge_id and user_id = p_user_id;
  exception when others then
    null;
  end;

  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  begin
    perform public.notify_user(
      p_user_id,
      auth.uid(),
      'challenge_cancelled',
      v_title,
      'You’re no longer in ' || v_title || '.',
      jsonb_build_object(
        'type', 'challenge_removed',
        'challenge_id', p_challenge_id,
        'challengeId', p_challenge_id
      )
    );
  exception when others then
    null;
  end;

  perform public.official_ops_log(
    p_challenge_id,
    p_user_id,
    'remove',
    jsonb_build_object('kind', 'host_remove', 'refund', v_amt, 'currency', v_cur)
  );

  return jsonb_build_object('ok', true, 'challenge_id', p_challenge_id, 'user_id', p_user_id);
end;
$$;

-- official_add can re-seat a withdrawn row so @blob house add still works.
create or replace function public.official_add_participant(
  p_challenge_id uuid,
  p_user_id uuid,
  p_buy_in text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_mode text;
  v_cur text;
  v_fee numeric := 0;
  v_balance numeric := 0;
  v_status text;
  v_title text;
  v_href text;
  v_existing boolean := false;
  v_paid numeric := 0;
begin
  if not public.is_official_ops() then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;
  if p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_mode := lower(btrim(coalesce(p_buy_in, '')));
  if v_mode not in ('charge', 'house', 'none') then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;
  if v_status not in (
    'open', 'upcoming', 'starting', 'in_progress', 'filling', 'arming', 'live'
  ) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;
  if found then
    if lower(coalesce(v_p.status, '')) not in ('withdrawn', 'refunded_pre_start') then
      raise exception 'They’re already in.' using errcode = 'P0001';
    end if;
    v_existing := true;
    v_paid := greatest(coalesce(v_p.buy_in_paid, 0), 0);
  end if;

  if v_c.created_by is not null
     and public.friendship_is_blocked(v_c.created_by, p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);

  if v_existing and v_paid > 0 then
    null;
  elsif v_mode = 'charge' and v_fee > 0 then
    if v_cur = 'coins' then
      select coalesce(coins, credits, 0) into v_balance from public.profiles where id = p_user_id for update;
    else
      select coalesce(bucks, 0) into v_balance from public.profiles where id = p_user_id for update;
    end if;
    if coalesce(v_balance, 0) < v_fee then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) - v_fee
      where id = p_user_id;
    else
      update public.profiles set bucks = bucks - v_fee where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_fee, updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, -v_fee,
      'join_escrow', 'join_escrow',
      jsonb_build_object('kind', 'official_ops_charge', 'reseated', v_existing),
      p_challenge_id
    );
  elsif v_mode = 'house' and v_fee > 0 then
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_fee, updated_at = now()
    where id = p_challenge_id;
  end if;

  if v_existing then
    update public.challenge_participants
      set status = 'active',
          buy_in_paid = case
            when v_paid > 0 then v_paid
            when v_mode = 'none' then 0
            else v_fee
          end,
          currency = v_cur,
          eliminated_at = null
    where challenge_id = p_challenge_id and user_id = p_user_id;
  else
    insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
    values (
      p_challenge_id,
      p_user_id,
      case when v_mode = 'none' then 0 else v_fee end,
      v_cur,
      'active'
    );
  end if;

  begin
    update public.challenge_invites
      set status = 'accepted',
          accepted_at = coalesce(accepted_at, now())
    where challenge_id = p_challenge_id
      and invitee_id = p_user_id
      and status = 'pending';
  exception when others then
    null;
  end;

  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_href := '/challenges/' || p_challenge_id::text || '?tab=overview';
  begin
    perform public.notify_user(
      p_user_id,
      auth.uid(),
      'challenge_joined',
      v_title,
      'You’ve been added to ' || v_title || '.',
      jsonb_build_object(
        'type', 'challenge_joined',
        'challenge_id', p_challenge_id,
        'challengeId', p_challenge_id,
        'href', v_href,
        'url', v_href
      )
    );
  exception when others then
    null;
  end;

  perform public.official_ops_log(
    p_challenge_id,
    p_user_id,
    'add',
    jsonb_build_object('buy_in', v_mode, 'fee', v_fee, 'currency', v_cur, 'reseated', v_existing)
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'buy_in', v_mode,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
exception
  when raise_exception then
    raise;
  when others then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
end;
$$;

-- Self-join with the original link cannot reseat a withdrawn row.
drop function if exists public.join_challenge(uuid);

create or replace function public.join_challenge(
  p_challenge_id uuid,
  p_roster_role text default 'participant',
  p_scoring_lane text default null,
  p_self_moderator boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_shape text;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
      and lower(coalesce(status, '')) in ('withdrawn', 'refunded_pre_start')
  ) then
    raise exception 'REMOVED_NO_REJOIN';
  end if;
  if public.challenge_skips_cash_geo(p_challenge_id) then
    return public.join_challenge_ungated(p_challenge_id, p_roster_role, p_scoring_lane, p_self_moderator);
  end if;
  v_shape := public.geo_challenge_money_shape(
    v_c.currency,
    v_c.buy_in_amount,
    v_c.prize_pool,
    greatest(coalesce(v_c.host_budget, 0), coalesce(v_c.creator_contribution, 0), 0),
    coalesce(v_c.host_funded, false),
    coalesce(v_c.is_callout, false)
  );
  v_action := public.geo_join_action_for_shape(v_shape);
  if v_action is not null then
    perform public.assert_geo_cash_gate(v_action, p_challenge_id, null);
  end if;
  return public.join_challenge_ungated(p_challenge_id, p_roster_role, p_scoring_lane, p_self_moderator);
end;
$$;

revoke all on function public.host_add_participant(uuid, uuid) from public, anon;
revoke all on function public.host_remove_participant(uuid, uuid) from public, anon;
revoke all on function public.official_add_participant(uuid, uuid, text) from public, anon;
revoke all on function public.join_challenge_ungated(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.host_add_participant(uuid, uuid) to authenticated;
grant execute on function public.host_remove_participant(uuid, uuid) to authenticated;
grant execute on function public.official_add_participant(uuid, uuid, text) to authenticated;
grant execute on function public.join_challenge(uuid, text, text, boolean) to authenticated;
