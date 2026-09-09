-- Host Board adjust: honor count / excuse miss / remove counted day.
-- Does not change save_checkin_proof / submit_checkin signatures.
-- Does not touch write_coin_ledger, tick_settlements, prize_pool, or wallets.
-- Does not GRANT those functions. Does not call admin_mass_join_challenge.
-- Apply in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.

-- Honor source (Meredith-style, not HealthKit):
--   challenge_checkins.proof_parts = {"honor":{"method":"honor"}}
--   workout_submissions.proof_kind = 'honor'
-- Period identity: challenge_checkins.period_key (date). Misses: challenge_period_misses.

create table if not exists public.challenge_moderators (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (challenge_id, user_id)
);

alter table public.challenge_moderators enable row level security;

drop policy if exists challenge_moderators_select on public.challenge_moderators;
create policy challenge_moderators_select
  on public.challenge_moderators
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_moderators.challenge_id
        and c.created_by = auth.uid()
    )
  );

grant select on table public.challenge_moderators to authenticated;
revoke insert, update, delete on table public.challenge_moderators from anon, authenticated, public;

create table if not exists public.host_adjust_audit (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid not null,
  action text not null,
  period_key date,
  created_at timestamptz not null default now()
);

alter table public.host_adjust_audit enable row level security;

drop policy if exists host_adjust_audit_select on public.host_adjust_audit;
create policy host_adjust_audit_select
  on public.host_adjust_audit
  for select
  to authenticated
  using (
    actor_id = auth.uid()
    or exists (
      select 1 from public.challenges c
      where c.id = host_adjust_audit.challenge_id
        and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.challenge_moderators m
      where m.challenge_id = host_adjust_audit.challenge_id
        and m.user_id = auth.uid()
    )
  );

grant select on table public.host_adjust_audit to authenticated;
revoke insert, update, delete on table public.host_adjust_audit from anon, authenticated, public;

create or replace function public.host_adjust_is_actor(ch public.challenges)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      ch.created_by = auth.uid()
      or exists (
        select 1
        from public.challenge_moderators m
        where m.challenge_id = ch.id
          and m.user_id = auth.uid()
      )
    );
$$;

create or replace function public.host_adjust_windows(ch public.challenges)
returns table (day_n integer, period_key date, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tz text;
  v_span int;
  v_local timestamp;
  v_midnight boolean;
  v_i int;
  v_key date;
  v_start timestamptz;
  v_end timestamptz;
begin
  if ch.starts_at is null then
    return;
  end if;
  v_tz := coalesce(nullif(btrim(ch.timezone), ''), 'America/Denver');
  v_span := greatest(coalesce(ch.days_required, ch.length_value, ch.target_count, 1), 1);
  v_span := least(v_span, 400);
  v_local := timezone(v_tz, ch.starts_at);
  v_midnight := extract(hour from v_local) = 0
    and extract(minute from v_local) = 0
    and extract(second from v_local) = 0;

  for v_i in 0 .. v_span - 1 loop
    if v_midnight then
      v_key := v_local::date + v_i;
      v_start := (v_key::timestamp) at time zone v_tz;
      v_end := ((v_key + 1)::timestamp) at time zone v_tz;
    else
      v_start := ch.starts_at + make_interval(days => v_i);
      v_end := v_start + interval '1 day';
      v_key := (timezone(v_tz, v_start))::date;
    end if;
    day_n := v_i + 1;
    period_key := v_key;
    starts_at := v_start;
    ends_at := v_end;
    return next;
  end loop;
end;
$$;

create or replace function public.host_adjust_board_days(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  v_name text;
  v_misses int := 0;
  v_missed jsonb := '[]'::jsonb;
  v_counted jsonb := '[]'::jsonb;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Only the host can change the Board.';
  end if;
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'Only the host can change the Board.';
  end if;
  if not public.host_adjust_is_actor(ch) then
    raise exception 'Only the host can change the Board.';
  end if;

  v_name := coalesce(nullif(public.profile_display_name(p_user_id), ''), 'Someone');

  select count(*)::int into v_misses
  from public.challenge_period_misses
  where challenge_id = p_challenge_id and user_id = p_user_id;

  for r in
    select w.day_n, w.period_key, w.starts_at, w.ends_at
    from public.host_adjust_windows(ch) w
    where w.starts_at <= now()
    order by w.day_n
  loop
    if exists (
      select 1
      from public.challenge_checkins k
      where k.challenge_id = p_challenge_id
        and k.user_id = p_user_id
        and k.period_key = r.period_key
        and k.status = 'submitted'
        and k.submitted_at is not null
    ) then
      v_counted := v_counted || jsonb_build_array(jsonb_build_object(
        'day_n', r.day_n,
        'period_key', r.period_key,
        'period_start', r.starts_at,
        'honor', exists (
          select 1
          from public.challenge_checkins k
          where k.challenge_id = p_challenge_id
            and k.user_id = p_user_id
            and k.period_key = r.period_key
            and k.status = 'submitted'
            and (k.proof_parts ? 'honor' or coalesce(k.proof_parts #>> '{honor,method}', '') = 'honor')
        )
      ));
    else
      v_missed := v_missed || jsonb_build_array(jsonb_build_object(
        'day_n', r.day_n,
        'period_key', r.period_key,
        'period_start', r.starts_at
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'display_name', v_name,
    'misses_used', v_misses,
    'misses_allowed', greatest(coalesce(ch.misses_allowed, 0), 0),
    'missed', v_missed,
    'counted', v_counted
  );
end;
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
  v_win record;
  v_row public.challenge_checkins%rowtype;
  v_honor jsonb := jsonb_build_object('honor', jsonb_build_object('method', 'honor'));
  v_name text;
  v_days int := 0;
  v_misses int := 0;
  v_allow int := 0;
  v_status text;
begin
  v_action := lower(btrim(coalesce(p_action, '')));
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

  if coalesce(ch.is_official, false)
     or coalesce(ch.series_id, '') <> ''
     or coalesce(ch.host_budget, 0) > 0 then
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
    select w.* into v_win
    from public.host_adjust_windows(ch) w
    where w.starts_at <= now()
      and (
        abs(extract(epoch from (w.starts_at - p_period_start))) < 2
        or w.period_key = (timezone(coalesce(nullif(btrim(ch.timezone), ''), 'America/Denver'), p_period_start))::date
      )
    order by abs(extract(epoch from (w.starts_at - p_period_start)))
    limit 1;
    if v_win.period_key is null then
      raise exception 'Only the host can change the Board.';
    end if;
  end if;

  if v_action = 'count_honor' then
    select * into v_row
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_win.period_key
      and checkin_slot = 1
    for update;

    if found and v_row.status = 'submitted' and v_row.submitted_at is not null then
      raise exception 'That day already counts.';
    end if;

    if found then
      update public.challenge_checkins
        set status = 'submitted',
            submitted_at = coalesce(submitted_at, now()),
            proof_parts = case
              when proof_parts ? 'honor' then proof_parts
              when proof_parts = '{}'::jsonb then v_honor
              else proof_parts || v_honor
            end,
            notes = coalesce(nullif(btrim(notes), ''), 'Honor check-in'),
            health_workout_id = null,
            updated_at = now()
      where id = v_row.id;
    else
      insert into public.challenge_checkins (
        user_id, challenge_id, period_key, checkin_slot, status, proof_parts, notes,
        started_at, submitted_at
      ) values (
        p_user_id, p_challenge_id, v_win.period_key, 1, 'submitted', v_honor, 'Honor check-in',
        v_win.starts_at, v_win.starts_at
      );
    end if;

    insert into public.workout_submissions (
      challenge_id, user_id, submission_date, notes, status, proof_parts, proof_kind, checkin_slot
    ) values (
      p_challenge_id, p_user_id, v_win.period_key, 'Honor check-in', 'approved', v_honor, 'honor', 1
    )
    on conflict (challenge_id, user_id, submission_date, checkin_slot) do nothing;

    delete from public.challenge_period_misses
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_win.period_key;

    insert into public.posts (
      author_id, challenge_id, content, media_urls, audience, audience_user_ids,
      source, system_kind, hidden_from_home
    ) values (
      auth.uid(),
      p_challenge_id,
      'Host counted Day ' || v_win.day_n::text || ' for ' || v_name || '.',
      '{}',
      'public',
      '{}',
      'challenge',
      'host_counted_day',
      true
    );
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
  elsif v_action = 'remove_counted' then
    select * into v_row
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_win.period_key
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
    values (p_challenge_id, p_user_id, v_win.period_key)
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
    values (p_challenge_id, auth.uid(), p_user_id, v_action, v_win.period_key);
  exception when others then
    null;
  end;

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
    'period_key', v_win.period_key,
    'day_n', v_win.day_n
  );
end;
$$;

revoke execute on function public.host_adjust_is_actor(public.challenges) from anon, public;
revoke execute on function public.host_adjust_windows(public.challenges) from anon, authenticated, public;
revoke execute on function public.host_adjust_board_days(uuid, uuid) from anon, public;
revoke execute on function public.host_adjust_checkin(uuid, uuid, text, timestamp with time zone) from anon, public;

grant execute on function public.host_adjust_is_actor(public.challenges) to authenticated;
grant execute on function public.host_adjust_board_days(uuid, uuid) to authenticated;
grant execute on function public.host_adjust_checkin(uuid, uuid, text, timestamp with time zone) to authenticated;

notify pgrst, 'reload schema';

select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ex,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('host_adjust_checkin', 'host_adjust_board_days', 'write_coin_ledger', 'save_checkin_proof')
order by p.proname;
