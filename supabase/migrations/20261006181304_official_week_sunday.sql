-- Official weekly windows are Sunday 12:00 a.m. through Saturday in America/Chicago.
-- The week that is already open keeps its dates and the days already counted.
-- The next roll, after that window ends, starts on Sunday.

create or replace function public.official_coin_window_bounds(
  p_kind text,
  p_at timestamptz default now()
)
returns table (starts_at timestamptz, ends_at timestamptz, day_count integer)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tz text := public.official_coin_tz();
  v_local date;
  v_from date;
  v_to date;
begin
  v_local := (timezone(v_tz, p_at))::date;
  if lower(coalesce(p_kind, '')) = 'coin_monthly' then
    v_from := date_trunc('month', v_local::timestamp)::date;
    v_to := (date_trunc('month', v_local::timestamp) + interval '1 month')::date;
  else
    -- dow: 0 = Sunday. This week starts Sunday 12:00 a.m. and ends the next Sunday.
    v_from := v_local - extract(dow from v_local)::integer;
    v_to := v_from + 7;
  end if;
  starts_at := v_from::timestamp at time zone v_tz;
  ends_at := v_to::timestamp at time zone v_tz;
  day_count := (v_to - v_from);
  return next;
end;
$$;

create or replace function public.official_coin_roll_windows()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  w record;
  rec record;
  v_rolled int := 0;
  v_settled int := 0;
begin
  for ch in
    select * from public.challenges
    where official_kind in ('coin_weekly', 'coin_monthly')
    for update skip locked
  loop
    -- Leave the open Official week alone. Counted days stay on that window.
    if ch.official_kind = 'coin_weekly'
       and ch.ends_at is not null
       and now() < ch.ends_at then
      continue;
    end if;

    select * into w from public.official_coin_window_bounds(ch.official_kind, now());

    insert into public.official_coin_windows (
      challenge_id, official_kind, starts_at, ends_at, guarantee_coins, day_count
    ) values (
      ch.id, ch.official_kind, w.starts_at, w.ends_at,
      greatest(coalesce(ch.prize_guarantee_coins, 0), 0), w.day_count
    )
    on conflict (challenge_id, starts_at) do nothing;

    if ch.starts_at is distinct from w.starts_at
       or ch.ends_at is distinct from w.ends_at
       or coalesce(ch.days_required, 0) <> w.day_count
       or ch.status is distinct from 'live' then
      update public.challenges
      set starts_at = w.starts_at,
          ends_at = w.ends_at,
          official_started_at = w.starts_at,
          days_required = w.day_count,
          status = 'live',
          settled_at = null,
          distributed_at = null,
          updated_at = now()
      where id = ch.id;

      update public.challenge_participants
      set window_starts_at = w.starts_at,
          window_ends_at = w.ends_at,
          days_completed = 0,
          completed_at = null,
          result = 'pending',
          status = case when coalesce(status, 'active') = 'withdrawn' then status else 'active' end
      where challenge_id = ch.id
        and (window_starts_at is distinct from w.starts_at);

      v_rolled := v_rolled + 1;
    end if;
  end loop;

  for rec in
    select ow.challenge_id, ow.starts_at
    from public.official_coin_windows ow
    where ow.settled_at is null
      and now() >= ow.ends_at + public.settlement_review_window()
    order by ow.ends_at
  loop
    begin
      perform public.official_coin_settle(rec.challenge_id, rec.starts_at);
      v_settled := v_settled + 1;
    exception when others then
      raise log 'official coin settle skip challenge=% window=% sqlstate=% sqlerrm=%',
        rec.challenge_id, rec.starts_at, sqlstate, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'rolled', v_rolled, 'settled', v_settled);
end;
$$;
