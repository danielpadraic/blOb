-- Pay only after the stored ends_at plus the proof-review window.
-- Workout Group #2 paid on Aug 31 while ends_at was Sep 1. That is refused.
-- A longer saved duration can only delay payout. It cannot move it earlier.
-- Stamp the real challenge name on the wallet row. Do not rewrite settled challenges.

alter table public.wallet_ledger
  add column if not exists challenge_title text;

create or replace function public.trg_wallet_ledger_challenge_title()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  if new.challenge_id is null then
    return new;
  end if;
  if nullif(btrim(coalesce(new.challenge_title, '')), '') is not null
     and lower(btrim(new.challenge_title)) is distinct from 'this challenge'
     and lower(btrim(new.challenge_title)) is distinct from 'wallet' then
    return new;
  end if;
  select coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), ''))
    into v_title
  from public.challenges c
  where c.id = new.challenge_id;
  if v_title is not null and lower(v_title) is distinct from 'this challenge' then
    new.challenge_title := v_title;
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_ledger_fill_challenge_title on public.wallet_ledger;
create trigger wallet_ledger_fill_challenge_title
  before insert or update of challenge_id, challenge_title
  on public.wallet_ledger
  for each row execute function public.trg_wallet_ledger_challenge_title();

update public.wallet_ledger w
   set challenge_title = coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), ''))
  from public.challenges c
 where w.challenge_id = c.id
   and (
     w.challenge_title is null
     or btrim(w.challenge_title) = ''
     or lower(btrim(w.challenge_title)) in ('this challenge', 'wallet')
   )
   and coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), '')) is not null;

create or replace function public.settlement_should_run(p_challenge public.challenges)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_official_coin_challenge(p_challenge) then
    return false;
  end if;
  if p_challenge.distributed_at is not null or p_challenge.status = 'settled' then
    return false;
  end if;
  if p_challenge.status in ('cancelled', 'cancelled_underfilled', 'draft') then
    return false;
  end if;
  if coalesce(p_challenge.is_unlimited, false)
     or lower(coalesce(p_challenge.end_mode, '')) = 'indefinite_lms'
     or lower(coalesce(p_challenge.format, '')) = 'lms'
     or lower(coalesce(p_challenge.challenge_type, '')) = 'lms' then
    return false;
  end if;
  if public.settlement_is_illegal_pair(p_challenge) then
    return false;
  end if;
  -- Hard stop: never pay before the stored ends_at plus the review window.
  if p_challenge.ends_at is null
     or now() < p_challenge.ends_at + public.settlement_review_window() then
    raise log 'settlement skip before ends_at challenge_id=% ends_at=% now=%',
      p_challenge.id, p_challenge.ends_at, now();
    return false;
  end if;
  if not public.settlement_review_ready(p_challenge) then
    raise log 'settlement skip review_window challenge_id=% ready_at=% now=%',
      p_challenge.id,
      public.settlement_review_ready_at(p_challenge),
      now();
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.official_credit_payout(
  p_challenge_id uuid,
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
  v_title text;
begin
  if p_user_id is null or coalesce(p_amount, 0) <= 0 then
    return;
  end if;
  v_amount := p_amount;
  if coalesce(p_currency, 'coins') is distinct from 'bucks' then
    v_amount := ceil(greatest(v_amount, 0));
  end if;
  if p_currency = 'coins' then
    update profiles set coins = coins + v_amount where id = p_user_id;
  else
    update profiles set bucks = bucks + v_amount where id = p_user_id;
  end if;
  insert into challenge_payouts (challenge_id, user_id, amount)
  values (p_challenge_id, p_user_id, v_amount);
  select public.settlement_receipt_title(c)
    into v_title
  from public.challenges c
  where c.id = p_challenge_id;
  insert into wallet_ledger (
    user_id, challenge_id, challenge_title, currency, amount, entry_type, reason, metadata
  )
  values (
    p_user_id,
    p_challenge_id,
    v_title,
    p_currency,
    v_amount,
    'distribute_win',
    p_reason,
    '{}'::jsonb
  );
end;
$$;
