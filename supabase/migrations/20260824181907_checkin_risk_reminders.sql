-- Check-in risk reminders at deadline −8h / −4h / −2h. Same miss-tick clock.
-- Extends enqueue_checkin_reminders. Cancel unread rows when the period is submitted.

create or replace function public.open_checkin_period(ch public.challenges)
returns table (period_key date, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
  v_tz text;
  v_today date;
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
    v_win := public.official_window_at(v_windows, now());
    if v_win is null then
      return;
    end if;
    period_key := (v_win->>'date')::date;
    ends_at := (v_win->>'ends_at')::timestamptz;
    if ends_at is null or now() >= ends_at then
      return;
    end if;
    return next;
    return;
  end if;

  v_tz := public.challenge_clock_tz(ch);
  v_today := (timezone(v_tz, now()))::date;
  v_end := ((v_today::timestamp + time '23:59:59.999') at time zone v_tz);
  if ch.ends_at is not null and v_end > ch.ends_at then
    return;
  end if;
  if now() >= v_end then
    return;
  end if;
  period_key := v_today;
  ends_at := v_end;
  return next;
end;
$$;

create or replace function public.checkin_miss_would_eliminate(
  ch public.challenges,
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select (
    select count(*)::int
    from public.challenge_period_misses m
    where m.challenge_id = ch.id and m.user_id = p_user_id
  ) >= public.challenge_misses_allowed(ch);
$$;

create or replace function public.checkin_risk_line(p_offset_hours int, p_seed text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_lines text[];
  v_idx int;
begin
  if p_offset_hours = 8 then
    v_lines := array[
      'Hey — check-in window’s closing later. One post keeps you in the game.',
      'Still time. Check in later and you stay on the board.',
      'Window’s open. One check-in keeps your seat.'
    ];
  elsif p_offset_hours = 4 then
    v_lines := array[
      'Four hours left to check in. Future you wants to stay on the board.',
      'Four hours. Check in and you keep your spot.',
      'Four hours on the clock. One check-in keeps you in it.'
    ];
  else
    v_lines := array[
      'Two hours. Check in now or you’re out. You’ve got this.',
      'Two hours left. Check in and you stay in it.',
      'Last two hours. One check-in. You’ve got this.'
    ];
  end if;
  v_idx := 1 + mod(abs(hashtext(coalesce(p_seed, ''))), greatest(cardinality(v_lines), 1));
  return left(v_lines[v_idx], 100);
end;
$$;

create or replace function public.cancel_checkin_reminders(
  p_user_id uuid,
  p_challenge_id uuid,
  p_period_key date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_challenge_id is null or p_period_key is null then
    return;
  end if;
  delete from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'challenge_checkin_reminder'
    and n.read_at is null
    and coalesce(n.data->>'challenge_id', n.data->>'challengeId', '') = p_challenge_id::text
    and coalesce(n.data->>'period_key', '') = p_period_key::text;
end;
$$;

create or replace function public.enqueue_checkin_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_period record;
  rec record;
  v_offset int;
  v_next int;
  v_line text;
  v_key text;
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
      for v_period in
        select * from public.open_checkin_period(ch)
      loop
        foreach v_offset in array array[8, 4, 2]
        loop
          v_next := case v_offset when 8 then 4 when 4 then 2 else 0 end;
          if now() < v_period.ends_at - make_interval(hours => v_offset) then
            continue;
          end if;
          if now() >= v_period.ends_at - make_interval(hours => v_next) then
            continue;
          end if;

          for rec in
            select p.user_id
            from public.challenge_participants p
            where p.challenge_id = ch.id
              and p.eliminated_at is null
              and coalesce(p.status, 'joined') in ('active', 'joined', 'completed')
              and coalesce(p.status, 'joined') is distinct from 'withdrawn'
              and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
              and not public.period_was_submitted(ch.id, p.user_id, v_period.period_key)
              and public.checkin_miss_would_eliminate(ch, p.user_id)
          loop
            v_key := rec.user_id::text || ':' || ch.id::text || ':' || v_period.period_key::text || ':' || v_offset::text;
            v_line := public.checkin_risk_line(v_offset, v_key);
            if coalesce(btrim(v_line), '') = '' then
              continue;
            end if;
            perform public.notify_user(
              rec.user_id,
              null,
              'challenge_checkin_reminder',
              v_line,
              v_line,
              jsonb_build_object(
                'type', 'challenge_checkin_reminder',
                'challenge_id', ch.id,
                'challengeId', ch.id,
                'period_key', v_period.period_key,
                'offset_hours', v_offset,
                'href', '/challenges/' || ch.id::text || '/submit',
                'dedupe_key', v_key
              )
            );
          end loop;
        end loop;
      end loop;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

create or replace function public.trg_cancel_checkin_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_at is not null and new.status = 'submitted' then
    perform public.cancel_checkin_reminders(new.user_id, new.challenge_id, new.period_key);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_checkins_cancel_reminders on public.challenge_checkins;
create trigger challenge_checkins_cancel_reminders
  after insert or update of status, submitted_at
  on public.challenge_checkins
  for each row
  execute function public.trg_cancel_checkin_reminders();

create or replace function public.tick_official_series()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_s public.official_series%rowtype;
  v_duration int;
  v_tz text;
  v_start timestamptz;
  v_windows jsonb;
begin
  for v_s in select * from public.official_series loop
    perform pg_advisory_xact_lock(hashtext('official_series:' || v_s.slug));
    v_tz := coalesce(nullif(btrim(v_s.timezone), ''), 'America/Chicago');
    if v_tz = 'UTC' then
      v_tz := 'America/Chicago';
    end if;
    v_duration := coalesce(v_s.duration_days, 7);

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'live'
        and ends_at is not null
        and now() >= ends_at
        and distributed_at is null
      for update skip locked
    loop
      begin
        perform public.distribute_challenge(rec.id);
      exception when others then
        null;
      end;
    end loop;

    update public.challenges
    set
      status = 'arming',
      armed_at = coalesce(armed_at, now()),
      updated_at = now()
    where series_id = v_s.slug
      and is_official
      and status = 'filling'
      and 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0) > 0
      and coalesce(prize_pool, 0) >= 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0);

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'arming'
        and armed_at is not null
        and now() >= armed_at + interval '1 hour'
      for update skip locked
    loop
      v_start := now();
      v_windows := public.official_compute_day_windows(v_start, v_tz, v_duration);
      update public.challenges
      set
        status = 'live',
        starts_at = v_start,
        day_windows = v_windows,
        timezone = v_tz,
        ends_at = (v_windows -> -1 ->> 'ends_at')::timestamptz,
        official_started_at = coalesce(official_started_at, v_start),
        updated_at = now()
      where id = rec.id;
      perform public.official_series_insert_filling(v_s.slug, 0);
    end loop;

    update public.challenges c
    set
      timezone = v_tz,
      day_windows = public.official_compute_day_windows(c.starts_at, v_tz, v_duration),
      ends_at = (public.official_compute_day_windows(c.starts_at, v_tz, v_duration) -> -1 ->> 'ends_at')::timestamptz,
      updated_at = now()
    where c.series_id = v_s.slug
      and c.is_official
      and c.status = 'live'
      and c.starts_at is not null
      and (
        c.day_windows is null
        or jsonb_typeof(c.day_windows) is distinct from 'array'
        or jsonb_array_length(c.day_windows) = 0
      );

    if not exists (
      select 1 from public.challenges
      where series_id = v_s.slug and status in ('filling', 'arming')
    ) then
      perform public.official_series_insert_filling(v_s.slug, 0);
    end if;
  end loop;

  begin
    perform public.tick_user_challenge_starts();
  exception when others then
    null;
  end;
  perform public.sync_challenge_misses();
  begin
    perform public.enqueue_checkin_reminders();
  exception when others then
    null;
  end;
  begin
    perform public.tick_bob_encouragements();
  exception when others then
    null;
  end;
  begin
    perform public.sync_all_days_completed();
  exception when others then
    null;
  end;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.open_checkin_period(public.challenges) to authenticated, service_role;
grant execute on function public.checkin_miss_would_eliminate(public.challenges, uuid) to authenticated, service_role;
grant execute on function public.checkin_risk_line(int, text) to authenticated, service_role;
grant execute on function public.enqueue_checkin_reminders() to authenticated, service_role;
grant execute on function public.tick_official_series() to authenticated, service_role;
revoke all on function public.cancel_checkin_reminders(uuid, uuid, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
