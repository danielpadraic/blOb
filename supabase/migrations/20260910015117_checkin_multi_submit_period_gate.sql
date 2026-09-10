-- Check In period gate: consistency stays one live row per challenge-tz period.
-- Points / distance / goal / cumulative (including a miles target on metrics)
-- may insert a new check-in + Live post on each Send. Does not change settlement
-- math, wallets, OCR, or save_checkin_proof / submit_checkin signatures.

create or replace function public.challenge_is_quantity_or_points_race(ch public.challenges)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    lower(coalesce(ch.format, '')) in ('points', 'cumulative', 'distance', 'goal')
    or lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative', 'distance', 'goal')
    or public.challenge_is_cumulative(ch)
    or coalesce(ch.cumulative_target, 0) > 0
    or coalesce(ch.title, '') ~* '[1-9][0-9]+(\.[0-9]+)?\s*(mi|miles?)\b'
    or coalesce(ch.task, '') ~* '[1-9][0-9]+(\.[0-9]+)?\s*(mi|miles?)\b'
    or (
      jsonb_typeof(coalesce(ch.metrics, '[]'::jsonb)) = 'array'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(ch.metrics, '[]'::jsonb)) elem
        where case
          when jsonb_typeof(elem->'target') = 'number' then (elem->>'target')::numeric
          when coalesce(elem->>'target', '') ~ '^[0-9]+(\.[0-9]+)?$' then (elem->>'target')::numeric
          else 0
        end > 0
      )
    );
$$;

comment on function public.challenge_is_quantity_or_points_race(public.challenges) is
  'True when Check In is a quantity / points / cumulative race — not a daily stamp.';

create or replace function public.challenge_allows_multi_checkin(ch public.challenges)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.challenge_is_quantity_or_points_race(ch)
      or public.challenge_uses_total_count(ch);
$$;

comment on function public.challenge_allows_multi_checkin(public.challenges) is
  'True when a second submitted check-in may exist on the same period_key.';

create or replace function public.checkin_open_row(
  ch public.challenges,
  p_uid uuid,
  p_period date
)
returns public.challenge_checkins
language plpgsql
set search_path = public, pg_temp
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
    if not public.challenge_allows_multi_checkin(ch) then
      return v_row;
    end if;
    if public.challenge_is_quantity_or_points_race(ch) then
      v_slot := coalesce(v_row.checkin_slot, 1) + 1;
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

grant execute on function public.challenge_is_quantity_or_points_race(public.challenges) to authenticated;
grant execute on function public.challenge_allows_multi_checkin(public.challenges) to authenticated;
grant execute on function public.checkin_open_row(public.challenges, uuid, date) to authenticated;
