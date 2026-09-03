-- Consistency check-in periods follow starts_at in the challenge timezone.
-- Host tz, default America/Denver. Not UTC calendar dates. Not Chicago unless saved.
-- Local-midnight starts_at → calendar dates. Otherwise exact 24h slices from starts_at.
-- Does not change prize math or the 2-hour settle delay.

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
      coalesce(nullif(btrim(ch.timezone), ''), 'America/Denver')
  end;
$$;

create or replace function public.consistency_checkin_period_at(
  ch public.challenges,
  p_at timestamptz default now()
)
returns table (period_key date, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text;
  v_start timestamptz;
  v_local timestamp;
  v_calendar boolean;
  v_key date;
  v_n int;
  v_from timestamptz;
  v_to timestamptz;
begin
  v_tz := public.challenge_clock_tz(ch);
  v_start := ch.starts_at;

  if v_start is null then
    v_key := (timezone(v_tz, p_at))::date;
    starts_at := (v_key::timestamp at time zone v_tz);
    ends_at := ((v_key + 1)::timestamp at time zone v_tz);
    period_key := v_key;
    return next;
    return;
  end if;

  v_local := timezone(v_tz, v_start);
  v_calendar := (
    extract(hour from v_local) = 0
    and extract(minute from v_local) = 0
    and extract(second from v_local) < 1
  );

  if v_calendar then
    v_key := (timezone(v_tz, p_at))::date;
    if v_key < (v_local)::date then
      v_key := (v_local)::date;
    end if;
    period_key := v_key;
    starts_at := (v_key::timestamp at time zone v_tz);
    ends_at := ((v_key + 1)::timestamp at time zone v_tz);
    return next;
    return;
  end if;

  v_n := greatest(0, floor(extract(epoch from (p_at - v_start)) / 86400.0)::int);
  v_from := v_start + (v_n * interval '1 day');
  v_to := v_from + interval '1 day';
  period_key := (timezone(v_tz, v_from))::date;
  starts_at := v_from;
  ends_at := v_to;
  return next;
end;
$$;

create or replace function public.checkin_period_for(ch public.challenges)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
  v_key date;
begin
  if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
    v_windows := public.official_ensure_windows(ch.id);
    v_win := public.official_window_at(v_windows, now());
    if v_win is not null then
      return (v_win->>'date')::date;
    end if;
  end if;
  select p.period_key into v_key
  from public.consistency_checkin_period_at(ch, now()) p;
  return v_key;
end;
$$;

create or replace function public.open_checkin_period(ch public.challenges)
returns table (period_key date, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_windows jsonb;
  v_win jsonb;
  v_key date;
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

  select p.period_key, p.ends_at into v_key, v_end
  from public.consistency_checkin_period_at(ch, now()) p;
  if v_key is null or v_end is null then
    return;
  end if;
  if ch.ends_at is not null and v_end > ch.ends_at then
    return;
  end if;
  if now() >= v_end then
    return;
  end if;
  period_key := v_key;
  ends_at := v_end;
  return next;
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
  v_at timestamptz;
  v_key date;
  v_end timestamptz;
  v_guard int := 0;
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

  v_at := ch.starts_at;
  loop
    v_guard := v_guard + 1;
    if v_guard > 400 then
      exit;
    end if;
    v_key := null;
    v_end := null;
    select p.period_key, p.ends_at into v_key, v_end
    from public.consistency_checkin_period_at(ch, v_at) p;
    if v_key is null or v_end is null then
      exit;
    end if;
    if v_end > now() then
      exit;
    end if;
    if ch.ends_at is not null and v_end > ch.ends_at then
      exit;
    end if;
    period_key := v_key;
    ends_at := v_end;
    return next;
    v_at := v_end;
  end loop;
end;
$$;

grant execute on function public.consistency_checkin_period_at(public.challenges, timestamptz)
  to authenticated, service_role;
grant execute on function public.checkin_period_for(public.challenges) to authenticated;
grant execute on function public.open_checkin_period(public.challenges) to authenticated, service_role;
grant execute on function public.closed_checkin_periods(public.challenges) to authenticated, service_role;
grant execute on function public.challenge_clock_tz(public.challenges) to authenticated, service_role;
