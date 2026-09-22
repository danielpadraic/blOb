-- House add: @blob anytime until settle, any privacy_mode (including
-- private_corporate). Friendly host until settle. Normal / Strict host
-- only while the join window is open. Blocked-with-host rejected.
-- One Live note is written by the client; skip per-seat announce.
-- Notify each added person to Overview — not /submit.
-- Do not touch TEST 8fce711b. Do not add admin_mass_join.

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
  v_cur text;
  v_fee numeric := 0;
  v_balance numeric := 0;
  v_status text;
  v_friendly boolean;
  v_staff boolean;
  v_ops boolean;
  v_until timestamptz;
  v_title text;
  v_href text;
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
  v_friendly := lower(coalesce(v_c.host_rigor, 'normal')) = 'friendly';
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

  -- @blob: any privacy_mode, after start, until settle.
  -- Friendly host/mod: until settle.
  -- Normal / Strict host/mod: join window only.
  if not v_ops and not v_friendly then
    v_until := coalesce(v_c.join_until_at, v_c.starts_at);
    if v_until is not null and now() >= v_until then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
    if v_until is null and v_status in ('live', 'in_progress') then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    raise exception 'They’re already in.' using errcode = 'P0001';
  end if;

  if v_c.created_by is not null
     and public.friendship_is_blocked(v_c.created_by, p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);

  if v_fee > 0 then
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
      jsonb_build_object('kind', 'host_add'),
      p_challenge_id
    );
  end if;

  insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, p_user_id, v_fee, v_cur, 'active');

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
    jsonb_build_object('kind', 'host_add', 'fee', v_fee, 'currency', v_cur)
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
end;
$$;

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
  v_mode text;
  v_cur text;
  v_fee numeric := 0;
  v_balance numeric := 0;
  v_status text;
  v_title text;
  v_href text;
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

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    raise exception 'They’re already in.' using errcode = 'P0001';
  end if;

  if v_c.created_by is not null
     and public.friendship_is_blocked(v_c.created_by, p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);

  if v_mode = 'charge' and v_fee > 0 then
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
      jsonb_build_object('kind', 'official_ops_charge'),
      p_challenge_id
    );
  elsif v_mode = 'house' and v_fee > 0 then
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_fee, updated_at = now()
    where id = p_challenge_id;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (
    p_challenge_id,
    p_user_id,
    case when v_mode = 'none' then 0 else v_fee end,
    v_cur,
    'active'
  );

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
    jsonb_build_object('buy_in', v_mode, 'fee', v_fee, 'currency', v_cur)
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
