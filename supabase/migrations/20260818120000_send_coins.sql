-- Peer Coin sends. Balances move only inside this function.
-- Optional note is stored on the transfer row and never used to change amounts.

alter table public.coin_transfers
  add column if not exists note text;

alter table public.coin_transfers
  drop constraint if exists coin_transfer_note_len;

alter table public.coin_transfers
  add constraint coin_transfer_note_len check (note is null or char_length(note) <= 280);

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

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Send at least 0.01 Coins' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a transfer at 10,000 Coins or less' using errcode = 'P0001';
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

  select coins into v_balance from public.profiles where id = v_sender;
  if v_balance is null then
    raise exception 'Finish setting up your profile before you send Coins' using errcode = 'P0001';
  end if;
  if v_balance < v_amount then
    raise exception 'Insufficient coins' using errcode = 'P0001';
  end if;

  perform public.wallet_debit(v_sender, 'coins', v_amount);
  perform public.wallet_credit(p_to_user_id, 'coins', v_amount);

  insert into public.coin_transfers (sender_id, recipient_id, amount, currency, note)
  values (v_sender, p_to_user_id, v_amount, 'coins', v_note)
  returning * into v_transfer;

  return v_transfer;
end;
$$;

grant execute on function public.send_coins(uuid, numeric, text) to authenticated;

comment on function public.send_coins(uuid, numeric, text) is
  'Send Coins to another profile. Debits/credits happen only inside this RPC.';
