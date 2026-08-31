-- Pay only after the real end (saved duration, not a short ends_at) plus a 2-hour proof-review window.
-- Do not settle on last check-in. Do not rewrite settled rows (TEST stays).

create or replace function public.settlement_saved_duration_days(ch public.challenges)
returns int
language sql
immutable
set search_path = public
as $$
  select greatest(
    coalesce(
      case
        when lower(coalesce((ch).length_unit, '')) like 'week%' then coalesce((ch).length_value, 0) * 7
        when lower(coalesce((ch).length_unit, '')) like 'month%' then coalesce((ch).length_value, 0) * 30
        else coalesce((ch).length_value, 0)
      end,
      0
    ),
    coalesce((ch).days_required, 0),
    0
  );
$$;

create or replace function public.settlement_effective_ends_at(ch public.challenges)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce((ch).is_unlimited, false) then null
    when (ch).starts_at is not null
      and public.settlement_saved_duration_days(ch) > 0
      and (ch).ends_at is not null then
      greatest((ch).ends_at, (ch).starts_at + (public.settlement_saved_duration_days(ch) * interval '1 day'))
    when (ch).starts_at is not null and public.settlement_saved_duration_days(ch) > 0 then
      (ch).starts_at + (public.settlement_saved_duration_days(ch) * interval '1 day')
    else (ch).ends_at
  end;
$$;

create or replace function public.settlement_review_window()
returns interval
language sql
immutable
as $$
  select interval '2 hours';
$$;

create or replace function public.settlement_review_ready_at(ch public.challenges)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when public.settlement_effective_ends_at(ch) is null then null
    else public.settlement_effective_ends_at(ch) + public.settlement_review_window()
  end;
$$;

create or replace function public.settlement_clock_ended(p_challenge public.challenges)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.settlement_effective_ends_at(p_challenge) is not null
    and now() >= public.settlement_effective_ends_at(p_challenge);
$$;

create or replace function public.settlement_review_ready(p_challenge public.challenges)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.settlement_review_ready_at(p_challenge) is not null
    and now() >= public.settlement_review_ready_at(p_challenge);
$$;

create or replace function public.settlement_should_run(p_challenge public.challenges)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_challenge.distributed_at is not null or p_challenge.status = 'settled' then
    return false;
  end if;
  if p_challenge.status in ('cancelled', 'cancelled_underfilled', 'draft') then
    return false;
  end if;
  if coalesce(p_challenge.is_unlimited, false)
     or lower(coalesce(p_challenge.end_mode, '')) = 'indefinite_lms'
     or lower(coalesce(p_challenge.format, '')) = 'lms'
     or lower(coalesce(p_challenge.challenge_type, '')) = 'lms' then
    return false;
  end if;
  if public.settlement_is_illegal_pair(p_challenge) then
    return false;
  end if;
  -- Never pay on last check-in. Wait until real end + 2 hour review window.
  if not public.settlement_review_ready(p_challenge) then
    raise log 'settlement skip review_window challenge_id=% ready_at=% now=%',
      p_challenge.id,
      public.settlement_review_ready_at(p_challenge),
      now();
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.tick_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_c public.challenges%rowtype;
  v_ready timestamptz;
begin
  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and not coalesce(c.is_unlimited, false)
      and public.settlement_clock_ended(c)
    for update skip locked
  loop
    select * into v_c from public.challenges where id = rec.id;
    if not found then
      continue;
    end if;
    if v_c.status = 'settled' or v_c.distributed_at is not null then
      continue;
    end if;
    if v_c.status in ('live', 'in_progress') then
      update public.challenges
      set status = 'ended', updated_at = now()
      where id = rec.id
        and status in ('live', 'in_progress')
        and distributed_at is null;
    end if;
    if not public.settlement_should_run(v_c) then
      v_ready := public.settlement_review_ready_at(v_c);
      raise log 'settlement skip review_window challenge_id=% ready_at=% now=%',
        rec.id, v_ready, now();
      continue;
    end if;
    begin
      update public.challenges
      set status = 'settling', updated_at = now()
      where id = rec.id and status is distinct from 'settled';
      perform public.settle_ended_challenge(rec.id);
    exception
      when others then
        raise log 'settlement skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;
end;
$$;

revoke all on function public.settlement_saved_duration_days(public.challenges) from public, anon;
revoke all on function public.settlement_effective_ends_at(public.challenges) from public, anon;
revoke all on function public.settlement_review_window() from public, anon;
revoke all on function public.settlement_review_ready_at(public.challenges) from public, anon;
revoke all on function public.settlement_review_ready(public.challenges) from public, anon;

grant execute on function public.settlement_saved_duration_days(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_effective_ends_at(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_review_window() to authenticated, service_role;
grant execute on function public.settlement_review_ready_at(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_review_ready(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_clock_ended(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_should_run(public.challenges) to authenticated, service_role;
grant execute on function public.tick_settlements() to authenticated, service_role;
