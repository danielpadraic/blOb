-- Host / Official gates on destructive challenge RPCs.
--
-- eliminate_participant was SECURITY DEFINER, granted to authenticated, and never
-- checked auth.uid(). Any signed-in caller could eliminate any participant; the
-- entry fee stayed in the pot.
--
-- Sibling DEFINers that start, cancel, close, or pay a challenge get the same
-- class of gate. Money math is not rewritten: distribute_challenge is wrapped
-- around the live body. refund_pre_start already allows host or self; Official
-- is added. It stays service_role-only (advisor pass revoked authenticated).
--
-- Apply by pasting this file in Supabase SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.

-- ---------------------------------------------------------------------------
-- Shared: host of this challenge, or Official viewer. Not a random participant.
-- ---------------------------------------------------------------------------

create or replace function public.assert_challenge_host_or_official(p_challenge_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select created_by into v_created_by
  from public.challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if v_created_by is not distinct from auth.uid() then
    return;
  end if;

  if public.is_official_viewer() then
    return;
  end if;

  raise exception 'NOT_HOST';
end;
$$;

revoke all on function public.assert_challenge_host_or_official(uuid) from anon, public;
grant execute on function public.assert_challenge_host_or_official(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- eliminate_participant — existing body + host/Official after lock. No self.
-- ---------------------------------------------------------------------------

create or replace function public.eliminate_participant(p_challenge_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_c.created_by is distinct from auth.uid()
     and not coalesce(public.is_official_viewer(), false) then
    raise exception 'NOT_HOST';
  end if;

  select * into v_p from challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;

  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_p.eliminated_at is not null then
    return jsonb_build_object('ok', true, 'already_eliminated', true);
  end if;

  update challenge_participants
  set eliminated_at = now(), status = 'eliminated'
  where challenge_id = p_challenge_id and user_id = p_user_id;

  insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
  values (
    p_user_id, p_challenge_id, v_p.currency, 0, 'eliminate_forfeit', 'eliminate_forfeit',
    jsonb_build_object('buy_in_remains_in_pot', v_p.buy_in_paid), 'challenge', p_challenge_id::text
  );

  return jsonb_build_object('ok', true, 'prize_pool_unchanged', true);
end;
$$;

revoke execute on function public.eliminate_participant(uuid, uuid) from anon, public;
grant execute on function public.eliminate_participant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_challenge_started — host or Official. Same start math.
-- ---------------------------------------------------------------------------

create or replace function public.mark_challenge_started(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.created_by is distinct from v_uid
     and not coalesce(public.is_official_viewer(), false) then
    raise exception 'NOT_HOST';
  end if;

  if v_c.official_started_at is not null then
    return jsonb_build_object('ok', true, 'already_started', true, 'official_started_at', v_c.official_started_at);
  end if;

  update challenges
  set official_started_at = now(), status = 'in_progress', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'official_started_at', now());
end;
$$;

revoke execute on function public.mark_challenge_started(uuid) from anon, public;
grant execute on function public.mark_challenge_started(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- refund_pre_start — host, Official, or self. No money-math change.
-- Authenticated stays revoked (advisor pass); service_role only.
-- ---------------------------------------------------------------------------

create or replace function public.refund_pre_start(p_challenge_id uuid, p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.official_started_at is not null then
    raise exception 'NO_REFUND_AFTER_START';
  end if;

  if p_user_id is distinct from v_uid
     and v_c.created_by is distinct from v_uid
     and not coalesce(public.is_official_viewer(), false) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_p from challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;

  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_p.status = 'refunded_pre_start' then
    return jsonb_build_object('ok', true, 'already_refunded', true);
  end if;

  if v_p.buy_in_paid > 0 then
    if v_p.currency = 'coins' then
      update profiles set coins = coins + v_p.buy_in_paid where id = p_user_id;
    else
      update profiles set bucks = bucks + v_p.buy_in_paid where id = p_user_id;
    end if;
    update challenges set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0) where id = p_challenge_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      p_user_id, p_challenge_id, v_p.currency, v_p.buy_in_paid, 'refund_pre_start', 'refund_pre_start',
      '{}'::jsonb, 'challenge', p_challenge_id::text
    );
  end if;

  update challenge_participants
  set status = 'refunded_pre_start'
  where challenge_id = p_challenge_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'refunded', v_p.buy_in_paid);
end;
$$;

revoke execute on function public.refund_pre_start(uuid, uuid) from anon, authenticated, public;
grant execute on function public.refund_pre_start(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- cancel_challenge wrapper — lock + host/Official, then existing callout/core.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  if p_challenge_id is null then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_c.created_by is distinct from auth.uid()
     and not coalesce(public.is_official_viewer(), false) then
    raise exception 'NOT_HOST';
  end if;

  if coalesce(v_c.is_callout, false) then
    perform public.close_callout_challenge(p_challenge_id, 'cancelled');
    return jsonb_build_object('ok', true, 'callout', true, 'refunded', false);
  end if;

  return public.cancel_challenge_core(p_challenge_id);
end;
$$;

revoke execute on function public.cancel_challenge(uuid) from anon, public;
grant execute on function public.cancel_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- distribute_challenge — wrap live body. Do not copy payout math.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'distribute_challenge'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'distribute_challenge_impl'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) then
    alter function public.distribute_challenge(uuid) rename to distribute_challenge_impl;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'distribute_challenge_impl'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) then
    raise exception 'distribute_challenge_impl missing — live distribute_challenge(uuid) must exist first';
  end if;
end $$;

create or replace function public.distribute_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform public.assert_challenge_host_or_official(p_challenge_id);
  return public.distribute_challenge_impl(p_challenge_id);
end;
$$;

revoke execute on function public.distribute_challenge_impl(uuid) from anon, authenticated, public;
grant execute on function public.distribute_challenge_impl(uuid) to service_role;
revoke execute on function public.distribute_challenge(uuid) from anon, public;
grant execute on function public.distribute_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Close for judging — host or Official. Live client tries ensure_ then close_
-- then mark_challenge_judging. judging_started_at is not a table column.
-- ---------------------------------------------------------------------------

create or replace function public.mark_challenge_judging(p_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if ch.created_by is distinct from v_uid
     and not coalesce(public.is_official_viewer(), false) then
    raise exception 'NOT_HOST';
  end if;

  if ch.status in ('settled', 'judging') then
    return ch;
  end if;

  update public.challenges
    set status = 'judging'
    where id = ch.id
    returning * into ch;

  return ch;
end;
$$;

revoke execute on function public.mark_challenge_judging(uuid) from anon, public;
grant execute on function public.mark_challenge_judging(uuid) to authenticated;

drop function if exists public.ensure_challenge_judging(uuid);
create function public.ensure_challenge_judging(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform public.assert_challenge_host_or_official(p_challenge_id);
  select * into ch from public.mark_challenge_judging(p_challenge_id);
  return jsonb_build_object(
    'ok', true,
    'challenge_id', ch.id,
    'status', ch.status,
    'judging_started_at', v_at,
    'distributable_at', v_at + interval '1 hour'
  );
end;
$$;

drop function if exists public.close_challenge_for_judging(uuid);
create function public.close_challenge_for_judging(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ensure_challenge_judging(p_challenge_id);
end;
$$;

revoke execute on function public.ensure_challenge_judging(uuid) from anon, public;
grant execute on function public.ensure_challenge_judging(uuid) to authenticated;
revoke execute on function public.close_challenge_for_judging(uuid) from anon, public;
grant execute on function public.close_challenge_for_judging(uuid) to authenticated;

notify pgrst, 'reload schema';
