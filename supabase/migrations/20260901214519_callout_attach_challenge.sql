-- Callout Slice 2: on accept, attach a 2-person private challenge.
-- Keeps public.callouts + accept_callout wallet hold. One payout path (callout RPCs).
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.challenges
  add column if not exists is_callout boolean not null default false;

comment on column public.challenges.is_callout is
  'True when this row was attached by accept_callout. Money stays on the callout RPCs.';

alter table public.callouts
  add column if not exists win_condition text,
  add column if not exists deadline timestamptz,
  add column if not exists held boolean not null default false,
  add column if not exists challenger_pick uuid references public.profiles(id),
  add column if not exists opponent_pick uuid references public.profiles(id),
  add column if not exists challenger_cancel_at timestamptz,
  add column if not exists opponent_cancel_at timestamptz,
  add column if not exists challenge_id uuid;

update public.callouts
set win_condition = coalesce(nullif(btrim(win_condition), ''), nullif(btrim(title), ''), 'Callout:')
where win_condition is null or btrim(win_condition) = '';

update public.callouts
set deadline = coalesce(deadline, created_at + interval '7 days')
where deadline is null;

alter table public.callouts
  alter column win_condition set default 'Callout:',
  alter column deadline set default (now() + interval '7 days');

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'callouts' and column_name = 'win_condition'
      and is_nullable = 'YES'
  ) then
    alter table public.callouts alter column win_condition set not null;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'callouts' and column_name = 'deadline'
      and is_nullable = 'YES'
  ) then
    alter table public.callouts alter column deadline set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'callouts_challenge_id_fkey'
      and conrelid = 'public.callouts'::regclass
  ) then
    alter table public.callouts
      add constraint callouts_challenge_id_fkey
      foreign key (challenge_id) references public.challenges(id) on delete set null;
  end if;
end $$;

create unique index if not exists callouts_challenge_id_uidx
  on public.callouts (challenge_id)
  where challenge_id is not null;

alter table public.callouts drop constraint if exists callouts_status_check;
alter table public.callouts
  add constraint callouts_status_check
  check (status = any (array[
    'pending'::text,
    'active'::text,
    'resolving'::text,
    'resolved'::text,
    'settled'::text,
    'disputed'::text,
    'cancelled'::text
  ]));

-- ---------------------------------------------------------------------------
-- Helpers (callout-only money; do not add platform wallet_debit)
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

create or replace function public.callout_wallet_hold(
  p_user uuid,
  p_currency text,
  p_amount numeric,
  p_callout_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_amount numeric(12,2);
  v_balance numeric;
begin
  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if p_user is null or v_amount <= 0 then
    return;
  end if;
  if v_currency = 'bucks' then
    select bucks into v_balance from public.profiles where id = p_user for update;
  else
    select coins into v_balance from public.profiles where id = p_user for update;
  end if;
  if coalesce(v_balance, 0) < v_amount then
    raise exception 'Insufficient %', v_currency using errcode = 'P0001';
  end if;
  if v_currency = 'bucks' then
    update public.profiles set bucks = bucks - v_amount where id = p_user;
  else
    update public.profiles set coins = coins - v_amount where id = p_user;
  end if;
  insert into public.wallet_ledger (user_id, currency, amount, reason, reference_id)
  values (p_user, v_currency, -v_amount, 'callout_stake', p_callout_id);
end;
$$;

create or replace function public.callout_wallet_release(
  p_user uuid,
  p_currency text,
  p_amount numeric,
  p_callout_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_amount numeric(12,2);
  v_reason text;
begin
  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'callout_refund');
  if p_user is null or v_amount <= 0 then
    return;
  end if;
  if v_currency = 'bucks' then
    update public.profiles set bucks = bucks + v_amount where id = p_user;
  else
    update public.profiles set coins = coins + v_amount where id = p_user;
  end if;
  insert into public.wallet_ledger (user_id, currency, amount, reason, reference_id)
  values (p_user, v_currency, v_amount, v_reason, p_callout_id);
end;
$$;

revoke all on function public.callout_wallet_hold(uuid, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.callout_wallet_release(uuid, text, numeric, uuid, text) from public, anon, authenticated;

create or replace function public.close_callout_challenge(p_challenge_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(p_status, ''));
begin
  if p_challenge_id is null then
    return;
  end if;
  if v_status not in ('settled', 'cancelled') then
    return;
  end if;
  update public.challenges
  set
    status = v_status,
    cancelled_at = case when v_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    cancelled_by = case
      when v_status = 'cancelled' then coalesce(cancelled_by, auth.uid())
      else cancelled_by
    end,
    distributed_at = case
      when v_status = 'settled' then coalesce(distributed_at, now())
      else distributed_at
    end,
    updated_at = now()
  where id = p_challenge_id
    and coalesce(is_callout, false)
    and status is distinct from v_status;
end;
$$;

revoke all on function public.close_callout_challenge(uuid, text) from public, anon, authenticated;

-- Keep Simple midnight duration off Callout rows. Official already skipped.
create or replace function public.trg_user_challenge_duration_update()
returns trigger
language plpgsql
as $$
declare
  v_days int;
begin
  if coalesce(new.is_official, false)
     or coalesce(new.is_callout, false)
     or coalesce(new.series_id, '') <> '' then
    return new;
  end if;
  if coalesce(new.is_unlimited, false) then
    new.ends_at := null;
    new.length_value := null;
    return new;
  end if;
  v_days := greatest(coalesce(new.length_value, new.days_required, 0), 0);
  if v_days < 1 then
    return new;
  end if;
  new.days_required := v_days;
  new.length_value := v_days;
  new.length_unit := coalesce(nullif(new.length_unit, ''), 'days');
  if new.starts_at is not null then
    new.ends_at := public.user_challenge_ends_at(new.starts_at, v_days);
  end if;
  return new;
end;
$$;

create or replace function public.trg_user_challenge_duration_insert()
returns trigger
language plpgsql
as $$
declare
  v_days int;
begin
  if coalesce(new.is_official, false)
     or coalesce(new.is_callout, false)
     or coalesce(new.series_id, '') <> '' then
    return new;
  end if;
  if coalesce(new.is_unlimited, false) then
    new.ends_at := null;
    new.length_value := null;
    return new;
  end if;
  v_days := greatest(coalesce(new.length_value, new.days_required, 0), 0);
  if v_days < 1 then
    return new;
  end if;
  new.days_required := v_days;
  new.length_value := v_days;
  new.length_unit := coalesce(nullif(new.length_unit, ''), 'days');
  if new.starts_at is not null then
    new.ends_at := public.user_challenge_ends_at(new.starts_at, v_days);
  end if;
  return new;
end;
$$;

-- Private Callout must not notify the host’s whole friends list.
create or replace function public.notify_friends_of_new_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_friend uuid;
begin
  if p_challenge_id is null then
    return;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  if coalesce(v_c.is_official, false) or coalesce(v_c.is_callout, false) or v_c.created_by is null then
    return;
  end if;
  if auth.uid() is not null and auth.uid() is distinct from v_c.created_by then
    return;
  end if;

  for v_friend in
    select case
      when f.user_a_id = v_c.created_by then f.user_b_id
      else f.user_a_id
    end
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a_id = v_c.created_by or f.user_b_id = v_c.created_by)
  loop
    perform public.notify_one_friend_of_challenge(p_challenge_id, v_friend);
  end loop;
exception when others then
  null;
end;
$$;

create or replace function public.attach_callout_challenge(p_callout public.callouts)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_task text;
  v_days int;
  v_ends timestamptz;
  v_id uuid;
  v_proofs jsonb;
begin
  if p_callout.challenge_id is not null then
    return p_callout.challenge_id;
  end if;

  v_title := coalesce(nullif(btrim(p_callout.win_condition), ''), nullif(btrim(p_callout.title), ''), 'Callout:');
  if lower(v_title) not like 'callout:%' then
    v_title := 'Callout: ' || v_title;
  end if;
  v_task := btrim(substr(v_title, 9));
  v_ends := coalesce(p_callout.deadline, now() + interval '7 days');
  v_days := greatest(1, ceil(extract(epoch from (v_ends - now())) / 86400.0)::int);
  v_proofs := jsonb_build_array(
    jsonb_build_object(
      'id', 'callout_photo',
      'name', 'Post a photo of the work.',
      'method', 'photo'
    ),
    jsonb_build_object(
      'id', 'callout_honor',
      'name', 'Confirm on your honor that you did the work.',
      'method', 'honor'
    )
  );

  insert into public.challenges (
    title,
    description,
    rules,
    created_by,
    buy_in_amount,
    days_required,
    min_minutes,
    proof_requirements,
    proofs,
    proof_type,
    proof_review,
    status,
    starts_at,
    ends_at,
    timezone,
    prize_pool,
    prize_structure,
    funding_model,
    creator_contribution,
    max_participants,
    min_participants,
    is_unlimited,
    category,
    challenge_type,
    visibility,
    privacy_mode,
    challenge_lane,
    currency,
    host_funded,
    host_budget,
    format,
    misses_allowed,
    payout_mode,
    start_rule,
    frequency,
    target_count,
    task,
    is_official,
    is_callout,
    is_sponsored,
    creator_participating,
    length_value,
    length_unit,
    scoring_method,
    profile_visibility
  ) values (
    v_title,
    v_task,
    v_title,
    p_callout.challenger_id,
    p_callout.stake_amount,
    v_days,
    30,
    jsonb_build_array(
      jsonb_build_object('type', 'photo', 'required', true),
      jsonb_build_object('type', 'honor', 'required', true)
    ),
    v_proofs,
    'photo',
    'auto',
    'live',
    now(),
    v_ends,
    'UTC',
    round(p_callout.stake_amount * 2, 2),
    'equal_split',
    'participants',
    0,
    2,
    2,
    false,
    'other',
    'consistency',
    'private',
    'private',
    'private',
    p_callout.currency,
    false,
    0,
    'consistency',
    0,
    'even_split_remaining',
    'legacy',
    'once',
    1,
    v_task,
    false,
    true,
    false,
    true,
    v_days,
    'days',
    'consistency',
    'friends'
  )
  returning id into v_id;

  insert into public.challenge_participants (
    challenge_id, user_id, status, buy_in_paid, currency, result
  ) values
    (v_id, p_callout.challenger_id, 'active', p_callout.stake_amount, p_callout.currency, 'pending'),
    (v_id, p_callout.opponent_id, 'active', p_callout.stake_amount, p_callout.currency, 'pending');

  update public.callouts
  set challenge_id = v_id, updated_at = now()
  where id = p_callout.id;

  return v_id;
end;
$$;

revoke all on function public.attach_callout_challenge(public.callouts) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_callout (app signature): title required on remote; still no debit
-- ---------------------------------------------------------------------------

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
  v_task text;
  v_win text;
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
  if not public.callout_opponent_allowed(v_me, p_opponent_id) then
    raise exception 'You can only call out a friend or someone in a live challenge with you' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.callouts
    where status = 'pending'
      and (
        (challenger_id = v_me and opponent_id = p_opponent_id)
        or (challenger_id = p_opponent_id and opponent_id = v_me)
      )
  ) then
    raise exception 'You already have a pending call-out with them' using errcode = 'P0001';
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

  v_task := btrim(coalesce(p_win_condition, ''));
  if lower(v_task) like 'callout:%' then
    v_task := btrim(substr(v_task, 9));
  end if;
  if length(v_task) < 3 then
    raise exception 'Say what a win looks like' using errcode = 'P0001';
  end if;
  v_win := 'Callout: ' || v_task;

  insert into public.callouts (
    challenger_id, opponent_id, title, description, currency, stake_amount,
    win_condition, deadline, status, held
  ) values (
    v_me, p_opponent_id, v_win, v_task, v_currency, v_amount,
    v_win, p_deadline, 'pending', false
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- accept: hold both stakes, then attach private challenge (same transaction)
-- ---------------------------------------------------------------------------

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
  v_challenge uuid;
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
  if v_row.deadline is not null and v_row.deadline <= now() then
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

  if not coalesce(v_row.held, false) then
    perform public.callout_wallet_hold(v_row.challenger_id, v_row.currency, v_row.stake_amount, p_callout_id);
    perform public.callout_wallet_hold(v_row.opponent_id, v_row.currency, v_row.stake_amount, p_callout_id);
    v_row.held := true;
  end if;

  update public.callouts
    set status = 'active',
        held = true,
        updated_at = now()
    where id = p_callout_id
    returning * into v_row;

  v_challenge := public.attach_callout_challenge(v_row);

  select * into v_row from public.callouts where id = p_callout_id;
  return v_row;
end;
$$;

grant execute on function public.accept_callout(uuid) to authenticated;

-- Decline pending: no challenge, no debit.
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

grant execute on function public.decline_callout(uuid) to authenticated;

-- Cancel pending: no challenge. After hold: callout refund only, then close challenge (no second refund).
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
  if v_row.status in ('settled', 'resolved') then
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
    perform public.callout_wallet_release(
      v_row.challenger_id, v_row.currency, v_row.stake_amount, p_callout_id, 'callout_refund'
    );
    perform public.callout_wallet_release(
      v_row.opponent_id, v_row.currency, v_row.stake_amount, p_callout_id, 'callout_refund'
    );
    v_row.held := false;
    v_row.status := 'cancelled';
    perform public.close_callout_challenge(v_row.challenge_id, 'cancelled');
  elsif v_both then
    v_row.status := 'cancelled';
    perform public.close_callout_challenge(v_row.challenge_id, 'cancelled');
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

grant execute on function public.cancel_callout(uuid) to authenticated;

-- Honor settle (app signature). Pays once via callout, then marks the challenge settled.
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
    if v_row.held then
      perform public.callout_wallet_release(
        v_my_pick, v_row.currency, v_prize, p_callout_id, 'callout_payout'
      );
    end if;
    update public.callouts
      set challenger_pick = v_row.challenger_pick,
          opponent_pick = v_row.opponent_pick,
          winner_id = v_my_pick,
          held = false,
          status = 'settled',
          updated_at = now()
      where id = p_callout_id
      returning * into v_row;
    perform public.close_callout_challenge(v_row.challenge_id, 'settled');
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

grant execute on function public.submit_callout_result(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Challenge settle / cancel must not pay or refund a Callout pot
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'settle_ended_challenge'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) and not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'settle_ended_challenge_core'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) then
    alter function public.settle_ended_challenge(uuid) rename to settle_ended_challenge_core;
  end if;
end $$;

create or replace function public.settle_ended_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_callout public.callouts%rowtype;
begin
  if p_challenge_id is null then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(v_c.is_callout, false) then
    select * into v_callout from public.callouts where challenge_id = p_challenge_id;
    if found and v_callout.status in ('settled', 'resolved') then
      perform public.close_callout_challenge(p_challenge_id, 'settled');
      return jsonb_build_object('already_settled', true, 'ok', true, 'callout', true);
    end if;
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'callout_honor',
      'held', coalesce(v_callout.held, false)
    );
  end if;

  return public.settle_ended_challenge_core(p_challenge_id);
end;
$$;

grant execute on function public.settle_ended_challenge(uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cancel_challenge'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) and not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cancel_challenge_core'
      and pg_get_function_identity_arguments(p.oid) = 'p_challenge_id uuid'
  ) then
    alter function public.cancel_challenge(uuid) rename to cancel_challenge_core;
  end if;
end $$;

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
  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(v_c.is_callout, false) then
    perform public.close_callout_challenge(p_challenge_id, 'cancelled');
    return jsonb_build_object('ok', true, 'callout', true, 'refunded', false);
  end if;

  return public.cancel_challenge_core(p_challenge_id);
end;
$$;

grant execute on function public.cancel_challenge(uuid) to authenticated;
