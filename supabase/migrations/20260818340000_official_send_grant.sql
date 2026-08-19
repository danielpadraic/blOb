-- Official Coin grants: header ∞ must send. Do not debit a fake official balance.
-- Non-official insufficient-funds behavior is unchanged.

create or replace function public.send_coins(
  p_to_user_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.coin_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_sender uuid;
  v_first uuid;
  v_second uuid;
  v_balance numeric(12,2);
  v_official boolean;
  v_note text;
  v_transfer public.coin_transfers%rowtype;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_to_user_id is null then
    raise exception 'Pick someone to send to' using errcode = 'P0001';
  end if;

  if p_to_user_id = v_sender then
    raise exception 'You can’t send Coins to yourself' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_to_user_id) then
    raise exception 'Invalid recipient' using errcode = 'P0002';
  end if;

  if public.users_blocked(v_sender, p_to_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'Send at least 0.01 Coins' using errcode = 'P0001';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'Keep the note under 280 characters' using errcode = 'P0001';
  end if;

  if v_sender < p_to_user_id then
    v_first := v_sender;
    v_second := p_to_user_id;
  else
    v_first := p_to_user_id;
    v_second := v_sender;
  end if;

  perform 1 from public.profiles where id = v_first for update;
  perform 1 from public.profiles where id = v_second for update;

  select coins, coalesce(is_official, false)
    into v_balance, v_official
  from public.profiles
  where id = v_sender;

  if not v_official then
    if v_balance is null then
      raise exception 'Finish setting up your profile before you send Coins' using errcode = 'P0001';
    end if;
    if v_amount > 10000 then
      raise exception 'Keep a transfer at 10,000 Coins or less' using errcode = 'P0001';
    end if;
    if v_balance < v_amount then
      raise exception 'Insufficient coins' using errcode = 'P0001';
    end if;
    perform public.wallet_debit(v_sender, 'coins', v_amount);
  end if;

  perform public.wallet_credit(p_to_user_id, 'coins', v_amount);

  insert into public.coin_transfers (sender_id, recipient_id, amount, currency, note)
  values (v_sender, p_to_user_id, v_amount, 'coins', v_note)
  returning * into v_transfer;

  if v_official then
    insert into public.wallet_ledger (
      user_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id, created_at
    )
    values (
      p_to_user_id,
      'coins',
      v_amount,
      'official_grant',
      'official_grant',
      jsonb_build_object(
        'sender_id', v_sender,
        'transfer_id', v_transfer.id,
        'created_at', v_transfer.created_at
      ),
      'coin_transfer',
      v_transfer.id::text,
      v_transfer.created_at
    );
  end if;

  return v_transfer;
end;
$$;

comment on function public.send_coins(uuid, numeric, text) is
  'Peer Coin send. Official senders skip debit and balance. Recipient credit is real. Ledger official_grant. ∞ is not cash.';

grant execute on function public.send_coins(uuid, numeric, text) to authenticated;

create or replace function public.transfer_funds(
  p_recipient_id uuid,
  p_amount numeric,
  p_currency text default 'coins'
)
returns public.coin_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_sender uuid;
  v_first uuid;
  v_second uuid;
  v_currency text;
  v_transfer public.coin_transfers%rowtype;
  v_official boolean;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_recipient_id is null then
    raise exception 'Pick someone to send to' using errcode = 'P0001';
  end if;

  if p_recipient_id = v_sender then
    raise exception 'You can’t send to yourself' using errcode = 'P0001';
  end if;

  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'Send at least 0.01' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;

  if public.users_blocked(v_sender, p_recipient_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(is_official, false) into v_official
  from public.profiles
  where id = v_sender;

  if not (v_official and v_currency = 'coins') then
    if v_amount > 10000 then
      raise exception 'Keep a transfer at 10,000 or less' using errcode = 'P0001';
    end if;
  end if;

  if v_sender < p_recipient_id then
    v_first := v_sender;
    v_second := p_recipient_id;
  else
    v_first := p_recipient_id;
    v_second := v_sender;
  end if;

  perform 1 from public.profiles where id = v_first for update;
  perform 1 from public.profiles where id = v_second for update;

  if v_official and v_currency = 'coins' then
    perform public.wallet_credit(p_recipient_id, 'coins', v_amount);
    insert into public.coin_transfers (sender_id, recipient_id, amount, currency)
    values (v_sender, p_recipient_id, v_amount, 'coins')
    returning * into v_transfer;
    insert into public.wallet_ledger (
      user_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    )
    values (
      p_recipient_id,
      'coins',
      v_amount,
      'official_grant',
      'official_grant',
      jsonb_build_object('sender_id', v_sender, 'transfer_id', v_transfer.id),
      'coin_transfer',
      v_transfer.id::text
    );
    return v_transfer;
  end if;

  perform public.wallet_debit(v_sender, v_currency, v_amount);
  perform public.wallet_credit(p_recipient_id, v_currency, v_amount);

  insert into public.coin_transfers (sender_id, recipient_id, amount, currency)
  values (v_sender, p_recipient_id, v_amount, v_currency)
  returning * into v_transfer;

  return v_transfer;
end;
$$;

create or replace function public.trg_notify_coins_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_amount text;
  v_noun text;
  v_body text;
begin
  v_name := public.profile_display_name(new.sender_id);
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  v_noun := case when public.normalize_wallet_currency(new.currency) = 'bucks' then 'Bucks' else 'Coins' end;
  v_body := v_name || ' sent you ' || v_amount || ' ' || v_noun || '.';
  perform public.notify_user(
    new.recipient_id,
    new.sender_id,
    'coins_received',
    v_body,
    null,
    jsonb_build_object('amount', new.amount, 'transfer_id', new.id, 'currency', coalesce(new.currency, 'coins'))
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_notify_wallet_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_noun text;
  v_amount text;
  v_entry text;
  v_reason text;
begin
  if coalesce(new.amount, 0) <= 0 or new.user_id is null then
    return new;
  end if;
  v_entry := lower(coalesce(new.entry_type, ''));
  v_reason := lower(coalesce(new.reason, ''));
  if v_entry in (
    'refund_pre_start', 'buy_in', 'escrow_lock', 'debit', 'lock',
    'official_grant', 'official_send'
  ) then
    return new;
  end if;
  if v_reason like '%refund%' or v_reason in ('badge_reward', 'payout', 'challenge_payout', 'official_grant', 'official_send') then
    return new;
  end if;
  if v_entry in ('payout', 'prize', 'challenge_payout') then
    return new;
  end if;
  v_noun := case when coalesce(new.currency, 'coins') = 'bucks' then 'bucks' else 'coins' end;
  v_amount := trim(to_char(new.amount, 'FM999999990'));
  perform public.notify_user(
    new.user_id,
    null,
    'coins_received',
    'You earned ' || v_amount || ' ' || v_noun || '.',
    null,
    jsonb_build_object(
      'amount', new.amount,
      'currency', coalesce(new.currency, 'coins'),
      'challenge_id', new.challenge_id
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

notify pgrst, 'reload schema';
