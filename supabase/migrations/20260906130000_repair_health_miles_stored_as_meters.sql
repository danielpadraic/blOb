-- Every HealthKit attach made before this migration recorded a mile count in a meters column.
-- react-native-health returns HKWorkout.totalDistance in miles with no unit option, and the client
-- filed that number straight into distance_m, so a 6.24 mi walk was stored as "6" and the proof card
-- rendered it as 0.00 mi. The client now converts on ingest; this repairs what the old build wrote.
--
-- health_workouts is the upstream record and kept full precision (6.239738933788446), so the true
-- distance is recoverable from it. The generated card image is not recoverable — its numbers are
-- pixels — so sessions whose card no longer matches their own row are flagged, and the app redraws
-- them on next open.

-- A recorded session never averages this slowly. 0.15 m/s is 0.34 mph, below any real walk and
-- three orders of magnitude away from the values the bug produced, so there is no borderline case
-- where a genuinely short workout is multiplied by mistake. The second bound is what makes this
-- safe to re-run: once a row holds meters its speed is plausible, so it stops qualifying.
create or replace function public.health_distance_is_miles_not_meters(
  p_distance numeric,
  p_duration integer
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_distance, 0) > 0
     and coalesce(p_duration, 0) >= 60
     and p_distance / p_duration < 0.15
     and (p_distance * 1609.344) / p_duration between 0.15 and 30;
$$;

comment on function public.health_distance_is_miles_not_meters(numeric, integer) is
  'True when a stored distance is implausibly slow for its own duration, which only happens when miles were written into a meters column.';

alter table public.workout_sessions
  add column if not exists card_needs_redraw boolean not null default false;

comment on column public.workout_sessions.card_needs_redraw is
  'True when the stored proof card image shows numbers this row no longer agrees with. The app redraws the card on next open and clears the flag.';

-- 1. The upstream vendor record, which still holds the precise mileage.
update public.health_workouts
set distance_m = round((distance_m * 1609.344)::numeric, 3),
    raw_summary = case
      when jsonb_typeof(raw_summary -> 'distance') = 'number'
        then jsonb_set(
          raw_summary,
          '{distance}',
          to_jsonb(round((distance_m * 1609.344)::numeric, 3))
        )
      else raw_summary
    end
where public.health_distance_is_miles_not_meters(distance_m, duration_sec);

-- 2. The check-in snapshots. Updating proof_parts is enough on its own: the existing
-- challenge_checkins_stamp_distance trigger recomputes challenge_checkins.distance_meters, and
-- challenge_checkins_sync_distance_total then recomputes the participant total behind the goal ring.
do $$
declare
  r record;
  v_slot text;
  v_part jsonb;
  v_parts jsonb;
  v_meters numeric;
  v_changed boolean;
begin
  for r in
    select c.id, c.proof_parts
    from public.challenge_checkins c
    where jsonb_typeof(c.proof_parts) = 'object'
  loop
    v_parts := r.proof_parts;
    v_changed := false;

    for v_slot, v_part in select key, value from jsonb_each(r.proof_parts)
    loop
      continue when jsonb_typeof(v_part -> 'health' -> 'distanceMeters') is distinct from 'number';
      continue when not public.health_distance_is_miles_not_meters(
        (v_part -> 'health' ->> 'distanceMeters')::numeric,
        nullif(v_part -> 'health' ->> 'durationSec', '')::integer
      );

      -- Prefer the vendor row: it kept the decimals this copy rounded away.
      select round(hw.distance_m) into v_meters
      from public.health_workouts hw
      where hw.id = nullif(v_part ->> 'healthWorkoutId', '')::uuid;

      if coalesce(v_meters, 0) <= 0 then
        v_meters := round((v_part -> 'health' ->> 'distanceMeters')::numeric * 1609.344);
      end if;

      v_parts := jsonb_set(v_parts, array[v_slot, 'health', 'distanceMeters'], to_jsonb(v_meters));
      v_changed := true;
    end loop;

    if v_changed then
      update public.challenge_checkins set proof_parts = v_parts where id = r.id;
    end if;
  end loop;
end;
$$;

-- 3. The workout ledger, and the flag that asks the app to draw the card again.
--
-- The ledger copy was rounded to whole miles when it was written, so converting it in place would
-- report 6.00 mi for a 6.24 mi walk. Where the session belongs to a check-in that names a vendor
-- workout, the decimals are taken back from that row instead.
update public.workout_sessions ws
set distance_m = link.meters,
    card_needs_redraw = true,
    updated_at = now()
from (
  select distinct c.id as checkin_id, round(hw.distance_m) as meters
  from public.challenge_checkins c
  cross join jsonb_each(c.proof_parts) as part(key, value)
  join public.health_workouts hw
    on hw.id = nullif(part.value ->> 'healthWorkoutId', '')::uuid
  where jsonb_typeof(c.proof_parts) = 'object'
    and coalesce(hw.distance_m, 0) > 0
) as link
where ws.checkin_id = link.checkin_id
  and public.health_distance_is_miles_not_meters(ws.distance_m, ws.duration_sec);

-- Anything the vendor row could not be found for still gets the unit fixed, at whole-mile accuracy.
update public.workout_sessions
set distance_m = round((distance_m * 1609.344)::numeric),
    card_needs_redraw = true,
    updated_at = now()
where public.health_distance_is_miles_not_meters(distance_m, duration_sec);

-- 4. The cumulative total behind the goal ring.
--
-- challenge_checkins_sync_distance_total is declared "after update of distance_meters", and Postgres
-- decides that from the columns named in the statement, not from the values that actually changed.
-- Step 2 named only proof_parts, so the BEFORE trigger restamped distance_meters without waking the
-- total. It is recomputed here the same way that trigger would, which also makes this re-runnable.
update public.challenge_participants cp
set distance_meters_total = totals.meters
from (
  select cp2.challenge_id,
         cp2.user_id,
         coalesce((
           select sum(coalesce(k.distance_meters, 0))
           from public.challenge_checkins k
           where k.challenge_id = cp2.challenge_id
             and k.user_id = cp2.user_id
             and k.status = 'submitted'
             and k.submitted_at is not null
         ), 0) as meters
  from public.challenge_participants cp2
) as totals
where cp.challenge_id = totals.challenge_id
  and cp.user_id = totals.user_id
  and cp.distance_meters_total is distinct from totals.meters;

-- 5. The stat chips on the feed post, brought back in line with the check-in they describe.
update public.posts p
set checkin_stats = jsonb_set(
      p.checkin_stats,
      '{distance_m}',
      to_jsonb(round(c.distance_meters))
    )
from public.challenge_checkins c
where c.id = p.checkin_id
  and jsonb_typeof(p.checkin_stats -> 'distance_m') = 'number'
  and coalesce(c.distance_meters, 0) > 0
  and (p.checkin_stats ->> 'distance_m')::numeric <> round(c.distance_meters);
