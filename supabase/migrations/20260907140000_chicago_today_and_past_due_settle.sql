-- Chicago calendar day from now(), not UTC wall-clock treated as Chicago.
-- Past-due Live settles even if nobody opens Overview. Past-due Upcoming that
-- never went live uses the existing underfilled refund. credits follow coins.

create or replace function public.chicago_today()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('America/Chicago', now()))::date;
$$;

create or replace function public.sync_profile_credits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.credits := new.coins;
  return new;
end;
$$;

drop trigger if exists profiles_credits_follow_coins on public.profiles;
create trigger profiles_credits_follow_coins
before insert or update of coins, credits on public.profiles
for each row
execute procedure public.sync_profile_credits();

update public.profiles
set credits = coins
where credits is distinct from coins;

create or replace function public.format_start_roll_when(p_at timestamptz, p_tz text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'America/Denver');
begin
  begin
    return trim(to_char(p_at at time zone v_tz, 'FMMon FMDD'));
  exception when others then
    return trim(to_char(p_at at time zone 'America/Denver', 'FMMon FMDD'));
  end;
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
      and not coalesce(c.is_callout, false)
      and c.status in ('upcoming', 'open')
      and c.ends_at is not null
      and now() >= c.ends_at
      and c.official_started_at is null
    for update skip locked
  loop
    begin
      update public.challenges
      set status = 'cancelled_underfilled', updated_at = now()
      where id = rec.id
        and status in ('upcoming', 'open')
        and distributed_at is null
        and official_started_at is null;
      perform public.refund_challenge_underfilled(rec.id);
    exception
      when others then
        raise log 'underfilled skip challenge_id=% sqlstate=% sqlerrm=%',
          rec.id, sqlstate, sqlerrm;
    end;
  end loop;

  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and not coalesce(c.is_callout, false)
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and not coalesce(c.is_unlimited, false)
      and public.settlement_clock_ended(c)
    for update skip locked
  loop
    select * into v_c from public.challenges where id = rec.id;
    if not found then
      continue;
    end if;
    if coalesce(v_c.is_callout, false) then
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

grant execute on function public.tick_settlements() to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid)
      from cron.job j
      where j.jobname = 'tick-settlements';
    exception when others then
      null;
    end;
    perform cron.schedule(
      'tick-settlements',
      '* * * * *',
      'select public.tick_settlements()'
    );
  end if;
exception when others then
  raise notice 'pg_cron skipped: %', sqlerrm;
end $$;

do $$
begin
  perform public.tick_settlements();
exception when others then
  raise notice 'tick_settlements backfill: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
