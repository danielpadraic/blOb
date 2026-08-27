-- Distance proof + Cumulative challenges.
-- Store meters. Eligible remaining still keys even_split_remaining.
-- A photo or screenshot alone never satisfies Distance.

alter table public.challenges
  add column if not exists cumulative_metric text,
  add column if not exists cumulative_target numeric,
  add column if not exists cumulative_window text,
  add column if not exists distance_meters_required numeric;

alter table public.challenges
  drop constraint if exists challenges_cumulative_metric_allowed;
alter table public.challenges
  add constraint challenges_cumulative_metric_allowed
  check (cumulative_metric is null or cumulative_metric in ('distance_m', 'count'));

alter table public.challenges
  drop constraint if exists challenges_cumulative_window_allowed;
alter table public.challenges
  add constraint challenges_cumulative_window_allowed
  check (cumulative_window is null or cumulative_window in ('challenge', 'week', 'day'));

alter table public.challenges drop constraint if exists challenges_format_allowed;
alter table public.challenges
  add constraint challenges_format_allowed
  check (format in ('consistency', 'points', 'lms', 'cumulative'));

comment on column public.challenges.cumulative_metric is 'distance_m | count. Null unless type is cumulative.';
comment on column public.challenges.cumulative_target is 'Meters when metric is distance_m.';
comment on column public.challenges.cumulative_window is 'challenge | week | day.';
comment on column public.challenges.distance_meters_required is 'Per check-in Distance floor in meters.';

alter table public.challenge_checkins
  add column if not exists distance_meters numeric,
  add column if not exists route_preview_url text;

alter table public.challenge_participants
  add column if not exists distance_meters_total numeric not null default 0;

create or replace function public.challenge_is_cumulative(ch public.challenges)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(ch.challenge_type, '')) = 'cumulative'
      or lower(coalesce(ch.format, '')) = 'cumulative';
$$;

create or replace function public.checkin_part_distance_meters(p_part jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_health numeric := 0;
  v_stored numeric := 0;
  v_text text;
  v_num numeric;
begin
  if p_part is null or p_part = '{}'::jsonb then
    return 0;
  end if;
  begin
    v_health := coalesce((p_part->'health'->>'distanceMeters')::numeric, 0);
  exception when others then
    v_health := 0;
  end;
  begin
    v_stored := coalesce(
      (p_part->>'distanceMeters')::numeric,
      (p_part->>'distance_meters')::numeric,
      0
    );
  exception when others then
    v_stored := 0;
  end;
  if v_health > 0 then
    return v_health;
  end if;
  if v_stored > 0 then
    return v_stored;
  end if;
  v_text := lower(coalesce(p_part->>'text', ''));
  if v_text ~ '[0-9]' then
    v_num := substring(v_text from '([0-9]+(?:\.[0-9]+)?)')::numeric;
    if v_text ~ '\ykm\y' then
      return v_num * 1000;
    end if;
    return v_num * 1609.34;
  end if;
  return 0;
end;
$$;

create or replace function public.checkin_parts_distance_meters(p_parts jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_max numeric := 0;
  v_one numeric;
begin
  if p_parts is null or jsonb_typeof(p_parts) is distinct from 'object' then
    return 0;
  end if;
  for v_key in select jsonb_object_keys(p_parts)
  loop
    v_one := public.checkin_part_distance_meters(p_parts -> v_key);
    if v_one > v_max then
      v_max := v_one;
    end if;
  end loop;
  return v_max;
end;
$$;

create or replace function public.stamp_checkin_distance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.distance_meters := public.checkin_parts_distance_meters(new.proof_parts);
  return new;
end;
$$;

drop trigger if exists challenge_checkins_stamp_distance on public.challenge_checkins;
create trigger challenge_checkins_stamp_distance
before insert or update of proof_parts on public.challenge_checkins
for each row
execute function public.stamp_checkin_distance();

create or replace function public.sync_participant_distance_total()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.challenge_participants
  set distance_meters_total = coalesce((
    select sum(coalesce(k.distance_meters, 0))
    from public.challenge_checkins k
    where k.challenge_id = new.challenge_id
      and k.user_id = new.user_id
      and k.status = 'submitted'
      and k.submitted_at is not null
  ), 0)
  where challenge_id = new.challenge_id
    and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists challenge_checkins_sync_distance_total on public.challenge_checkins;
create trigger challenge_checkins_sync_distance_total
after insert or update of status, submitted_at, distance_meters on public.challenge_checkins
for each row
execute function public.sync_participant_distance_total();

create or replace function public.checkin_proofs_ready(ch public.challenges, p_parts jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  rec record;
  v_proofs jsonb;
  v_part jsonb;
  v_method text;
  v_needs boolean := false;
  v_required numeric;
begin
  v_proofs := coalesce(ch.proofs, '[]'::jsonb);
  if jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0 then
    for rec in select elem from jsonb_array_elements(v_proofs) elem
    loop
      v_method := coalesce(rec.elem->>'method', 'photo');
      if v_method = 'honor' then
        continue;
      end if;
      v_needs := true;
      v_part := coalesce(p_parts -> coalesce(rec.elem->>'id', ''), '{}'::jsonb);
      if v_method = 'checkin' then
        if coalesce(nullif(v_part->>'text', ''), nullif(v_part->>'url', ''), '') = '' then
          return false;
        end if;
      elsif v_method = 'hr' then
        if coalesce(v_part->>'url', '') = ''
           and coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id', '') = '' then
          return false;
        end if;
      elsif v_method = 'distance' then
        v_required := coalesce(
          nullif((rec.elem->>'distance_meters')::numeric, 0),
          nullif(ch.distance_meters_required, 0),
          1609.34
        );
        if public.checkin_part_distance_meters(v_part) < v_required then
          return false;
        end if;
      else
        if coalesce(v_part->>'url', '') = '' then
          return false;
        end if;
      end if;
    end loop;
    return true;
  end if;

  for rec in
    select coalesce(req->>'type', '') as proof_type
    from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
    where coalesce((req->>'required')::boolean, true)
  loop
    v_needs := true;
    if rec.proof_type = 'pre_selfie' and coalesce(p_parts->'pre'->>'url', p_parts->'pre_selfie'->>'url', '') = '' then
      return false;
    end if;
    if rec.proof_type = 'post_selfie' and coalesce(p_parts->'post'->>'url', p_parts->'post_selfie'->>'url', '') = '' then
      return false;
    end if;
    if rec.proof_type in ('hr_monitor', 'hr')
       and coalesce(p_parts->'hr'->>'url', p_parts->'hr_monitor'->>'url', '') = ''
       and coalesce(p_parts->'hr'->>'healthWorkoutId', p_parts->'hr'->>'health_workout_id', '') = '' then
      return false;
    end if;
    if rec.proof_type = 'distance'
       and public.checkin_part_distance_meters(
         coalesce(p_parts->'distance', p_parts->'miles', '{}'::jsonb)
       ) < coalesce(nullif(ch.distance_meters_required, 0), 1609.34) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.challenge_uses_total_count(ch public.challenges)
returns boolean
language sql
stable
as $$
  select
    coalesce(ch.scoring_method, '') is distinct from 'comparable_points'
    and coalesce(ch.challenge_type, '') is distinct from 'points'
    and coalesce(ch.is_official, false) = false
    and (
      public.challenge_is_cumulative(ch)
      or (
        coalesce(ch.frequency, 'daily') in ('once', 'custom')
        and coalesce(ch.target_count, 0) > 0
      )
    );
$$;

create or replace function public.checkin_open_row(
  ch public.challenges,
  p_uid uuid,
  p_period date
)
returns public.challenge_checkins
language plpgsql
as $$
declare
  v_row public.challenge_checkins%rowtype;
  v_slot int := 1;
  v_done int := 0;
  v_target int := 1;
begin
  v_row := public.checkin_current_row(ch, p_uid, p_period);
  if v_row.id is not null and (v_row.status is distinct from 'submitted' or v_row.submitted_at is null) then
    return v_row;
  end if;

  if v_row.id is not null then
    if public.challenge_is_cumulative(ch) then
      v_slot := coalesce(v_row.checkin_slot, 1) + 1;
    elsif not public.challenge_uses_total_count(ch) then
      return v_row;
    else
      select count(*)::int into v_done
      from public.challenge_checkins
      where challenge_id = ch.id
        and user_id = p_uid
        and status = 'submitted'
        and submitted_at is not null;
      v_target := greatest(coalesce(ch.target_count, 1), 1);
      if v_done >= v_target then
        return v_row;
      end if;
      v_slot := coalesce(v_row.checkin_slot, 1) + 1;
    end if;
  end if;

  insert into public.challenge_checkins (
    user_id, challenge_id, period_key, checkin_slot, status, proof_parts, scoring_version
  ) values (
    p_uid, ch.id, p_period, v_slot, 'in_progress', '{}'::jsonb, coalesce(ch.scoring_version, 1)
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.challenge_misses_allowed(ch public.challenges)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative') then 2147483647
    when public.challenge_is_cumulative(ch) then 2147483647
    when coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then 0
    else greatest(coalesce(ch.misses_allowed, 0), 0)
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
  select case
    when lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative') then false
    when public.challenge_is_cumulative(ch) then false
    else (
      select count(*)::int
      from public.challenge_period_misses m
      where m.challenge_id = ch.id and m.user_id = p_user_id
    ) >= public.challenge_misses_allowed(ch)
  end;
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
      and lower(coalesce(challenge_type, '')) not in ('points', 'cumulative')
      and coalesce(format, 'consistency') is distinct from 'cumulative'
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
      if lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative') then
        continue;
      end if;

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

create or replace function public.cumulative_participant_eligible(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_target numeric;
  v_window text;
  v_tz text;
  v_start date;
  v_end date;
  v_sum numeric;
  v_week date;
  v_day date;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or not public.challenge_is_cumulative(ch) then
    return false;
  end if;
  v_target := coalesce(ch.cumulative_target, 0);
  if v_target <= 0 then
    return false;
  end if;
  v_window := coalesce(ch.cumulative_window, 'challenge');
  v_tz := public.challenge_clock_tz(ch);
  v_start := coalesce((timezone(v_tz, ch.starts_at))::date, (timezone(v_tz, now()))::date);
  v_end := coalesce((timezone(v_tz, ch.ends_at))::date, (timezone(v_tz, now()))::date);
  if v_end < v_start then
    v_end := v_start;
  end if;

  if v_window = 'week' then
    for v_week in
      select distinct date_trunc('week', d::timestamp)::date
      from generate_series(v_start, v_end, interval '1 day') d
      order by 1
    loop
      select coalesce(sum(coalesce(k.distance_meters, 0)), 0) into v_sum
      from public.challenge_checkins k
      where k.challenge_id = p_challenge_id
        and k.user_id = p_user_id
        and k.status = 'submitted'
        and k.submitted_at is not null
        and (timezone(v_tz, k.submitted_at))::date >= v_week
        and (timezone(v_tz, k.submitted_at))::date < (v_week + 7);
      if v_sum < v_target then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if v_window = 'day' then
    for v_day in
      select d::date from generate_series(v_start, v_end, interval '1 day') d
    loop
      select coalesce(sum(coalesce(k.distance_meters, 0)), 0) into v_sum
      from public.challenge_checkins k
      where k.challenge_id = p_challenge_id
        and k.user_id = p_user_id
        and k.status = 'submitted'
        and k.submitted_at is not null
        and (timezone(v_tz, k.submitted_at))::date = v_day;
      if v_sum < v_target then
        return false;
      end if;
    end loop;
    return true;
  end if;

  select coalesce(sum(coalesce(k.distance_meters, 0)), 0) into v_sum
  from public.challenge_checkins k
  where k.challenge_id = p_challenge_id
    and k.user_id = p_user_id
    and k.status = 'submitted'
    and k.submitted_at is not null;
  return v_sum >= v_target;
end;
$$;

create or replace function public.mark_cumulative_ineligible(p_challenge_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_n int := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or not public.challenge_is_cumulative(ch) then
    return 0;
  end if;
  update public.challenge_participants p
  set
    status = 'eliminated',
    eliminated_at = coalesce(p.eliminated_at, now())
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
    and not public.cumulative_participant_eligible(p_challenge_id, p.user_id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.settlement_required_days(p_challenge public.challenges)
returns int
language sql
immutable
as $$
  select case
    when public.challenge_is_cumulative(p_challenge) then 1
    else greatest(
      coalesce(p_challenge.target_count, 0),
      coalesce(p_challenge.days_required, 0),
      coalesce(p_challenge.required_checkins, 0),
      1
    )
  end;
$$;

create or replace function public.settlement_proven_days(p_challenge_id uuid, p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_official boolean;
  v_days int := 0;
begin
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if public.challenge_is_cumulative(v_c) then
    return case when public.cumulative_participant_eligible(p_challenge_id, p_user_id) then 1 else 0 end;
  end if;
  v_official := coalesce(v_c.is_official, false);
  if v_official then
    begin
      return public.official_valid_day_count(p_challenge_id, p_user_id);
    exception when others then
      null;
    end;
  end if;
  select coalesce(days_completed, 0) into v_days
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;
  return coalesce(v_days, 0);
end;
$$;

create or replace function public.mark_cumulative_before_settle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('settling', 'ended', 'judging')
     and coalesce(old.status, '') is distinct from new.status then
    perform public.mark_cumulative_ineligible(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_mark_cumulative_before_settle on public.challenges;
create trigger challenges_mark_cumulative_before_settle
before update of status on public.challenges
for each row
execute function public.mark_cumulative_before_settle();

grant execute on function public.challenge_is_cumulative(public.challenges) to authenticated, service_role;
grant execute on function public.cumulative_participant_eligible(uuid, uuid) to authenticated, service_role;
grant execute on function public.mark_cumulative_ineligible(uuid) to service_role;
grant execute on function public.checkin_proofs_ready(public.challenges, jsonb) to authenticated;
grant execute on function public.sync_challenge_misses() to authenticated, service_role;
grant execute on function public.checkin_miss_would_eliminate(public.challenges, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
