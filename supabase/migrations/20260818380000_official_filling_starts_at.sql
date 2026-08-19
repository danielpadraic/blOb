-- Filling Official instances have no window until they go live.
alter table public.challenges alter column starts_at drop not null;
alter table public.challenges alter column ends_at drop not null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'challenges'
      and c.contype = 'c'
      and (
        pg_get_constraintdef(c.oid) ilike '%ends_at > starts_at%'
        or pg_get_constraintdef(c.oid) ilike '%challenge_window%'
        or pg_get_constraintdef(c.oid) ilike '%ends_at is not null%'
        or (
          pg_get_constraintdef(c.oid) ilike '%status%'
          and pg_get_constraintdef(c.oid) not ilike '%filling%'
        )
      )
  loop
    execute format('alter table public.challenges drop constraint if exists %I', r.conname);
  end loop;
end $$;

do $$
declare
  d text;
begin
  select pg_get_constraintdef(oid) into d
  from pg_constraint
  where conname = 'challenges_lane_money_safety_check';
  raise notice 'lane_money_safety: %', coalesce(d, 'missing');
end $$;

do $$
declare
  d text;
begin
  select pg_get_constraintdef(oid) into d
  from pg_constraint
  where conname = 'challenges_lane_money_safety_check';
  if d is not null then
    execute 'alter table public.challenges drop constraint challenges_lane_money_safety_check';
  end if;
end $$;

alter table public.challenges drop constraint if exists challenges_lane_allowed;
alter table public.challenges add constraint challenges_lane_allowed
  check (challenge_lane is null or challenge_lane in ('coins', 'private', 'official'));

alter table public.challenges add constraint challenges_lane_money_safety_check
  check (
    coalesce(is_official, false)
    or challenge_lane is null
    or (challenge_lane = 'coins' and currency = 'coins')
    or (challenge_lane = 'private')
    or (challenge_lane = 'official')
  );

alter table public.challenges drop constraint if exists challenges_status_check;
alter table public.challenges drop constraint if exists challenges_status_allowed;
alter table public.challenges add constraint challenges_status_allowed
  check (status in (
    'draft', 'upcoming', 'open', 'starting', 'in_progress', 'filling', 'arming', 'live',
    'ended', 'judging', 'distributing', 'settled', 'cancelled_underfilled', 'cancelled'
  ));

do $$
begin
  perform public.tick_official_series();
exception when others then
  raise exception 'official series tick failed: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
