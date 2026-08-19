-- Apple Health Phase 2: anchored sync + dismiss memory. Proofs are never deleted.

alter table public.health_connections
  add column if not exists hk_workout_anchor text,
  add column if not exists last_error text;

alter table public.health_workouts
  add column if not exists dismissed_at timestamptz;

comment on column public.health_connections.hk_workout_anchor is
  'Serialized HKQueryAnchor for incremental workout sync. Apple Health only.';
comment on column public.health_connections.last_error is
  'User-facing sync failure. Never store HealthKit / PostgREST strings.';
comment on column public.health_workouts.dismissed_at is
  'User dismissed the next-open prompt for this workout. Never nag again. Proofs stay.';

notify pgrst, 'reload schema';
