-- Join until + host rigor. Additive only.
-- Paste in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.

alter table public.challenges
  add column if not exists join_until_at timestamptz;

alter table public.challenges
  add column if not exists host_rigor text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_host_rigor_check'
  ) then
    alter table public.challenges
      add constraint challenges_host_rigor_check
      check (host_rigor is null or host_rigor in ('friendly', 'normal', 'strict'));
  end if;
end $$;

comment on column public.challenges.join_until_at is
  'People can join while now < join_until_at. Null reads as starts_at (At start).';

comment on column public.challenges.host_rigor is
  'friendly | normal | strict. Null reads as normal.';

update public.challenges
set host_rigor = 'strict'
where coalesce(is_official, false)
  and (
    lower(coalesce(currency, '')) in ('bucks', 'cash', 'usd')
    or lower(coalesce(challenge_lane, '')) in ('bucks', 'cash')
  )
  and host_rigor is distinct from 'strict';

create or replace function public.challenge_is_official_cash(ch public.challenges)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(ch.is_official, false)
    and (
      lower(coalesce(ch.currency, '')) in ('bucks', 'cash', 'usd')
      or lower(coalesce(ch.challenge_lane, '')) in ('bucks', 'cash')
    );
$$;

create or replace function public.enforce_official_cash_strict()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.challenge_is_official_cash(new)
     and coalesce(new.host_rigor, 'strict') is distinct from 'strict' then
    raise exception 'OFFICIAL_CASH_STRICT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_official_cash_strict on public.challenges;
create trigger challenges_official_cash_strict
  before insert or update of host_rigor, is_official, currency, challenge_lane
  on public.challenges
  for each row
  execute function public.enforce_official_cash_strict();

-- join_challenge_ungated: allow user live join while now < join_until_at.
-- Official series stay filling/arming only.

create or replace function public.join_challenge_ungated(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_balance numeric;
  v_count int;
  v_need numeric;
  v_cur text;
  v_dob text;
  v_until timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if coalesce(v_c.is_callout, false) then
    raise exception 'This Callout is cheer only. Watching — no entry, no prize.' using errcode = 'P0001';
  end if;

  if v_c.is_official
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    raise exception 'GEO_BLOCKED';
  end if;

  if v_c.series_id is not null then
    if v_c.status not in ('filling', 'arming') then
      raise exception 'ALREADY_STARTED';
    end if;
  elsif v_c.is_official then
    raise exception 'NOT_JOINABLE';
  else
    if v_c.status in (
      'judging', 'settled',
      'cancelled', 'cancelled_underfilled', 'distributing'
    ) then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.status not in (
      'open', 'upcoming', 'starting', 'in_progress', 'live', 'filling', 'arming'
    ) then
      raise exception 'JOIN_CLOSED';
    end if;
    v_until := coalesce(v_c.join_until_at, v_c.starts_at);
    if v_until is not null and now() >= v_until then
      raise exception 'JOIN_CLOSED';
    end if;
  end if;

  if exists (select 1 from challenge_participants where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'ALREADY_JOINED';
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is distinct from v_uid
     and not public.are_accepted_friends(v_c.created_by, v_uid) then
    raise exception 'FRIENDS_ONLY';
  end if;

  if public.is_invite_only_challenge(v_c)
     and v_c.created_by is distinct from v_uid then
    if not public.user_can_access_challenge(p_challenge_id, v_uid) then
      raise exception 'NOT_INVITED';
    end if;
  end if;

  select count(*) into v_count from challenge_participants
  where challenge_id = p_challenge_id and status <> 'refunded_pre_start';

  if v_c.max_participants is not null and v_count >= v_c.max_participants then
    raise exception 'LOBBY_FULL';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_c.is_official, false) then
    v_dob := public.official_dob_status(v_uid);
    if v_dob = 'DOB_REQUIRED' then
      raise exception 'DOB_REQUIRED';
    end if;
    if v_dob = 'UNDERAGE' then
      raise exception 'UNDERAGE';
    end if;
  end if;

  if public.requires_official_body_metrics(v_c) then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
  end if;

  v_cur := case when v_c.currency = 'bucks' then 'bucks' else 'coins' end;
  if v_cur = 'coins' then
    select coalesce(coins, credits, 0) into v_balance from profiles where id = v_uid for update;
  else
    select coalesce(bucks, 0) into v_balance from profiles where id = v_uid for update;
  end if;

  if coalesce(v_balance, 0) < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_cur = 'coins' then
      update profiles
      set coins = coalesce(coins, credits, 0) - v_c.buy_in_amount
      where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_uid, p_challenge_id, v_cur, -v_c.buy_in_amount,
      'join_escrow', 'join_escrow',
      '{}'::jsonb,
      p_challenge_id
    );
  end if;

  insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, v_uid, v_c.buy_in_amount, v_cur, 'active');

  begin
    update public.challenge_invites
    set status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where challenge_id = p_challenge_id
      and invitee_id = v_uid
      and status = 'pending';
  exception when others then
    null;
  end;

  if v_c.series_id is not null then
    select 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0)
      into v_need
    from public.challenges
    where id = p_challenge_id;
    if v_need > 0 then
      update public.challenges
      set status = 'arming', armed_at = coalesce(armed_at, now()), updated_at = now()
      where id = p_challenge_id
        and status = 'filling'
        and coalesce(prize_pool, 0) >= v_need;
    end if;
  elsif coalesce(v_c.is_official, false) = false then
    begin
      perform public.tick_one_user_challenge_start(p_challenge_id);
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$function$;

revoke all on function public.join_challenge_ungated(uuid) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid) to authenticated;

-- Host Board: Strict host cannot adjust. @blob still can, including Official cash.

create or replace function public.host_adjust_checkin(
  p_challenge_id uuid,
  p_user_id uuid,
  p_action text,
  p_period_start timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  cp public.challenge_participants%rowtype;
  v_action text;
  v_row public.challenge_checkins%rowtype;
  v_honor jsonb := jsonb_build_object('honor', jsonb_build_object('method', 'honor'));
  v_name text;
  v_days int := 0;
  v_misses int := 0;
  v_allow int := 0;
  v_status text;
  v_period_key date := null;
  v_day_n int := null;
  v_win_start timestamptz := null;
  v_deleted int := 0;
  v_complete boolean := false;
  v_ops boolean := false;
  v_rigor text;
begin
  v_action := lower(btrim(coalesce(p_action, '')));
  v_ops := public.is_official_ops();
  if auth.uid() is null then
    raise exception 'Only the host can change the Board.';
  end if;
  if v_action not in ('count_honor', 'excuse_miss', 'remove_counted') then
    raise exception 'Only the host can change the Board.';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Only the host can change the Board.';
  end if;
  if not public.host_adjust_is_actor(ch) then
    raise exception 'Only the host can change the Board.';
  end if;

  v_rigor := lower(coalesce(ch.host_rigor, 'normal'));
  if not v_ops and v_rigor = 'strict' then
    raise exception 'Only the host can change the Board.';
  end if;

  if not v_ops
     and (
       coalesce(ch.is_official, false)
       or coalesce(ch.series_id, '') <> ''
       or (
         coalesce(ch.host_budget, 0) > 0
         and v_rigor is distinct from 'friendly'
       )
     ) then
    raise exception 'This Official challenge can’t be adjusted.';
  end if;

  if lower(coalesce(ch.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'This challenge has already ended.';
  end if;

  if lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
     or lower(coalesce(ch.format, '')) in ('points', 'cumulative')
     or coalesce(ch.scoring_method, '') = 'comparable_points' then
    raise exception 'Only the host can change the Board.';
  end if;

  select * into cp
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Only the host can change the Board.';
  end if;
  if coalesce(cp.status, '') = 'refunded_pre_start' then
    raise exception 'Only the host can change the Board.';
  end if;

  v_name := coalesce(nullif(public.profile_display_name(p_user_id), ''), 'Someone');
  v_allow := greatest(coalesce(ch.misses_allowed, 0), 0);

  if v_action <> 'excuse_miss' then
    if p_period_start is null then
      raise exception 'Only the host can change the Board.';
    end if;
    select w.day_n, w.period_key, w.starts_at
      into v_day_n, v_period_key, v_win_start
    from public.host_adjust_windows(ch) w
    where w.starts_at <= now()
      and (
        abs(extract(epoch from (w.starts_at - p_period_start))) < 2
        or w.period_key = (timezone(coalesce(nullif(btrim(ch.timezone), ''), 'America/Denver'), p_period_start))::date
      )
    order by abs(extract(epoch from (w.starts_at - p_period_start)))
    limit 1;
    if not found or v_period_key is null then
      raise exception 'Only the host can change the Board.';
    end if;
  end if;

  if v_action = 'count_honor' then
    select exists (
      select 1
      from public.challenge_checkins k
      where k.challenge_id = p_challenge_id
        and k.user_id = p_user_id
        and k.period_key = v_period_key
        and k.status = 'submitted'
        and k.submitted_at is not null
    ) into v_complete;
    if v_complete then
      raise exception 'That day already counts.';
    end if;

    select * into v_row
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_period_key
      and (status is distinct from 'submitted' or submitted_at is null)
    order by checkin_slot
    limit 1
    for update;

    if found then
      update public.challenge_checkins
        set status = 'submitted',
            submitted_at = coalesce(submitted_at, now()),
            proof_parts = case
              when proof_parts ? 'honor' then proof_parts
              else coalesce(proof_parts, '{}'::jsonb) || v_honor
            end,
            notes = coalesce(nullif(btrim(notes), ''), 'Honor check-in'),
            updated_at = now()
      where id = v_row.id;
    else
      insert into public.challenge_checkins (
        user_id, challenge_id, period_key, checkin_slot, status, proof_parts, notes,
        started_at, submitted_at
      ) values (
        p_user_id, p_challenge_id, v_period_key, 1, 'submitted', v_honor, 'Honor check-in',
        v_win_start, v_win_start
      );
    end if;

    insert into public.workout_submissions (
      challenge_id, user_id, submission_date, notes, status, proof_parts, proof_kind, checkin_slot
    ) values (
      p_challenge_id, p_user_id, v_period_key, 'Honor check-in', 'approved', v_honor, 'honor', 1
    )
    on conflict (challenge_id, user_id, submission_date, checkin_slot) do nothing;

    delete from public.challenge_period_misses
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_period_key;
  elsif v_action = 'excuse_miss' then
    delete from public.challenge_period_misses
    where ctid in (
      select m.ctid
      from public.challenge_period_misses m
      where m.challenge_id = p_challenge_id
        and m.user_id = p_user_id
      order by m.period_key desc
      limit 1
    );
    get diagnostics v_deleted = row_count;
    if v_deleted = 0 then
      raise exception 'They don’t have a miss to excuse.';
    end if;
  elsif v_action = 'remove_counted' then
    select * into v_row
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_period_key
      and status = 'submitted'
      and submitted_at is not null
    order by checkin_slot
    limit 1
    for update;
    if not found then
      raise exception 'Only the host can change the Board.';
    end if;
    update public.challenge_checkins
      set status = 'in_progress',
          updated_at = now()
    where id = v_row.id;
    insert into public.challenge_period_misses (challenge_id, user_id, period_key)
    values (p_challenge_id, p_user_id, v_period_key)
    on conflict do nothing;
  end if;

  perform public.refresh_participant_progress(p_challenge_id, p_user_id);

  select count(*)::int into v_misses
  from public.challenge_period_misses
  where challenge_id = p_challenge_id and user_id = p_user_id;

  select status, days_completed into v_status, v_days
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;

  if coalesce(v_status, '') in ('eliminated', 'failed') and v_misses <= v_allow then
    update public.challenge_participants
      set status = 'joined',
          eliminated_at = null
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and status in ('eliminated', 'failed');
    v_status := 'joined';
  elsif v_action = 'remove_counted'
        and coalesce(v_status, '') not in ('withdrawn', 'completed', 'refunded_pre_start')
        and v_misses > v_allow then
    update public.challenge_participants
      set status = 'eliminated',
          eliminated_at = coalesce(eliminated_at, now())
    where challenge_id = p_challenge_id
      and user_id = p_user_id;
    v_status := 'eliminated';
  end if;

  begin
    insert into public.host_adjust_audit (challenge_id, actor_id, target_user_id, action, period_key)
    values (p_challenge_id, auth.uid(), p_user_id, v_action, v_period_key);
  exception when others then
    null;
  end;

  if v_ops then
    perform public.official_ops_log(
      p_challenge_id,
      p_user_id,
      'adjust',
      jsonb_build_object('action', v_action, 'period_key', v_period_key, 'day_n', v_day_n)
    );
  end if;

  select days_completed into v_days
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'user_id', p_user_id,
    'display_name', v_name,
    'status', v_status,
    'days_completed', coalesce(v_days, 0),
    'misses_used', v_misses,
    'period_key', v_period_key,
    'day_n', v_day_n
  );
end;
$$;

revoke all on function public.host_adjust_checkin(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.host_adjust_checkin(uuid, uuid, text, timestamptz) to authenticated;

-- Friendly host add / remove. Not admin_mass_join. @blob keeps official_* RPCs.

create or replace function public.host_add_participant(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_cur text;
  v_fee numeric := 0;
  v_balance numeric := 0;
  v_status text;
begin
  if auth.uid() is null or p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if not (
    public.is_official_ops()
    or (
      v_c.created_by = auth.uid()
      and lower(coalesce(v_c.host_rigor, 'normal')) = 'friendly'
    )
  ) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    raise exception 'They’re already in.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);

  if v_fee > 0 then
    if v_cur = 'coins' then
      select coalesce(coins, credits, 0) into v_balance from public.profiles where id = p_user_id for update;
    else
      select coalesce(bucks, 0) into v_balance from public.profiles where id = p_user_id for update;
    end if;
    if coalesce(v_balance, 0) < v_fee then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) - v_fee
      where id = p_user_id;
    else
      update public.profiles set bucks = bucks - v_fee where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_fee, updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, -v_fee,
      'join_escrow', 'join_escrow',
      jsonb_build_object('kind', 'host_add'),
      p_challenge_id
    );
  end if;

  insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, p_user_id, v_fee, v_cur, 'active');

  begin
    perform public.announce_challenge_join(p_challenge_id, p_user_id);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
end;
$$;

create or replace function public.host_remove_participant(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_cur text;
  v_amt numeric := 0;
begin
  if auth.uid() is null or p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if not (
    public.is_official_ops()
    or (
      v_c.created_by = auth.uid()
      and lower(coalesce(v_c.host_rigor, 'normal')) = 'friendly'
    )
  ) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if lower(coalesce(v_c.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;

  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_p.currency, v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_amt := greatest(coalesce(v_p.buy_in_paid, 0), 0);

  if v_amt > 0 then
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) + v_amt
      where id = p_user_id;
    else
      update public.profiles set bucks = coalesce(bucks, 0) + v_amt where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = greatest(coalesce(prize_pool, 0) - v_amt, 0), updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, v_amt,
      'leave_refund', 'host_remove',
      jsonb_build_object('kind', 'host_remove'),
      p_challenge_id
    );
  end if;

  delete from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'challenge_id', p_challenge_id, 'user_id', p_user_id);
end;
$$;

create or replace function public.host_adjust_score(
  p_challenge_id uuid,
  p_user_id uuid,
  p_kind text,
  p_value numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_kind text;
  v_val numeric;
begin
  if auth.uid() is null then
    raise exception 'Only the host can change the Board.';
  end if;
  v_kind := lower(btrim(coalesce(p_kind, '')));
  if v_kind not in ('points', 'qty') then
    raise exception 'Only the host can change the Board.';
  end if;
  v_val := greatest(coalesce(p_value, 0), 0);

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Only the host can change the Board.';
  end if;

  if lower(coalesce(v_c.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'This challenge has already ended.';
  end if;

  if not (
    public.is_official_ops()
    or (
      v_c.created_by = auth.uid()
      and lower(coalesce(v_c.host_rigor, 'normal')) = 'friendly'
    )
  ) then
    raise exception 'Only the host can change the Board.';
  end if;

  if v_kind = 'points' then
    update public.challenge_participants
      set points = v_val
    where challenge_id = p_challenge_id and user_id = p_user_id;
  else
    update public.challenge_participants
      set distance_meters_total = v_val
    where challenge_id = p_challenge_id and user_id = p_user_id;
  end if;

  if not found then
    raise exception 'Only the host can change the Board.';
  end if;

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'kind', v_kind, 'value', v_val);
end;
$$;

revoke all on function public.host_add_participant(uuid, uuid) from public, anon;
revoke all on function public.host_remove_participant(uuid, uuid) from public, anon;
revoke all on function public.host_adjust_score(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.host_add_participant(uuid, uuid) to authenticated;
grant execute on function public.host_remove_participant(uuid, uuid) to authenticated;
grant execute on function public.host_adjust_score(uuid, uuid, text, numeric) to authenticated;

-- Late consistency joiner: periods that already ended before joined_at are not misses.

create or replace function public.sync_challenge_misses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_period record;
  v_new record;
  v_allow int;
  v_missed int;
  v_out boolean;
  v_missed_n int := 0;
  v_dropped int := 0;
begin
  for ch in
    select *
    from public.challenges
    where status = 'live'
      and coalesce(is_unlimited, false) = false
      and starts_at is not null
      and now() >= starts_at
  loop
    begin
      if not public.challenge_has_daily_checkin_duty(ch) then
        continue;
      end if;

      v_allow := public.challenge_misses_allowed(ch);

      for v_period in
        select * from public.closed_checkin_periods(ch) order by ends_at
      loop
        if not public.challenge_requires_period_checkin(ch, v_period.period_key) then
          continue;
        end if;
        for v_new in
          insert into public.challenge_period_misses (challenge_id, user_id, period_key)
          select ch.id, p.user_id, v_period.period_key
          from public.challenge_participants p
          where p.challenge_id = ch.id
            and p.eliminated_at is null
            and coalesce(p.status, 'joined') in ('active', 'joined', 'completed')
            and coalesce(p.status, 'joined') is distinct from 'withdrawn'
            and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
            and coalesce(p.joined_at, ch.starts_at, now()) < v_period.ends_at
            and not public.period_was_submitted(ch.id, p.user_id, v_period.period_key)
          on conflict do nothing
          returning user_id, period_key
        loop
          v_missed_n := v_missed_n + 1;
          select count(*)::int into v_missed
          from public.challenge_period_misses
          where challenge_id = ch.id and user_id = v_new.user_id;

          v_out := v_missed > v_allow;
          if v_out then
            update public.challenge_participants
            set
              status = 'eliminated',
              eliminated_at = coalesce(eliminated_at, now())
            where challenge_id = ch.id
              and user_id = v_new.user_id
              and eliminated_at is null;
            if found then
              v_dropped := v_dropped + 1;
            end if;
          end if;

          begin
            perform public.send_bob_encouragement(
              v_new.user_id,
              case when v_out then 'miss_removed' else 'miss_still_in' end,
              v_new.user_id::text || ':' || ch.id::text || ':' || v_new.period_key::text || ':'
                || case when v_out then 'miss_removed' else 'miss_still_in' end,
              ch.id,
              null,
              ch.title
            );
          exception when others then
            null;
          end;
        end loop;
      end loop;
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'missed', v_missed_n, 'dropped', v_dropped);
end;
$$;

notify pgrst, 'reload schema';
