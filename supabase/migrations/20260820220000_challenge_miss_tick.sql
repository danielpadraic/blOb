-- Miss tick: when a live period window ends, submitted stays in; anything else is a miss.
-- Official / miss=out → eliminate. Allowed misses → stay active. Idempotent per user+challenge+period_key.
-- Same cron neighbor as start roll (tick_official_series → sync_challenge_misses). Official fill/arming unchanged.

create table if not exists public.challenge_period_misses (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_key date not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, period_key)
);

create index if not exists challenge_period_misses_user_idx
  on public.challenge_period_misses (user_id, created_at desc);

alter table public.challenge_period_misses enable row level security;

drop policy if exists "Participants read period misses" on public.challenge_period_misses;
create policy "Participants read period misses"
  on public.challenge_period_misses for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.challenge_participants cp
      where cp.challenge_id = challenge_period_misses.challenge_id
        and cp.user_id = auth.uid()
    )
  );

grant select on public.challenge_period_misses to authenticated;
revoke insert, update, delete on public.challenge_period_misses from public, anon, authenticated;

comment on table public.challenge_period_misses is
  'One row per missed period. Inserted by the miss tick. Submitted check-ins never write here.';

drop function if exists public.sync_challenge_misses();

create or replace function public.challenge_clock_tz(ch public.challenges)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
      coalesce(nullif(btrim(ch.timezone), ''), 'America/Chicago')
    else
      coalesce(nullif(btrim(ch.timezone), ''), 'UTC')
  end;
$$;

create or replace function public.closed_checkin_periods(ch public.challenges)
returns table (period_key date, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_windows jsonb;
  v_tz text;
  v_start date;
  v_today date;
  v_d date;
  v_end timestamptz;
begin
  if ch.status is distinct from 'live' then
    return;
  end if;
  if ch.starts_at is null or now() < ch.starts_at then
    return;
  end if;
  if coalesce(ch.is_unlimited, false) then
    return;
  end if;

  if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
    v_windows := public.official_ensure_windows(ch.id);
    return query
      select (w->>'date')::date, (w->>'ends_at')::timestamptz
      from jsonb_array_elements(coalesce(v_windows, '[]'::jsonb)) w
      where now() > (w->>'ends_at')::timestamptz
      order by (w->>'ends_at')::timestamptz;
    return;
  end if;

  v_tz := public.challenge_clock_tz(ch);
  v_start := (ch.starts_at at time zone v_tz)::date;
  v_today := (timezone(v_tz, now()))::date;
  v_d := v_start;
  while v_d < v_today loop
    v_end := ((v_d::timestamp + time '23:59:59.999') at time zone v_tz);
    if now() > v_end and (ch.ends_at is null or v_end <= ch.ends_at) then
      period_key := v_d;
      ends_at := v_end;
      return next;
    end if;
    v_d := v_d + 1;
    if v_d > v_start + 400 then
      exit;
    end if;
  end loop;
end;
$$;

create or replace function public.checkin_period_for(ch public.challenges)
returns date
language plpgsql
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
  v_tz text;
begin
  if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
    v_windows := public.official_ensure_windows(ch.id);
    v_win := public.official_window_at(v_windows, now());
    if v_win is not null then
      return (v_win->>'date')::date;
    end if;
  end if;
  v_tz := public.challenge_clock_tz(ch);
  return (timezone(v_tz, now()))::date;
end;
$$;

create or replace function public.challenge_misses_allowed(ch public.challenges)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then 0
    else greatest(coalesce(ch.misses_allowed, 0), 0)
  end;
$$;

create or replace function public.period_was_submitted(
  p_challenge_id uuid,
  p_user_id uuid,
  p_period date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.challenge_checkins k
    where k.challenge_id = p_challenge_id
      and k.user_id = p_user_id
      and k.period_key = p_period
      and k.status = 'submitted'
      and k.submitted_at is not null
  );
$$;

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
      and (
        (coalesce(is_official, false) and coalesce(series_id, '') <> '')
        or (
          coalesce(format, 'consistency') = 'consistency'
          and coalesce(frequency, 'daily') is distinct from 'once'
        )
      )
  loop
    begin
      v_allow := public.challenge_misses_allowed(ch);

      for v_period in
        select * from public.closed_checkin_periods(ch) order by ends_at
      loop
        for v_new in
          insert into public.challenge_period_misses (challenge_id, user_id, period_key)
          select ch.id, p.user_id, v_period.period_key
          from public.challenge_participants p
          where p.challenge_id = ch.id
            and p.eliminated_at is null
            and coalesce(p.status, 'joined') in ('active', 'joined', 'completed')
            and coalesce(p.status, 'joined') is distinct from 'withdrawn'
            and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
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

grant execute on function public.sync_challenge_misses() to authenticated, service_role;
grant execute on function public.closed_checkin_periods(public.challenges) to authenticated, service_role;
grant execute on function public.checkin_period_for(public.challenges) to authenticated;

create or replace function public.wipe_user_challenge_progress(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    return;
  end if;
  if ch.status in ('live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled', 'distributing') then
    return;
  end if;

  delete from public.challenge_checkins
  where challenge_id = p_challenge_id;

  delete from public.workout_submissions
  where challenge_id = p_challenge_id;

  delete from public.challenge_period_misses
  where challenge_id = p_challenge_id;

  update public.challenge_participants
  set
    days_completed = 0,
    completed_at = null,
    status = case
      when coalesce(status, 'joined') in ('completed', 'active', 'eliminated', 'failed') then 'joined'
      else coalesce(status, 'joined')
    end,
    eliminated_at = null
  where challenge_id = p_challenge_id
    and coalesce(status, 'joined') is distinct from 'refunded_pre_start'
    and coalesce(status, 'joined') is distinct from 'withdrawn';
end;
$$;

revoke all on function public.wipe_user_challenge_progress(uuid) from public, anon, authenticated;

create or replace function public.bob_closed_period(ch public.challenges)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
begin
  select max(p.period_key) into v_date
  from public.closed_checkin_periods(ch) p;
  return v_date;
end;
$$;

notify pgrst, 'reload schema';
