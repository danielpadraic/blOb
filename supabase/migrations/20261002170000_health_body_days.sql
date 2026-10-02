-- Last phone snapshot of body numbers for the Fitness dashboard.
-- Web reads this. The phone writes it. A missing number stays null, never a stored zero.

create table if not exists public.health_body_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  provider text not null check (provider in ('apple_health', 'health_connect')),
  steps numeric,
  calories numeric,
  stand_hours numeric,
  move_kcal numeric,
  exercise_min numeric,
  sleep_min numeric,
  heart_rate numeric,
  synced_at timestamptz not null default now(),
  primary key (user_id, day)
);

comment on table public.health_body_days is
  'Owner-only daily body totals from HealthKit or Health Connect. Web shows the last phone sync.';

alter table public.health_body_days enable row level security;

drop policy if exists "Owners read their body days" on public.health_body_days;
create policy "Owners read their body days"
  on public.health_body_days
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owners insert their body days" on public.health_body_days;
create policy "Owners insert their body days"
  on public.health_body_days
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Owners update their body days" on public.health_body_days;
create policy "Owners update their body days"
  on public.health_body_days
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.health_body_days to authenticated;
