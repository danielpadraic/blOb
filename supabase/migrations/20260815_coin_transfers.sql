-- Peer-to-peer Coin transfers. Balance movement is RPC-only.
-- Safe to re-run.

create table if not exists public.coin_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint coin_transfer_positive check (amount > 0),
  constraint coin_transfer_not_self check (sender_id <> recipient_id)
);

comment on table public.coin_transfers is 'Audit log for peer Coin sends. Inserts happen only inside transfer_coins().';

create index if not exists coin_transfers_sender_id_idx
  on public.coin_transfers (sender_id, created_at desc);

create index if not exists coin_transfers_recipient_id_idx
  on public.coin_transfers (recipient_id, created_at desc);

alter table public.coin_transfers enable row level security;

drop policy if exists "Users read own coin transfers" on public.coin_transfers;
create policy "Users read own coin transfers"
  on public.coin_transfers for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

grant select on public.coin_transfers to authenticated;

create or replace function public.transfer_coins(p_recipient_id uuid, p_amount numeric)
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
  v_sender_credits numeric(12,2);
  v_transfer public.coin_transfers%rowtype;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_recipient_id is null then
    raise exception 'Pick someone to send Coins to' using errcode = 'P0001';
  end if;

  if p_recipient_id = v_sender then
    raise exception 'You can’t send Coins to yourself' using errcode = 'P0001';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Send at least 0.01 Coins' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a transfer at 10,000 Coins or less' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
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

  select credits into v_sender_credits
  from public.profiles
  where id = v_sender;

  if v_sender_credits is null then
    raise exception 'Finish setting up your profile before you send Coins' using errcode = 'P0001';
  end if;

  if v_sender_credits < v_amount then
    raise exception 'Insufficient credits' using errcode = 'P0001';
  end if;

  update public.profiles
    set credits = credits - v_amount
    where id = v_sender;

  update public.profiles
    set credits = credits + v_amount
    where id = p_recipient_id;

  insert into public.coin_transfers (sender_id, recipient_id, amount)
  values (v_sender, p_recipient_id, v_amount)
  returning * into v_transfer;

  return v_transfer;
end;
$$;

grant execute on function public.transfer_coins(uuid, numeric) to authenticated;
