-- Workout route on the session ledger.
--
-- The simplified GPS track for a workout, stored beside the numbers it belongs to. Null means
-- indoor, location denied, or too few fixes: there is no placeholder line and no default pin.
--
-- Privacy: this is the same visibility as the rest of the session. Owner reads and writes, official
-- review reads. The route does not reach the public profile or the You tab, and the dense raw track
-- is never stored — only the capped polyline that the proof card draws.
--
-- RLS is unchanged by this migration. No new grants.

alter table public.workout_sessions
  add column if not exists route jsonb;

comment on column public.workout_sessions.route is
  'Simplified GPS track: {kind:''gps'', activity, pointCount, polyline:[{lat,lng,t}], bounds, start, end}. Null for indoor or unavailable. Vendor attaches only; never set from a screenshot read.';

-- Keeps a malformed or oversized track out of the table. The client caps the line at 200 points, so
-- anything past 400 is a client that skipped simplification.
alter table public.workout_sessions
  drop constraint if exists workout_sessions_route_shape;

alter table public.workout_sessions
  add constraint workout_sessions_route_shape check (
    route is null
    or (
      jsonb_typeof(route) = 'object'
      and route ->> 'kind' = 'gps'
      and jsonb_typeof(route -> 'polyline') = 'array'
      and jsonb_array_length(route -> 'polyline') between 2 and 400
    )
  );

-- Only a device attach can produce coordinates. A screenshot read must never carry a route.
alter table public.workout_sessions
  drop constraint if exists workout_sessions_route_source;

alter table public.workout_sessions
  add constraint workout_sessions_route_source check (
    route is null
    or source in ('healthkit', 'health_connect')
  );

create index if not exists workout_sessions_route_idx
  on public.workout_sessions (user_id, started_at desc)
  where route is not null;
