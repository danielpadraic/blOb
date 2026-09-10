-- Official House ops for the locked @blob account only.
-- Paste in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.
-- is_official_ops() reads the live profiles row: username = 'blob' AND is_official.
-- Expected id today: 81dfe427-d413-4c60-bd4a-e710c95077ad
-- Does not reuse admin_mass_join_challenge. Does not write host_counted_day.

-- ---------------------------------------------------------------------------
-- Locked @blob id + gate
-- ---------------------------------------------------------------------------

create or replace function public.official_ops_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where lower(btrim(p.username)) = 'blob'
    and coalesce(p.is_official, false) = true
  order by p.created_at asc nulls last, p.id
  limit 1;
$$;

create or replace function public.is_official_ops()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.official_ops_user_id() is not null
    and auth.uid() = public.official_ops_user_id();
$$;

revoke all on function public.official_ops_user_id() from public, anon, authenticated;
grant execute on function public.official_ops_user_id() to service_role;

revoke all on function public.is_official_ops() from public, anon;
grant execute on function public.is_official_ops() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table if not exists public.official_ops_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  challenge_id uuid,
  target_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists official_ops_events_challenge_idx
  on public.official_ops_events (challenge_id, created_at desc);

comment on table public.official_ops_events is
  'House add/remove/adjust audit. Only the locked @blob session can select.';

alter table public.official_ops_events enable row level security;

drop policy if exists official_ops_events_select on public.official_ops_events;
create policy official_ops_events_select
  on public.official_ops_events
  for select
  to authenticated
  using (public.is_official_ops());

revoke all on table public.official_ops_events from public, anon, authenticated;
grant select on table public.official_ops_events to authenticated;

create or replace function public.official_ops_log(
  p_challenge_id uuid,
  p_target_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.official_ops_events (actor_id, challenge_id, target_id, action, payload)
  values (auth.uid(), p_challenge_id, p_target_id, p_action, coalesce(p_payload, '{}'::jsonb));
exception when others then
  null;
end;
$$;

revoke all on function public.official_ops_log(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access: @blob can open any challenge for House tools
-- ---------------------------------------------------------------------------

create or replace function public.user_can_access_challenge(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  if p_challenge_id is null then
    return false;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return false;
  end if;

  if p_user_id is not null
     and public.official_ops_user_id() is not null
     and p_user_id = public.official_ops_user_id() then
    return true;
  end if;

  if coalesce(v_c.is_official, false) then
    return true;
  end if;

  if p_user_id is not null and v_c.created_by = p_user_id then
    return true;
  end if;

  if p_user_id is not null and exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;

  if lower(coalesce(v_c.visibility, 'public')) in ('public', 'unlisted')
     and lower(coalesce(v_c.challenge_lane, 'coins')) <> 'private' then
    return true;
  end if;

  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.challenge_invites
    where challenge_id = p_challenge_id
      and status in ('pending', 'accepted')
      and invitee_id = p_user_id
  ) then
    return true;
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if public.is_invite_only_challenge(v_c)
     and coalesce(v_c.discoverability, '') = 'friends_of_friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if coalesce(v_c.is_callout, false)
     and public.is_callout_challenge_observer(p_challenge_id, p_user_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.user_can_access_challenge(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_challenge(p_challenge_id, auth.uid());
$$;

grant execute on function public.user_can_access_challenge(uuid, uuid) to authenticated, anon;
grant execute on function public.user_can_access_challenge(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Host Board: official_ops is an actor, including Official cash
-- ---------------------------------------------------------------------------

create or replace function public.host_adjust_is_actor(ch public.challenges)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.is_official_ops()
      or ch.created_by = auth.uid()
      or exists (
        select 1
        from public.challenge_moderators m
        where m.challenge_id = ch.id
          and m.user_id = auth.uid()
      )
    );
$$;

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

  if not v_ops
     and (
       coalesce(ch.is_official, false)
       or coalesce(ch.series_id, '') <> ''
       or coalesce(ch.host_budget, 0) > 0
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

revoke execute on function public.host_adjust_checkin(uuid, uuid, text, timestamp with time zone) from anon, public;
grant execute on function public.host_adjust_checkin(uuid, uuid, text, timestamp with time zone) to authenticated;

-- ---------------------------------------------------------------------------
-- Edit: official_ops can change fields locked after join (not after settled)
-- ---------------------------------------------------------------------------

create or replace function public.update_user_challenge(p_challenge_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_min int;
  v_unlimited boolean;
  v_starts timestamptz;
  v_days int;
  v_ends timestamptz;
  v_format text;
  v_prize_structure text;
  v_payout_mode text;
  v_ops boolean := false;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_ops := public.is_official_ops();
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid and not v_ops then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not v_ops and (coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if lower(coalesce(ch.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    if v_ops and lower(coalesce(ch.status, '')) in ('ended', 'settled', 'settling', 'judging', 'distributing') then
      raise exception 'That challenge already settled.' using errcode = 'P0001';
    end if;
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not v_ops and ch.status = 'live' then
    raise exception 'ALREADY_STARTED';
  end if;
  if not v_ops and exists (select 1 from public.workout_submissions s where s.challenge_id = p_challenge_id) then
    raise exception 'ALREADY_STARTED';
  end if;

  v_min := greatest(coalesce(nullif(p_payload->>'min_participants', '')::int, ch.min_participants, 2), 2);
  v_unlimited := coalesce((p_payload->>'is_unlimited')::boolean, ch.is_unlimited);
  v_starts := coalesce(nullif(p_payload->>'starts_at', '')::timestamptz, ch.starts_at);
  v_days := case
    when v_unlimited then null
    else greatest(
      coalesce(
        nullif(p_payload->>'duration_days', '')::int,
        nullif(p_payload->>'length_value', '')::int,
        nullif(p_payload->>'days_required', '')::int,
        ch.length_value,
        ch.days_required,
        1
      ),
      1
    )
  end;
  v_ends := case
    when v_unlimited then null
    else public.user_challenge_ends_at(v_starts, v_days)
  end;
  v_format := coalesce(nullif(p_payload->>'format', ''), ch.format);
  v_prize_structure := coalesce(nullif(p_payload->>'prize_structure', ''), ch.prize_structure);
  v_payout_mode := coalesce(nullif(p_payload->>'payout_mode', ''), ch.payout_mode);
  if p_payload ? 'format' or p_payload ? 'prize_structure' or p_payload ? 'payout_mode' then
    perform public.assert_format_payout_pair(v_format, v_prize_structure, v_payout_mode);
  end if;

  update public.challenges
  set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
    description = coalesce(p_payload->>'description', description),
    rules = coalesce(p_payload->>'rules', rules),
    starts_at = v_starts,
    ends_at = v_ends,
    is_unlimited = v_unlimited,
    min_participants = v_min,
    days_required = coalesce(v_days, days_required),
    target_count = case
      when v_format = 'points' then coalesce(nullif(p_payload->>'target_count', '')::int, target_count)
      else coalesce(v_days, target_count)
    end,
    min_minutes = coalesce(nullif(p_payload->>'min_minutes', '')::int, min_minutes),
    frequency = coalesce(p_payload->>'frequency', frequency),
    proofs = coalesce(p_payload->'proofs', proofs),
    proof_requirements = coalesce(p_payload->'proof_requirements', proof_requirements),
    tasks = coalesce(p_payload->'tasks', tasks),
    rules_list = coalesce(p_payload->'rules_list', rules_list),
    visibility = coalesce(p_payload->>'visibility', visibility),
    discoverability = coalesce(p_payload->>'discoverability', discoverability),
    privacy_mode = coalesce(nullif(p_payload->>'privacy_mode', ''), privacy_mode),
    task = coalesce(p_payload->>'task', task),
    length_value = v_days,
    length_unit = case
      when v_unlimited then null
      else coalesce(p_payload->>'length_unit', length_unit, 'days')
    end,
    required_checkins = coalesce(v_days, required_checkins),
    misses_allowed = coalesce(nullif(p_payload->>'misses_allowed', '')::int, misses_allowed),
    proof_type = coalesce(p_payload->>'proof_type', proof_type),
    cover_image_url = coalesce(p_payload->>'cover_image_url', cover_image_url),
    rules_video_url = coalesce(p_payload->>'rules_video_url', rules_video_url),
    format = coalesce(nullif(p_payload->>'format', ''), format),
    challenge_type = coalesce(nullif(p_payload->>'challenge_type', ''), challenge_type),
    prize_structure = coalesce(nullif(p_payload->>'prize_structure', ''), prize_structure),
    payout_mode = coalesce(nullif(p_payload->>'payout_mode', ''), payout_mode),
    top_places_mode = case
      when p_payload ? 'top_places_mode' then nullif(p_payload->>'top_places_mode', '')
      else top_places_mode
    end,
    top_places_value = case
      when p_payload ? 'top_places_value' then nullif(p_payload->>'top_places_value', '')::numeric
      else top_places_value
    end,
    top_places_distribution = case
      when p_payload ? 'top_places_distribution' then nullif(p_payload->>'top_places_distribution', '')
      else top_places_distribution
    end,
    start_roll_pending = false,
    start_roll_shift_days = 0,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  if v_ops then
    perform public.official_ops_log(p_challenge_id, ch.created_by, 'edit', '{}'::jsonb);
  end if;

  return to_jsonb(ch);
end;
$$;

grant execute on function public.update_user_challenge(uuid, jsonb) to authenticated;

drop policy if exists "Official ops can update challenges" on public.challenges;
create policy "Official ops can update challenges"
  on public.challenges
  for update
  to authenticated
  using (public.is_official_ops())
  with check (public.is_official_ops());

-- ---------------------------------------------------------------------------
-- Add / remove
-- ---------------------------------------------------------------------------

create or replace function public.official_add_participant(
  p_challenge_id uuid,
  p_user_id uuid,
  p_buy_in text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_mode text;
  v_cur text;
  v_fee numeric := 0;
  v_balance numeric := 0;
  v_status text;
begin
  if not public.is_official_ops() then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;
  if p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_mode := lower(btrim(coalesce(p_buy_in, '')));
  if v_mode not in ('charge', 'house', 'none') then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;
  if v_status not in (
    'open', 'upcoming', 'starting', 'in_progress', 'filling', 'arming', 'live'
  ) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    raise exception 'They’re already in.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);

  if v_mode = 'charge' and v_fee > 0 then
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
      jsonb_build_object('kind', 'official_ops_charge'),
      p_challenge_id
    );
  elsif v_mode = 'house' and v_fee > 0 then
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_fee, updated_at = now()
    where id = p_challenge_id;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (
    p_challenge_id,
    p_user_id,
    case when v_mode = 'none' then 0 else v_fee end,
    v_cur,
    'active'
  );

  begin
    update public.challenge_invites
      set status = 'accepted',
          accepted_at = coalesce(accepted_at, now())
    where challenge_id = p_challenge_id
      and invitee_id = p_user_id
      and status = 'pending';
  exception when others then
    null;
  end;

  perform public.announce_challenge_join(p_challenge_id, p_user_id);
  perform public.official_ops_log(
    p_challenge_id,
    p_user_id,
    'add',
    jsonb_build_object('buy_in', v_mode, 'fee', v_fee, 'currency', v_cur)
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'buy_in', v_mode,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
exception
  when raise_exception then
    raise;
  when others then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
end;
$$;

create or replace function public.official_remove_participant(
  p_challenge_id uuid,
  p_user_id uuid,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_mode text;
  v_cur text;
  v_amt numeric := 0;
  v_started boolean := false;
  v_title text;
begin
  if not public.is_official_ops() then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;
  if p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_mode := lower(btrim(coalesce(p_mode, '')));
  if v_mode not in ('out_of_pot', 'leave_room') then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
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

  v_started := lower(coalesce(v_c.status, '')) in ('live', 'in_progress')
    or (v_c.starts_at is not null and v_c.starts_at <= now());
  v_cur := case
    when coalesce(v_p.currency, v_c.currency, 'coins') = 'bucks' then 'bucks'
    else 'coins'
  end;
  v_amt := greatest(coalesce(v_p.buy_in_paid, 0), 0);
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');

  if not v_started and v_amt > 0 then
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) + v_amt
      where id = p_user_id;
    else
      update public.profiles
        set bucks = coalesce(bucks, 0) + v_amt
      where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = greatest(coalesce(prize_pool, 0) - v_amt, 0),
          updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, v_amt,
      'leave_refund', 'leave_refund',
      jsonb_build_object('kind', 'official_ops_refund', 'mode', v_mode),
      p_challenge_id
    );
    v_amt := 0;
  end if;

  if v_mode = 'out_of_pot' then
    update public.challenge_participants
      set status = 'eliminated',
          eliminated_at = coalesce(eliminated_at, now())
    where challenge_id = p_challenge_id and user_id = p_user_id;
  else
    begin
      delete from public.challenge_checkins
      where challenge_id = p_challenge_id
        and user_id = p_user_id
        and status in ('in_progress', 'ready');
    exception when others then
      null;
    end;
    delete from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id;
    begin
      perform public.notify_user(
        p_user_id,
        'challenge_cancelled',
        v_title,
        'You’re no longer in ' || v_title || '.',
        p_challenge_id,
        null,
        null,
        jsonb_build_object('challenge_id', p_challenge_id, 'kind', 'official_ops_leave_room')
      );
    exception when others then
      begin
        perform public.notify_user(
          p_user_id,
          null,
          'challenge_cancelled',
          v_title,
          'You’re no longer in ' || v_title || '.',
          jsonb_build_object('challenge_id', p_challenge_id, 'kind', 'official_ops_leave_room')
        );
      exception when others then
        null;
      end;
    end;
  end if;

  perform public.official_ops_log(
    p_challenge_id,
    p_user_id,
    'remove',
    jsonb_build_object('mode', v_mode, 'started', v_started)
  );

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'mode', v_mode,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
exception
  when raise_exception then
    raise;
  when others then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
end;
$$;

revoke all on function public.official_add_participant(uuid, uuid, text) from public, anon;
revoke all on function public.official_remove_participant(uuid, uuid, text) from public, anon;
grant execute on function public.official_add_participant(uuid, uuid, text) to authenticated;
grant execute on function public.official_remove_participant(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

select
  public.official_ops_user_id() as blob_user_id,
  p.username,
  p.is_official
from public.profiles p
where p.id = public.official_ops_user_id();
