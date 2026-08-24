-- Card → $ on-ramp. Stripe webhook credits the ledger. Client cannot write bucks.

alter table public.profiles
  add column if not exists last_shown_coin_balance numeric;

alter table public.profiles
  add column if not exists last_shown_bucks_balance numeric;

update public.profiles
set last_shown_coin_balance = coalesce(last_shown_coin_balance, coins);

update public.profiles
set last_shown_bucks_balance = coalesce(last_shown_bucks_balance, bucks);

comment on column public.profiles.last_shown_coin_balance is
  'PRIVATE. Last coin total shown in the header ticker.';
comment on column public.profiles.last_shown_bucks_balance is
  'PRIVATE. Last $ total shown in the header ticker.';

create or replace function public.mark_coin_balance_shown()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_coins numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.profiles
  set last_shown_coin_balance = coins
  where id = v_uid
  returning coins into v_coins;
  return coalesce(v_coins, 0);
end;
$$;

create or replace function public.mark_bucks_balance_shown()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bucks numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.profiles
  set last_shown_bucks_balance = bucks
  where id = v_uid
  returning bucks into v_bucks;
  return coalesce(v_bucks, 0);
end;
$$;

grant execute on function public.mark_coin_balance_shown() to authenticated;
grant execute on function public.mark_bucks_balance_shown() to authenticated;

create table if not exists public.wallet_top_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  charge_amount numeric not null,
  currency text not null default 'bucks',
  status text not null default 'pending',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  constraint wallet_top_ups_status_check
    check (status = any (array['pending'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])),
  constraint wallet_top_ups_currency_check
    check (currency = 'bucks'),
  constraint wallet_top_ups_amount_check
    check (amount >= 1 and amount <= 50)
);

create unique index if not exists wallet_top_ups_session_uidx
  on public.wallet_top_ups (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists wallet_top_ups_pi_uidx
  on public.wallet_top_ups (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists wallet_top_ups_user_created_idx
  on public.wallet_top_ups (user_id, created_at desc);

grant select on public.wallet_top_ups to authenticated;

alter table public.wallet_top_ups enable row level security;

drop policy if exists wallet_top_ups_select_own on public.wallet_top_ups;
create policy wallet_top_ups_select_own
  on public.wallet_top_ups
  for select
  to authenticated
  using (user_id = auth.uid());

create unique index if not exists wallet_ledger_stripe_pi_uidx
  on public.wallet_ledger ((metadata->>'stripe_payment_intent_id'))
  where metadata->>'stripe_payment_intent_id' is not null;

create or replace function public.credit_wallet_top_up(
  p_user_id uuid,
  p_amount numeric,
  p_payment_intent_id text,
  p_checkout_session_id text default null,
  p_charge_amount numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amt numeric;
  v_charge numeric;
  v_balance numeric;
  v_existing uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_id is null or coalesce(trim(p_payment_intent_id), '') = '' then
    raise exception 'INVALID_TOP_UP';
  end if;

  v_amt := round(coalesce(p_amount, 0), 2);
  v_charge := round(coalesce(p_charge_amount, v_amt), 2);
  if v_amt < 1 or v_amt > 50 then
    raise exception 'AMOUNT_LIMIT';
  end if;

  select coalesce(bucks, 0) into v_balance
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select id into v_existing
  from public.wallet_ledger
  where user_id = p_user_id
    and entry_type = 'top_up'
    and metadata->>'stripe_payment_intent_id' = p_payment_intent_id
  limit 1;

  if v_existing is not null then
    update public.wallet_top_ups
    set status = 'succeeded',
        stripe_payment_intent_id = p_payment_intent_id,
        credited_at = coalesce(credited_at, now())
    where user_id = p_user_id
      and (
        stripe_payment_intent_id = p_payment_intent_id
        or (
          p_checkout_session_id is not null
          and stripe_checkout_session_id = p_checkout_session_id
        )
      );
    return jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'balance', v_balance,
      'amount', v_amt
    );
  end if;

  update public.profiles
  set bucks = coalesce(bucks, 0) + v_amt
  where id = p_user_id
  returning bucks into v_balance;

  insert into public.wallet_ledger (
    user_id, currency, amount, entry_type, reason, balance_after, metadata
  ) values (
    p_user_id,
    'bucks',
    v_amt,
    'top_up',
    'card_top_up',
    v_balance,
    jsonb_strip_nulls(
      jsonb_build_object(
        'stripe_payment_intent_id', p_payment_intent_id,
        'stripe_checkout_session_id', p_checkout_session_id,
        'charge_amount', v_charge,
        'source', 'stripe_checkout'
      ) || coalesce(p_metadata, '{}'::jsonb)
    )
  );

  update public.wallet_top_ups
  set status = 'succeeded',
      stripe_payment_intent_id = p_payment_intent_id,
      credited_at = now()
  where user_id = p_user_id
    and (
      stripe_payment_intent_id = p_payment_intent_id
      or (
        p_checkout_session_id is not null
        and stripe_checkout_session_id = p_checkout_session_id
      )
    );

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'balance', v_balance,
    'amount', v_amt
  );
end;
$$;

revoke all on function public.credit_wallet_top_up(uuid, numeric, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.credit_wallet_top_up(uuid, numeric, text, text, numeric, jsonb) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wallet_top_ups'
  ) then
    alter publication supabase_realtime add table public.wallet_top_ups;
  end if;
end;
$$;
