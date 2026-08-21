-- Cancel refunds must write wallet_ledger columns that exist.
-- Never insert ref_type (42703). Official / admin / @blob may delete after start.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.wallet_ledger
  add column if not exists entry_type text,
  add column if not exists reason text default '',
  add column if not exists challenge_id uuid,
  add column if not exists reference_id uuid,
  add column if not exists metadata jsonb default '{}'::jsonb;

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_official boolean := false;
  v_others int := 0;
  v_p record;
  v_host_amt numeric := 0;
  v_refunded uuid[] := '{}';
  v_host_coin_back boolean := false;
  v_notified_host boolean := false;
  v_body text;
  v_paid boolean;
  v_cur text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_c.status = 'settled' then
    raise exception 'ALREADY_SETTLED';
  end if;

  if v_c.status in ('cancelled', 'cancelled_underfilled') then
    raise exception 'ALREADY_CANCELLED';
  end if;

  select
    coalesce(is_official, false)
    or coalesce(is_admin, false)
    or lower(coalesce(username, '')) = 'blob'
  into v_official
  from public.profiles
  where id = v_uid;

  if not v_official then
    if v_c.created_by is distinct from v_uid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_c.starts_at is null or v_c.starts_at <= now() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select count(*) into v_others
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id is distinct from v_c.created_by
      and coalesce(status, 'joined') is distinct from 'refunded_pre_start';
    if coalesce(v_others, 0) > 0 then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  for v_p in
    select *
    from public.challenge_participants
    where challenge_id = p_challenge_id
    for update
  loop
    v_cur := coalesce(v_p.currency, v_c.currency, 'coins');
    if coalesce(v_p.buy_in_paid, 0) > 0
       and coalesce(v_p.status, 'joined') is distinct from 'refunded_pre_start'
       and (v_cur = 'coins' or v_c.is_official) then
      if v_cur = 'bucks' then
        update public.profiles
        set bucks = bucks + v_p.buy_in_paid
        where id = v_p.user_id;
      else
        update public.profiles
        set coins = coins + v_p.buy_in_paid
        where id = v_p.user_id;
      end if;
      update public.challenges
      set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0)
      where id = p_challenge_id;
      insert into public.wallet_ledger (
        user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
      ) values (
        v_p.user_id, p_challenge_id, v_cur, v_p.buy_in_paid,
        'challenge_cancel_refund', 'challenge_cancel_refund',
        jsonb_build_object('kind', 'buy_in'),
        p_challenge_id
      );
      v_refunded := array_append(v_refunded, v_p.user_id);
      if v_p.user_id = v_c.created_by then
        v_host_coin_back := true;
      end if;
    end if;
  end loop;

  select * into v_c from public.challenges where id = p_challenge_id;
  v_host_amt := greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0);
  v_host_amt := least(v_host_amt, greatest(coalesce(v_c.prize_pool, 0), 0));
  if v_host_amt > 0 and v_c.created_by is not null then
    if coalesce(v_c.currency, 'coins') = 'coins' then
      update public.profiles set coins = coins + v_host_amt where id = v_c.created_by;
      v_host_coin_back := true;
    else
      update public.profiles set bucks = bucks + v_host_amt where id = v_c.created_by;
    end if;
    update public.challenges
    set prize_pool = greatest(prize_pool - v_host_amt, 0)
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_c.created_by, p_challenge_id, coalesce(v_c.currency, 'coins'), v_host_amt,
      'challenge_cancel_refund', 'challenge_cancel_host_release',
      jsonb_build_object('kind', 'host_escrow'),
      p_challenge_id
    );
  end if;

  update public.challenges
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_uid,
    updated_at = now()
  where id = p_challenge_id;

  for v_p in
    select *
    from public.challenge_participants
    where challenge_id = p_challenge_id
  loop
    v_paid := v_p.user_id = any (v_refunded)
      or (v_p.user_id = v_c.created_by and v_host_coin_back);
    v_body := 'This challenge was cancelled.';
    if v_paid then
      v_body := v_body || ' Your coins were returned.';
    end if;
    perform public.notify_user(
      v_p.user_id,
      v_uid,
      'challenge_cancelled',
      v_c.title,
      v_body,
      jsonb_build_object('challenge_id', p_challenge_id, 'refunded', v_paid)
    );
    if v_p.user_id = v_c.created_by then
      v_notified_host := true;
    end if;
  end loop;

  if v_official
     and v_c.created_by is not null
     and v_c.created_by is distinct from v_uid
     and not v_notified_host then
    v_body := 'This challenge was cancelled.';
    if v_host_coin_back then
      v_body := v_body || ' Your coins were returned.';
    end if;
    perform public.notify_user(
      v_c.created_by,
      v_uid,
      'challenge_cancelled',
      v_c.title,
      v_body,
      jsonb_build_object('challenge_id', p_challenge_id, 'refunded', v_host_coin_back)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_challenge(uuid) to authenticated;
