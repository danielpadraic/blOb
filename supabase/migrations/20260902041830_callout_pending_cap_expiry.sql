-- Callout Slice 5: 3 outgoing pending, 72h invite expiry, no debit.
-- Does not change accept_callout hold math. Active / held rows stay.
-- Safe to re-run.

alter table public.callouts
  add column if not exists expires_at timestamptz;

update public.callouts
set expires_at = created_at + interval '72 hours'
where expires_at is null;

alter table public.callouts
  alter column expires_at set default (now() + interval '72 hours');

comment on column public.callouts.expires_at is
  'Pending invite expiry. Default created_at + 72h. Active/held rows are never expired by this.';

create index if not exists callouts_pending_expires_idx
  on public.callouts (expires_at)
  where status = 'pending' and coalesce(held, false) = false;

create or replace function public.callout_invite_is_expired(p_row public.callouts)
returns boolean
language sql
stable
as $$
  select p_row.status = 'pending'
    and coalesce(p_row.held, false) = false
    and coalesce(p_row.expires_at, p_row.created_at + interval '72 hours') <= now();
$$;

create or replace function public.expire_pending_callouts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.callouts%rowtype;
  v_n int := 0;
  v_title text;
begin
  for v_row in
    select *
    from public.callouts
    where status = 'pending'
      and coalesce(held, false) = false
      and coalesce(expires_at, created_at + interval '72 hours') <= now()
    for update skip locked
  loop
    update public.callouts
      set status = 'cancelled', updated_at = now()
      where id = v_row.id
        and status = 'pending'
        and coalesce(held, false) = false
      returning * into v_row;
    if not found then
      continue;
    end if;
    v_n := v_n + 1;
    v_title := coalesce(nullif(btrim(v_row.win_condition), ''), 'Callout:');
    perform public.notify_user(
      v_row.challenger_id, v_row.opponent_id, 'callout_cancelled',
      v_title,
      'Callout expired.',
      jsonb_build_object('callout_id', v_row.id, 'title', v_title, 'reason', 'expired')
    );
    perform public.notify_user(
      v_row.opponent_id, v_row.challenger_id, 'callout_cancelled',
      v_title,
      'Callout expired.',
      jsonb_build_object('callout_id', v_row.id, 'title', v_title, 'reason', 'expired')
    );
  end loop;
  return v_n;
end;
$$;

revoke all on function public.expire_pending_callouts() from public, anon;
grant execute on function public.expire_pending_callouts() to authenticated, service_role;

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_amount numeric,
  p_currency text,
  p_win_condition text,
  p_deadline timestamptz,
  p_proofs jsonb,
  p_format text
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
  perform public.expire_pending_callouts();
  if p_opponent_id is null or p_opponent_id = v_me then
    raise exception 'Pick someone else to call out' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;
  if not public.callout_opponent_allowed(v_me, p_opponent_id) then
    raise exception 'You can only call out a friend or someone in a live challenge with you' using errcode = 'P0001';
  end if;
  if (
    select count(*)
    from public.callouts
    where challenger_id = v_me
      and status = 'pending'
  ) >= 3 then
    raise exception 'Finish or cancel one Callout first.' using errcode = 'P0001';
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
    win_condition, deadline, status, held, proofs, format, expires_at
  ) values (
    v_me, p_opponent_id, v_win, v_task, v_currency, v_amount,
    v_win, p_deadline, 'pending', false,
    public.callout_normalized_proofs(p_proofs),
    public.callout_normalized_format(p_format),
    now() + interval '72 hours'
  )
  returning * into v_row;

  return v_row;
end;
$$;

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
begin
  return public.create_callout(
    p_opponent_id, p_amount, p_currency, p_win_condition, p_deadline,
    '[]'::jsonb, 'consistency'
  );
end;
$$;

grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz, jsonb, text) to authenticated;

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
  perform public.expire_pending_callouts();

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
  if public.callout_invite_is_expired(v_row) then
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
  perform public.expire_pending_callouts();
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid)
      from cron.job j
      where j.jobname = 'expire-pending-callouts';
    exception when others then
      null;
    end;
    perform cron.schedule(
      'expire-pending-callouts',
      '*/15 * * * *',
      'select public.expire_pending_callouts()'
    );
  end if;
exception when others then
  raise notice 'pg_cron skipped: %', sqlerrm;
end $$;
