-- Allow Health Connect alongside Apple Health on the shared proof tables.
-- No new tables. log_health_workout already keys off health_workout_id.

alter table public.health_connections
  drop constraint if exists health_connections_provider_check;

alter table public.health_connections
  add constraint health_connections_provider_check
  check (provider in ('apple_health', 'health_connect'));

alter table public.health_workouts
  drop constraint if exists health_workouts_provider_check;

alter table public.health_workouts
  add constraint health_workouts_provider_check
  check (provider in ('apple_health', 'health_connect'));

comment on table public.health_connections is
  'Owner-only Health connection flag (Apple Health or Health Connect). Disconnect stops future reads; existing proofs stay.';

notify pgrst, 'reload schema';
