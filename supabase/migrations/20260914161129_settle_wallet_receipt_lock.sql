-- Settlement + wallet receipt lock.
-- Pay only after the saved calendar length (duration_days / length_value) and the
-- stamped ends_at — whichever is later — plus the 2-hour proof-review window.
-- days_required defaults to 6 (check-in target). Never treat that as the pot length.
-- Do not rewrite settled rows. Do not enable player-pool. Do not take a platform
-- percent from Official guarantee entries. Stripe Connect stays the card rail.
-- Apply in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.

-- ---------------------------------------------------------------------------
-- Persist the host-saved calendar length. Backfill from length_value only.
-- ---------------------------------------------------------------------------

alter table public.challenges
  add column if not exists duration_days int;

comment on column public.challenges.duration_days is
  'Host-saved calendar length. 30-Day stays 30. Never invent 6 from days_required.';

update public.challenges
set duration_days = case
  when lower(coalesce(length_unit, '')) like 'week%' then greatest(length_value, 0) * 7
  when lower(coalesce(length_unit, '')) like 'month%' then greatest(length_value, 0) * 30
  else greatest(length_value, 0)
end
where duration_days is null
  and length_value is not null
  and length_value > 0
  and distributed_at is null
  and status is distinct from 'settled';

create or replace function public.settlement_saved_duration_days(ch public.challenges)
returns int
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(
    coalesce((ch).duration_days, 0),
    coalesce(
      case
        when lower(coalesce((ch).length_unit, '')) like 'week%' then coalesce((ch).length_value, 0) * 7
        when lower(coalesce((ch).length_unit, '')) like 'month%' then coalesce((ch).length_value, 0) * 30
        else coalesce((ch).length_value, 0)
      end,
      0
    ),
    0
  );
$$;

create or replace function public.settlement_effective_ends_at(ch public.challenges)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce((ch).is_unlimited, false) then null
    when (ch).starts_at is not null
      and public.settlement_saved_duration_days(ch) > 0
      and (ch).ends_at is not null then
      greatest((ch).ends_at, (ch).starts_at + (public.settlement_saved_duration_days(ch) * interval '1 day'))
    when (ch).starts_at is not null and public.settlement_saved_duration_days(ch) > 0 then
      (ch).starts_at + (public.settlement_saved_duration_days(ch) * interval '1 day')
    else (ch).ends_at
  end;
$$;

create or replace function public.settlement_review_window()
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$
  select interval '2 hours';
$$;

create or replace function public.settlement_receipt_title(ch public.challenges)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(v) in ('this challenge', 'wallet') then 'Challenge prize'
    else v
  end
  from (
    select coalesce(
      nullif(btrim(coalesce((ch).title, '')), ''),
      nullif(btrim(coalesce((ch).task, '')), ''),
      'Challenge prize'
    ) as v
  ) s;
$$;

-- Board may flip Ended after the real end. Wallet still waits for the review window.
create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.challenges
    set status = 'in_progress'
    where status in ('upcoming', 'open')
      and now() >= starts_at
      and (
        public.settlement_effective_ends_at(challenges) is null
        or now() < public.settlement_effective_ends_at(challenges)
      );

  update public.challenges
    set status = 'ended'
    where status in ('in_progress', 'live')
      and not coalesce(is_unlimited, false)
      and public.settlement_clock_ended(challenges)
      and distributed_at is null
      and status is distinct from 'settled';

  perform public.sync_unlimited_eliminations();
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated, service_role;

create or replace function public.tick_settlements()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec record;
  v_c public.challenges%rowtype;
  v_ready timestamptz;
  v_end timestamptz;
begin
  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and not coalesce(c.is_callout, false)
      and c.status in ('upcoming', 'open')
      and public.settlement_effective_ends_at(c) is not null
      and now() >= public.settlement_effective_ends_at(c)
      and c.official_started_at is null
    for update skip locked
  loop
    begin
      update public.challenges
      set status = 'cancelled_underfilled', updated_at = now()
      where id = rec.id
        and status in ('upcoming', 'open')
        and distributed_at is null
        and official_started_at is null;
      perform public.refund_challenge_underfilled(rec.id);
    exception
      when others then
        raise log 'underfilled skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;

  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and not coalesce(c.is_callout, false)
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and not coalesce(c.is_unlimited, false)
      and public.settlement_clock_ended(c)
    for update skip locked
  loop
    select * into v_c from public.challenges where id = rec.id;
    if not found then
      continue;
    end if;
    if coalesce(v_c.is_callout, false) then
      continue;
    end if;
    if v_c.status = 'settled' or v_c.distributed_at is not null then
      continue;
    end if;
    if v_c.status in ('live', 'in_progress') then
      update public.challenges
      set status = 'ended', updated_at = now()
      where id = rec.id
        and status in ('live', 'in_progress')
        and distributed_at is null;
    end if;
    if not public.settlement_should_run(v_c) then
      v_ready := public.settlement_review_ready_at(v_c);
      v_end := public.settlement_effective_ends_at(v_c);
      raise log 'settlement skip review_window challenge_id=% ends_at=% ready_at=% now=%',
        rec.id, v_end, v_ready, now();
      continue;
    end if;
    begin
      update public.challenges
      set status = 'settling', updated_at = now()
      where id = rec.id and status is distinct from 'settled';
      perform public.settle_ended_challenge(rec.id);
    exception
      when others then
        raise log 'settlement skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;
end;
$$;

revoke all on function public.tick_settlements() from public, anon, authenticated;
grant execute on function public.tick_settlements() to service_role;
revoke all on function public.settle_ended_challenge(uuid) from public, anon, authenticated;
grant execute on function public.settle_ended_challenge(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Settle notify: in-app + push. Fail-soft if the token is missing (web = bell).
-- Deep link Overview of THAT challenge. Kind facts. Never "this challenge".
-- ---------------------------------------------------------------------------

create or replace function public.notify_challenge_refund(
  p_challenge_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_currency text default 'coins'::text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_href text;
  v_copy text;
  v_ch public.challenges%rowtype;
begin
  if p_user_id is null or p_challenge_id is null then
    return;
  end if;
  select * into v_ch from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  v_title := public.settlement_receipt_title(v_ch);
  v_href := '/challenges/' || p_challenge_id::text || '?tab=overview';
  v_copy := v_title || ' Refund. '
    || public.settlement_wallet_amount_label(coalesce(p_amount, 0), coalesce(p_currency, v_ch.currency, 'coins'))
    || ' is in your wallet.';
  begin
    perform public.notify_user(
      p_user_id,
      v_ch.created_by,
      'challenge_settled',
      v_copy,
      null,
      jsonb_build_object(
        'type', 'challenge_settled',
        'challengeId', p_challenge_id,
        'challenge_id', p_challenge_id,
        'challenge_title', v_title,
        'refund', true,
        'href', v_href,
        'url', v_href,
        'tab', 'overview',
        'dedupe_key', 'refund:' || p_challenge_id || ':' || p_user_id
      )
    );
  exception when others then
    raise log 'settle refund notify skip user=% challenge=% sqlerrm=%',
      p_user_id, p_challenge_id, sqlerrm;
  end;
end;
$$;

revoke all on function public.notify_challenge_refund(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.notify_challenge_refund(uuid, uuid, numeric, text) to service_role;

create or replace function public.notify_challenge_settled(
  p_challenge_id uuid,
  p_title text,
  p_kind text,
  p_post_id uuid,
  p_currency text default 'coins'::text,
  p_void_copy text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec record;
  win record;
  v_copy text;
  v_host uuid;
  v_href text;
  v_first_name text;
  v_title text;
  v_ch public.challenges%rowtype;
begin
  select * into v_ch from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  v_host := v_ch.created_by;
  v_title := coalesce(
    nullif(btrim(p_title), ''),
    public.settlement_receipt_title(v_ch)
  );
  if lower(v_title) in ('this challenge', 'wallet') then
    v_title := public.settlement_receipt_title(v_ch);
  end if;
  v_href := '/challenges/' || p_challenge_id::text || '?tab=overview';

  if p_kind = 'refund' then
    for rec in
      select user_id, amount, currency
      from public.wallet_ledger
      where challenge_id = p_challenge_id
        and (
          entry_type in ('refund_pre_start', 'leave_refund', 'challenge_cancel_refund', 'refund_buyin')
          or coalesce(reason, '') ilike '%refund%'
        )
    loop
      begin
        perform public.notify_challenge_refund(p_challenge_id, rec.user_id, rec.amount, rec.currency);
      exception when others then
        raise log 'settle refund notify skip user=% challenge=%', rec.user_id, p_challenge_id;
      end;
    end loop;
    return;
  end if;

  if p_kind = 'void' then
    v_copy := v_title || ' settled. ' || coalesce(
      nullif(btrim(p_void_copy), ''),
      'Nobody finished.'
    );
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      begin
        perform public.notify_user(
          rec.user_id,
          v_host,
          'challenge_settled',
          v_copy,
          null,
          jsonb_build_object(
            'type', 'challenge_settled',
            'challengeId', p_challenge_id,
            'challenge_id', p_challenge_id,
            'challenge_title', v_title,
            'void', true,
            'href', v_href,
            'url', v_href,
            'tab', 'overview',
            'dedupe_key', 'settle:' || p_challenge_id
          )
        );
      exception when others then
        raise log 'settle notify skip user=% challenge=%', rec.user_id, p_challenge_id;
      end;
    end loop;
    return;
  end if;

  if p_kind = 'forfeit' then
    v_copy := v_title || ' settled. Nobody remaining. Prize forfeited.';
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      begin
        perform public.notify_user(
          rec.user_id,
          v_host,
          'challenge_settled',
          v_copy,
          null,
          jsonb_build_object(
            'type', 'challenge_settled',
            'challengeId', p_challenge_id,
            'challenge_id', p_challenge_id,
            'challenge_title', v_title,
            'forfeit', true,
            'href', v_href,
            'url', v_href,
            'tab', 'overview',
            'dedupe_key', 'settle:' || p_challenge_id
          )
        );
      exception when others then
        raise log 'settle notify skip user=% challenge=%', rec.user_id, p_challenge_id;
      end;
    end loop;
    return;
  end if;

  select public.profile_display_name(user_id) into v_first_name
  from public.challenge_payouts
  where challenge_id = p_challenge_id
  order by amount desc, user_id
  limit 1;

  for win in
    select user_id, amount from public.challenge_payouts where challenge_id = p_challenge_id
  loop
    if coalesce(win.amount, 0) <= 0 then
      v_copy := v_title || ' settled. Your share was '
        || public.settlement_wallet_amount_label(0, p_currency) || '.';
    else
      v_copy := v_title || ' settled. '
        || public.settlement_wallet_amount_label(win.amount, p_currency)
        || ' is in your wallet.';
    end if;
    begin
      perform public.notify_user(
        win.user_id,
        v_host,
        'payout_received',
        v_copy,
        null,
        jsonb_build_object(
          'type', 'payout_received',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'challenge_title', v_title,
          'amount', win.amount,
          'href', v_href,
          'url', v_href,
          'tab', 'overview',
          'dedupe_key', 'payout:' || p_challenge_id || ':' || win.user_id
        )
      );
    exception when others then
      raise log 'settle payout notify skip user=% challenge=%', win.user_id, p_challenge_id;
    end;
  end loop;

  for rec in
    select p.user_id
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn')
      and not exists (
        select 1 from public.challenge_payouts w
        where w.challenge_id = p_challenge_id and w.user_id = p.user_id
      )
  loop
    v_copy := v_title || ' settled. ' || coalesce(nullif(btrim(v_first_name), ''), 'Someone') || ' took it.';
    begin
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        v_copy,
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'challenge_title', v_title,
          'href', v_href,
          'url', v_href,
          'tab', 'overview',
          'dedupe_key', 'settle:' || p_challenge_id
        )
      );
    exception when others then
      raise log 'settle notify skip user=% challenge=%', rec.user_id, p_challenge_id;
    end;
  end loop;
end;
$$;

revoke all on function public.notify_challenge_settled(uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.notify_challenge_settled(uuid, text, text, uuid, text, text) to authenticated, service_role;

-- Pre-start refund notify (wallet already moved). Fail-soft.
create or replace function public.refund_pre_start(p_challenge_id uuid, p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.official_started_at is not null then
    raise exception 'NO_REFUND_AFTER_START';
  end if;

  if p_user_id is distinct from v_uid
     and v_c.created_by is distinct from v_uid
     and not coalesce(public.is_official_viewer(), false) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_p from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;

  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_p.status = 'refunded_pre_start' then
    return jsonb_build_object('ok', true, 'already_refunded', true);
  end if;

  if v_p.buy_in_paid > 0 then
    if v_p.currency = 'coins' then
      update public.profiles set coins = coins + v_p.buy_in_paid where id = p_user_id;
    else
      update public.profiles set bucks = bucks + v_p.buy_in_paid where id = p_user_id;
    end if;
    update public.challenges set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0) where id = p_challenge_id;
    insert into public.wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      p_user_id, p_challenge_id, v_p.currency, v_p.buy_in_paid, 'refund_pre_start', 'refund_pre_start',
      '{}'::jsonb, 'challenge', p_challenge_id::text
    );
    begin
      perform public.notify_challenge_refund(p_challenge_id, p_user_id, v_p.buy_in_paid, v_p.currency);
    exception when others then
      null;
    end;
  end if;

  update public.challenge_participants
  set status = 'refunded_pre_start'
  where challenge_id = p_challenge_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'refunded', v_p.buy_in_paid);
end;
$$;

revoke execute on function public.refund_pre_start(uuid, uuid) from anon, authenticated, public;
grant execute on function public.refund_pre_start(uuid, uuid) to service_role;

create or replace function public.refund_challenge_underfilled(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_p record;
  v_host numeric;
begin
  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    return;
  end if;

  for v_p in
    select * from public.challenge_participants
    where challenge_id = p_challenge_id
      and status is distinct from 'refunded_pre_start'
    for update
  loop
    if v_p.buy_in_paid > 0 then
      if v_p.currency = 'coins' then
        update public.profiles set coins = coins + v_p.buy_in_paid where id = v_p.user_id;
      else
        update public.profiles set bucks = bucks + v_p.buy_in_paid where id = v_p.user_id;
      end if;
      update public.challenges
      set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0)
      where id = p_challenge_id;
      insert into public.wallet_ledger (
        user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
      ) values (
        v_p.user_id, p_challenge_id, v_p.currency, v_p.buy_in_paid,
        'refund_pre_start', 'underfill_refund',
        jsonb_build_object('reason', 'cancelled_underfilled'),
        'challenge', p_challenge_id::text
      );
      begin
        perform public.notify_challenge_refund(p_challenge_id, v_p.user_id, v_p.buy_in_paid, v_p.currency);
      exception when others then
        null;
      end;
    end if;

    update public.challenge_participants
    set status = 'refunded_pre_start'
    where id = v_p.id;
  end loop;

  select * into v_c from public.challenges where id = p_challenge_id;
  v_host := greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0);
  if v_host > 0 and v_c.created_by is not null and coalesce(v_c.prize_pool, 0) > 0 then
    v_host := least(v_host, v_c.prize_pool);
    if v_c.currency = 'coins' then
      update public.profiles set coins = coins + v_host where id = v_c.created_by;
    else
      update public.profiles set bucks = bucks + v_host where id = v_c.created_by;
    end if;
    update public.challenges set prize_pool = greatest(prize_pool - v_host, 0) where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    ) values (
      v_c.created_by, p_challenge_id, v_c.currency, v_host,
      'refund_pre_start', 'underfill_host_refund',
      jsonb_build_object('reason', 'cancelled_underfilled'),
      'challenge', p_challenge_id::text
    );
    begin
      perform public.notify_challenge_refund(p_challenge_id, v_c.created_by, v_host, v_c.currency);
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke all on function public.refund_challenge_underfilled(uuid) from public, anon;
grant execute on function public.refund_challenge_underfilled(uuid) to service_role;

notify pgrst, 'reload schema';
