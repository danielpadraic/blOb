-- Phase 3: remember Start on Watch so Phase 2 matching prefers that session.
-- Never writes a proof. Owner only.

create table if not exists public.health_workout_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  started_at timestamptz not null,
  activity_type text,
  goal_seconds int,
  created_at timestamptz not null default now()
);

create index if not exists health_workout_starts_user_challenge_idx
  on public.health_workout_starts (user_id, challenge_id, started_at desc);

comment on table public.health_workout_starts is
  'Owner-only Start on Watch taps. Matching prefers health_workouts.started_at >= this. No proof until confirm.';

alter table public.health_workout_starts enable row level security;

drop policy if exists "Owners manage their workout starts" on public.health_workout_starts;
create policy "Owners manage their workout starts"
  on public.health_workout_starts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert on public.health_workout_starts to authenticated;

notify pgrst, 'reload schema';
