-- Dual currency: Blob Coins (soft) + Blob Bucks (real money, 1 Buck = $1 USD).
-- Also 1-on-1 call-outs with mutual resolution. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Profile wallets
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists coins numeric(12,2);

alter table public.profiles
  add column if not exists bucks numeric(12,2);

update public.profiles
  set coins = coalesce(coins, credits, 0),
      bucks = coalesce(bucks, 0);

alter table public.profiles
  alter column coins set default 50.00,
  alter column coins set not null,
  alter column bucks set default 0,
  alter column bucks set not null;

alter table public.profiles drop constraint if exists coins_non_negative;
alter table public.profiles add constraint coins_non_negative check (coins >= 0);
alter table public.profiles drop constraint if exists bucks_non_negative;
alter table public.profiles add constraint bucks_non_negative check (bucks >= 0);

comment on column public.profiles.coins is 'PRIVATE Blob Coins (soft currency). Read via get_my_profile().';
comment on column public.profiles.bucks is 'PRIVATE Blob Bucks (1 Buck = $1 USD). Read via get_my_profile().';

revoke update (credits, coins, bucks) on public.profiles from authenticated, anon;

-- Keep credits aligned with coins for older RPCs that still touch credits.
create or replace function public.sync_profile_credits()
returns trigger
language plpgsql
as $$
begin
  new.credits := new.coins;
  return new;
end;
$$;

drop trigger if exists profiles_sync_credits on public.profiles;
create trigger profiles_sync_credits
  before insert or update of coins on public.profiles
  for each row execute function public.sync_profile_credits();

-- ---------------------------------------------------------------------------
-- Challenge currency
-- ---------------------------------------------------------------------------

alter table public.challenges
  add column if not exists currency text;

update public.challenges
  set currency = coalesce(nullif(currency, ''), 'coins')
  where currency is null or currency = '';

alter table public.challenges
  alter column currency set default 'coins',
  alter column currency set not null;

alter table public.challenges drop constraint if exists challenges_currency_known;
alter table public.challenges add constraint challenges_currency_known
  check (currency in ('coins', 'bucks'));

comment on column public.challenges.currency is 'Prize pool and buy-in denomination. Official challenges may be free to join and still pay Bucks.';

-- ---------------------------------------------------------------------------
-- Wallet helpers (not granted to clients)
-- ---------------------------------------------------------------------------

create or replace function public.normalize_wallet_currency(p_currency text)
returns text
language plpgsql
immutable
as $$
begin
  if lower(coalesce(p_currency, 'coins')) = 'bucks' then
    return 'bucks';
  end if;
  return 'coins';
end;
$$;

create or replace function public.wallet_debit(p_user uuid, p_currency text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_amount numeric(12,2);
  v_balance numeric(12,2);
begin
  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    return;
  end if;
  if p_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform 1 from public.profiles where id = p_user for update;

  if v_currency = 'bucks' then
    select bucks into v_balance from public.profiles where id = p_user;
    if v_balance is null then
      raise exception 'Finish setting up your profile before you spend Bucks' using errcode = 'P0001';
    end if;
    if v_balance < v_amount then
      raise exception 'Insufficient bucks' using errcode = 'P0001';
    end if;
    update public.profiles set bucks = bucks - v_amount where id = p_user;
  else
    select coins into v_balance from public.profiles where id = p_user;
    if v_balance is null then
      raise exception 'Finish setting up your profile before you spend Coins' using errcode = 'P0001';
    end if;
    if v_balance < v_amount then
      raise exception 'Insufficient credits' using errcode = 'P0001';
    end if;
    update public.profiles set coins = coins - v_amount where id = p_user;
  end if;
end;
$$;

create or replace function public.wallet_credit(p_user uuid, p_currency text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_amount numeric(12,2);
begin
  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 or p_user is null then
    return;
  end if;
  if v_currency = 'bucks' then
    update public.profiles set bucks = bucks + v_amount where id = p_user;
  else
    update public.profiles set coins = coins + v_amount where id = p_user;
  end if;
end;
$$;

-- Fund creator contribution on publish. Official/sponsored rows are not debited.
create or replace function public.trg_fund_new_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.currency := public.normalize_wallet_currency(new.currency);
  if new.is_official then
    return new;
  end if;
  new.prize_pool := round(coalesce(new.creator_contribution, 0), 2);
  if new.prize_pool > 0 then
    perform public.wallet_debit(new.created_by, new.currency, new.prize_pool);
  end if;
  return new;
exception when others then
  raise;
end;
$$;

drop trigger if exists challenges_fund_on_insert on public.challenges;
create trigger challenges_fund_on_insert
  before insert on public.challenges
  for each row execute function public.trg_fund_new_challenge();

-- ---------------------------------------------------------------------------
-- join_challenge: debit the challenge currency
-- ---------------------------------------------------------------------------

create or replace function public.join_challenge(p_challenge_id uuid)
returns public.challenge_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  participant public.challenge_participants%rowtype;
  joiner_count int;
  v_currency text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status not in ('upcoming', 'open', 'in_progress') then
    raise exception 'This challenge is no longer accepting joiners' using errcode = 'P0001';
  end if;

  if ch.ends_at is not null and now() >= ch.ends_at then
    raise exception 'Challenge has ended' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid()
  ) then
    raise exception 'Already joined this challenge' using errcode = '23505';
  end if;

  if ch.max_participants is not null then
    select count(*) into joiner_count
    from public.challenge_participants
    where challenge_id = p_challenge_id;
    if joiner_count >= ch.max_participants then
      raise exception 'This challenge is full' using errcode = 'P0001';
    end if;
  end if;

  v_currency := public.normalize_wallet_currency(ch.currency);

  if coalesce(ch.buy_in_amount, 0) > 0 then
    perform public.wallet_debit(auth.uid(), v_currency, ch.buy_in_amount);
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + ch.buy_in_amount
      where id = p_challenge_id;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, status)
  values (p_challenge_id, auth.uid(), 'joined')
  returning * into participant;

  return participant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payouts credit the challenge currency (settle still inserts payout rows)
-- ---------------------------------------------------------------------------

create or replace function public.trg_credit_challenge_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
begin
  select public.normalize_wallet_currency(currency) into v_currency
  from public.challenges
  where id = new.challenge_id;
  perform public.wallet_credit(new.user_id, v_currency, new.amount);
  return new;
end;
$$;

drop trigger if exists challenge_payouts_credit_wallet on public.challenge_payouts;
create trigger challenge_payouts_credit_wallet
  after insert on public.challenge_payouts
  for each row execute function public.trg_credit_challenge_payout();

-- Neutralize the old settle_challenge credits += amount so we do not double-pay Coins.
-- New payouts are credited only by the trigger above (correct currency).
create or replace function public.trg_skip_legacy_settle_credit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.credits is distinct from old.credits
     and new.coins is not distinct from old.coins
     and new.bucks is not distinct from old.bucks then
    -- A legacy settle_challenge write to credits only. Do not let it change coins.
    new.credits := new.coins;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_legacy_credit_payout on public.profiles;
create trigger profiles_block_legacy_credit_payout
  before update of credits on public.profiles
  for each row execute function public.trg_skip_legacy_settle_credit();

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------

alter table public.coin_transfers
  add column if not exists currency text;

update public.coin_transfers
  set currency = coalesce(nullif(currency, ''), 'coins');

alter table public.coin_transfers
  alter column currency set default 'coins';

do $$
begin
  alter table public.coin_transfers
    alter column currency set not null;
exception when others then
  null;
end $$;

alter table public.coin_transfers drop constraint if exists coin_transfers_currency_known;
alter table public.coin_transfers add constraint coin_transfers_currency_known
  check (currency in ('coins', 'bucks'));

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
  v_noun text;
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
  v_noun := case when v_currency = 'bucks' then 'Bucks' else 'Coins' end;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Send at least 0.01' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a transfer at 10,000 or less' using errcode = 'P0001';
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

  perform public.wallet_debit(v_sender, v_currency, v_amount);
  perform public.wallet_credit(p_recipient_id, v_currency, v_amount);

  insert into public.coin_transfers (sender_id, recipient_id, amount, currency)
  values (v_sender, p_recipient_id, v_amount, v_currency)
  returning * into v_transfer;

  return v_transfer;
end;
$$;

create or replace function public.transfer_coins(p_recipient_id uuid, p_amount numeric)
returns public.coin_transfers
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.transfer_funds(p_recipient_id, p_amount, 'coins');
end;
$$;

grant execute on function public.transfer_funds(uuid, numeric, text) to authenticated;
grant execute on function public.transfer_coins(uuid, numeric) to authenticated;

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
begin
  v_name := public.profile_display_name(new.sender_id);
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  v_noun := case when public.normalize_wallet_currency(new.currency) = 'bucks' then 'Bucks' else 'Coins' end;
  perform public.notify_user(
    new.recipient_id,
    new.sender_id,
    'coins_received',
    'You received ' || v_noun,
    v_name || ' sent you ' || v_amount || ' ' || v_noun || '.',
    jsonb_build_object('amount', new.amount, 'transfer_id', new.id, 'currency', coalesce(new.currency, 'coins'))
  );
  return new;
exception when others then
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Call-outs
-- ---------------------------------------------------------------------------

create table if not exists public.callouts (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete restrict,
  opponent_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null default 'coins' check (currency in ('coins', 'bucks')),
  stake_amount numeric(12,2) not null,
  win_condition text not null,
  deadline timestamptz not null,
  status text not null default 'pending' check (status in (
    'pending', 'active', 'resolving', 'settled', 'disputed', 'cancelled'
  )),
  held boolean not null default false,
  challenger_pick uuid references public.profiles(id),
  opponent_pick uuid references public.profiles(id),
  winner_id uuid references public.profiles(id),
  challenger_cancel_at timestamptz,
  opponent_cancel_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint callout_not_self check (challenger_id <> opponent_id),
  constraint callout_stake_positive check (stake_amount > 0)
);

comment on table public.callouts is '1-on-1 call-outs. Stakes are held on accept and released only when both agree on a winner or both cancel.';

create index if not exists callouts_challenger_id_idx on public.callouts (challenger_id, created_at desc);
create index if not exists callouts_opponent_id_idx on public.callouts (opponent_id, created_at desc);

alter table public.callouts enable row level security;

drop policy if exists "Users read own callouts" on public.callouts;
create policy "Users read own callouts"
  on public.callouts for select
  to authenticated
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);

grant select on public.callouts to authenticated;

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_amount numeric,
  p_currency text,
  p_win_condition text,
  p_deadline timestamptz
)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_amount numeric(12,2);
  v_currency text;
  v_row public.callouts%rowtype;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_opponent_id is null or p_opponent_id = v_me then
    raise exception 'Pick someone else to call out' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;
  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Stake at least 0.01' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a stake at 10,000 or less' using errcode = 'P0001';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Set a deadline in the future' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_win_condition, ''))) < 3 then
    raise exception 'Say what a win looks like' using errcode = 'P0001';
  end if;

  insert into public.callouts (
    challenger_id, opponent_id, currency, stake_amount, win_condition, deadline, status
  ) values (
    v_me, p_opponent_id, v_currency, v_amount, btrim(p_win_condition), p_deadline, 'pending'
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.accept_callout(p_callout_id uuid)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
  v_first uuid;
  v_second uuid;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_row.opponent_id is distinct from v_me then
    raise exception 'Only the person who was called out can accept' using errcode = '42501';
  end if;
  if v_row.status is distinct from 'pending' then
    raise exception 'This call-out is no longer waiting for an accept' using errcode = 'P0001';
  end if;
  if v_row.deadline <= now() then
    raise exception 'This call-out expired' using errcode = 'P0001';
  end if;

  if v_row.challenger_id < v_row.opponent_id then
    v_first := v_row.challenger_id;
    v_second := v_row.opponent_id;
  else
    v_first := v_row.opponent_id;
    v_second := v_row.challenger_id;
  end if;
  perform 1 from public.profiles where id = v_first for update;
  perform 1 from public.profiles where id = v_second for update;

  perform public.wallet_debit(v_row.challenger_id, v_row.currency, v_row.stake_amount);
  perform public.wallet_debit(v_row.opponent_id, v_row.currency, v_row.stake_amount);

  update public.callouts
    set status = 'active',
        held = true,
        updated_at = now()
    where id = p_callout_id
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.decline_callout(p_callout_id uuid)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_me not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Not your call-out' using errcode = '42501';
  end if;
  if v_row.status is distinct from 'pending' then
    raise exception 'This call-out can only be declined before it is accepted' using errcode = 'P0001';
  end if;
  update public.callouts
    set status = 'cancelled', updated_at = now()
    where id = p_callout_id
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.submit_callout_result(p_callout_id uuid, p_winner_id uuid)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
  v_my_pick uuid;
  v_their_pick uuid;
  v_prize numeric(12,2);
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_me not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Not your call-out' using errcode = '42501';
  end if;
  if v_row.status not in ('active', 'resolving', 'disputed') then
    raise exception 'This call-out is not open for a result' using errcode = 'P0001';
  end if;
  if p_winner_id is null or p_winner_id not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Pick one of the two people in this call-out' using errcode = 'P0001';
  end if;

  if v_me = v_row.challenger_id then
    v_row.challenger_pick := p_winner_id;
  else
    v_row.opponent_pick := p_winner_id;
  end if;

  v_my_pick := case when v_me = v_row.challenger_id then v_row.challenger_pick else v_row.opponent_pick end;
  v_their_pick := case when v_me = v_row.challenger_id then v_row.opponent_pick else v_row.challenger_pick end;

  if v_their_pick is null then
    update public.callouts
      set challenger_pick = v_row.challenger_pick,
          opponent_pick = v_row.opponent_pick,
          status = 'resolving',
          updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    return v_row;
  end if;

  if v_my_pick = v_their_pick then
    v_prize := round(v_row.stake_amount * 2, 2);
    perform public.wallet_credit(v_my_pick, v_row.currency, v_prize);
    update public.callouts
      set challenger_pick = v_row.challenger_pick,
          opponent_pick = v_row.opponent_pick,
          winner_id = v_my_pick,
          held = false,
          status = 'settled',
          updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    return v_row;
  end if;

  update public.callouts
    set challenger_pick = v_row.challenger_pick,
        opponent_pick = v_row.opponent_pick,
        status = 'disputed',
        updated_at = now()
    where id = p_callout_id
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.cancel_callout(p_callout_id uuid)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
  v_both boolean;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_me not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Not your call-out' using errcode = '42501';
  end if;
  if v_row.status = 'settled' then
    raise exception 'This call-out is already settled' using errcode = 'P0001';
  end if;
  if v_row.status = 'cancelled' then
    return v_row;
  end if;

  if v_row.status = 'pending' then
    update public.callouts
      set status = 'cancelled', updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    return v_row;
  end if;

  if v_me = v_row.challenger_id then
    v_row.challenger_cancel_at := coalesce(v_row.challenger_cancel_at, now());
  else
    v_row.opponent_cancel_at := coalesce(v_row.opponent_cancel_at, now());
  end if;

  v_both := v_row.challenger_cancel_at is not null and v_row.opponent_cancel_at is not null;

  if v_both and v_row.held then
    perform public.wallet_credit(v_row.challenger_id, v_row.currency, v_row.stake_amount);
    perform public.wallet_credit(v_row.opponent_id, v_row.currency, v_row.stake_amount);
    v_row.held := false;
    v_row.status := 'cancelled';
  elsif v_both then
    v_row.status := 'cancelled';
  end if;

  update public.callouts
    set challenger_cancel_at = v_row.challenger_cancel_at,
        opponent_cancel_at = v_row.opponent_cancel_at,
        held = v_row.held,
        status = v_row.status,
        updated_at = now()
    where id = p_callout_id
    returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.accept_callout(uuid) to authenticated;
grant execute on function public.decline_callout(uuid) to authenticated;
grant execute on function public.submit_callout_result(uuid, uuid) to authenticated;
grant execute on function public.cancel_callout(uuid) to authenticated;

-- Notifications for call-outs (never fail the money path)
create or replace function public.trg_notify_callout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_noun text;
  v_amount text;
begin
  v_noun := case when new.currency = 'bucks' then 'Bucks' else 'Coins' end;
  v_amount := to_char(new.stake_amount, 'FM999999990.00');

  if tg_op = 'INSERT' then
    v_name := public.profile_display_name(new.challenger_id);
    perform public.notify_user(
      new.opponent_id, new.challenger_id, 'callout_received',
      'You’ve been called out',
      v_name || ' challenged you for ' || v_amount || ' ' || v_noun || '.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency)
    );
    return new;
  end if;

  if old.status = 'pending' and new.status = 'active' then
    v_name := public.profile_display_name(new.opponent_id);
    perform public.notify_user(
      new.challenger_id, new.opponent_id, 'callout_accepted',
      'Call-out accepted',
      v_name || ' accepted. Stakes are held.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency)
    );
  elsif old.status is distinct from new.status and new.status = 'settled' then
    perform public.notify_user(
      new.challenger_id, new.winner_id, 'callout_resolved',
      'Call-out settled',
      'You both agreed. The prize was released.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency)
    );
    perform public.notify_user(
      new.opponent_id, new.winner_id, 'callout_resolved',
      'Call-out settled',
      'You both agreed. The prize was released.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency)
    );
  elsif old.status is distinct from new.status and new.status = 'disputed' then
    perform public.notify_user(
      new.challenger_id, new.opponent_id, 'callout_disputed',
      'Call-out disputed',
      'You picked different winners. Cancel together to refund the stakes.',
      jsonb_build_object('callout_id', new.id)
    );
    perform public.notify_user(
      new.opponent_id, new.challenger_id, 'callout_disputed',
      'Call-out disputed',
      'You picked different winners. Cancel together to refund the stakes.',
      jsonb_build_object('callout_id', new.id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists callouts_notify on public.callouts;
create trigger callouts_notify
  after insert or update of status on public.callouts
  for each row execute function public.trg_notify_callout();

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
  alter table public.notifications add constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'challenge_joined',
    'follow',
    'coins_received',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated',
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled'
  ));
exception when others then
  null;
end $$;
