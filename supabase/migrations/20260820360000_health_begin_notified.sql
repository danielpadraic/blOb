-- Health attach tables + dismiss / one-shot Begin notify flags.
-- Does not create log_health_workout. Check-in stays save_checkin_proof / submit_checkin.
-- Safe to re-run.

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null,
  last_synced_at timestamptz,
  hk_workout_anchor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  constraint health_connections_status_check check (status in ('connected', 'disconnected'))
);

create table if not exists public.health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_workout_id text not null,
  activity_type text not null,
  activity_label text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null,
  calories_kcal numeric,
  distance_m numeric,
  hr_avg numeric,
  hr_max numeric,
  source_bundle text,
  confidence text not null,
  raw_summary jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  begin_notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_workout_id),
  constraint health_workouts_confidence_check check (confidence in ('watch', 'phone', 'manual', 'unknown')),
  constraint health_workouts_duration_check check (duration_sec >= 0)
);

create table if not exists public.health_workout_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  started_at timestamptz not null,
  activity_type text,
  goal_seconds int,
  created_at timestamptz not null default now()
);

alter table public.health_connections
  add column if not exists hk_workout_anchor text,
  add column if not exists last_error text;

alter table public.health_workouts
  add column if not exists dismissed_at timestamptz,
  add column if not exists begin_notified_at timestamptz;

alter table public.health_connections drop constraint if exists health_connections_provider_check;
alter table public.health_connections
  add constraint health_connections_provider_check
  check (provider in ('apple_health', 'health_connect'));

alter table public.health_workouts drop constraint if exists health_workouts_provider_check;
alter table public.health_workouts
  add constraint health_workouts_provider_check
  check (provider in ('apple_health', 'health_connect'));

create index if not exists health_connections_user_idx
  on public.health_connections (user_id);
create index if not exists health_workouts_user_started_idx
  on public.health_workouts (user_id, started_at desc);
create index if not exists health_workout_starts_user_challenge_idx
  on public.health_workout_starts (user_id, challenge_id, started_at desc);

do $$
begin
  if to_regclass('public.workout_submissions') is not null then
    alter table public.workout_submissions
      add column if not exists health_workout_id uuid references public.health_workouts(id);
  end if;
  if to_regclass('public.challenge_checkins') is not null then
    alter table public.challenge_checkins
      add column if not exists health_workout_id uuid references public.health_workouts(id);
  end if;
end $$;

alter table public.health_connections enable row level security;
alter table public.health_workouts enable row level security;
alter table public.health_workout_starts enable row level security;

drop policy if exists "Owners manage their health connections" on public.health_connections;
create policy "Owners manage their health connections"
  on public.health_connections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners manage their health workouts" on public.health_workouts;
create policy "Owners manage their health workouts"
  on public.health_workouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners manage their workout starts" on public.health_workout_starts;
create policy "Owners manage their workout starts"
  on public.health_workout_starts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.health_connections to authenticated;
grant select, insert, update, delete on public.health_workouts to authenticated;
grant select, insert on public.health_workout_starts to authenticated;

comment on column public.health_workouts.dismissed_at is
  'User dismissed the forgot-to-Begin prompt for this workout. Never nag again.';
comment on column public.health_workouts.begin_notified_at is
  'Forgot-to-Begin local push already sent for this workout. Banner can still show until dismissed_at.';
comment on table public.health_workout_starts is
  'Owner-only Start on Watch taps. Matching prefers started_at >= this. No proof until confirm.';

notify pgrst, 'reload schema';
