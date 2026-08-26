-- Points challenges never drop someone for skipping a calendar day.
-- Consistency + official miss-tick behavior is unchanged.

create or replace function public.challenge_misses_allowed(ch public.challenges)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(ch.challenge_type, '')) = 'points' then 2147483647
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
    when lower(coalesce(ch.challenge_type, '')) = 'points' then false
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
      and lower(coalesce(challenge_type, '')) is distinct from 'points'
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
      if lower(coalesce(ch.challenge_type, '')) = 'points' then
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

grant execute on function public.sync_challenge_misses() to authenticated, service_role;
grant execute on function public.checkin_miss_would_eliminate(public.challenges, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
