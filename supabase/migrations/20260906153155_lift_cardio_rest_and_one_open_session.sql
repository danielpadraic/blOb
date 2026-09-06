-- Lift: one open session per user, cardio and rest rows, copy provenance, demo clips.
--
-- Four things change here.
--
-- 1. A user gets ONE session in progress. The tapes show three sessions created in four minutes
--    because every "Use last session" and every Continue inserted a new row. A partial unique index
--    now makes a second open session impossible, and the RPCs adopt the open one instead of racing
--    it.
-- 2. An exercise row can be strength, cardio, or rest. Cardio and rest are rows, not a separate
--    screen, so they can sit between two bench sets as well as in a group of their own.
-- 3. A copied session records who it came from, so the card can say "From Daniel" without the
--    reader needing permission to open the original.
-- 4. One demo clip per user per exercise.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Cardio and Rest are muscle groups, so they can be picked as their own section
-- ---------------------------------------------------------------------------

create or replace function public.is_lift_muscle_key(p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_key in (
    'chest', 'back', 'shoulders', 'traps', 'biceps', 'triceps', 'forearms',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'olympic',
    'cardio', 'rest'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Session status, and the one-open-session guarantee
-- ---------------------------------------------------------------------------

alter table public.lift_sessions
  add column if not exists status text not null default 'open',
  add column if not exists source_user_id uuid references public.profiles(id) on delete set null;

comment on column public.lift_sessions.status is
  'open = in progress and editable. saved = finished and on History. One open session per user.';
comment on column public.lift_sessions.source_user_id is
  'Owner of the session this was copied from, so a copy can say "From {name}" without reading it.';

update public.lift_sessions
   set status = case when completed_at is null then 'open' else 'saved' end
 where status is distinct from (case when completed_at is null then 'open' else 'saved' end);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lift_sessions_status_allowed'
  ) then
    alter table public.lift_sessions
      add constraint lift_sessions_status_allowed check (status in ('open', 'saved'));
  end if;
end $$;

-- Collapse the backlog before the index can reject it. An abandoned empty session is noise and
-- goes; anything with real work in it is finished and kept, because losing a logged set to a
-- migration would be worse than an extra History card.
delete from public.lift_sessions s
 where s.status = 'open'
   and not exists (
     select 1 from public.lift_session_exercises e where e.session_id = s.id
   );

update public.lift_sessions s
   set status = 'saved',
       completed_at = coalesce(s.completed_at, s.updated_at, now())
 where s.status = 'open'
   and s.id <> (
     select k.id
       from public.lift_sessions k
      where k.user_id = s.user_id and k.status = 'open'
      order by k.performed_at desc, k.created_at desc
      limit 1
   );

create unique index if not exists lift_sessions_one_open_per_user
  on public.lift_sessions (user_id)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- 3. Cardio and rest rows
-- ---------------------------------------------------------------------------

alter table public.lift_session_exercises
  add column if not exists kind text not null default 'strength',
  add column if not exists cardio_method text,
  add column if not exists cardio_custom_name text,
  add column if not exists cardio_type text,
  add column if not exists duration_seconds integer,
  add column if not exists intensity integer,
  add column if not exists demo_url text;

comment on column public.lift_session_exercises.kind is
  'strength = weight and reps. cardio = method, type, duration, intensity. rest = duration only.';
comment on column public.lift_session_exercises.cardio_custom_name is
  'Private label for method "other". Never joins the shared cardio catalog.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lift_session_exercises_kind_allowed') then
    alter table public.lift_session_exercises
      add constraint lift_session_exercises_kind_allowed
      check (kind in ('strength', 'cardio', 'rest'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lift_session_exercises_cardio_type_allowed') then
    alter table public.lift_session_exercises
      add constraint lift_session_exercises_cardio_type_allowed
      check (
        cardio_type is null
        or cardio_type in ('warmup', 'steady', 'sprint', 'interval', 'cooldown')
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lift_session_exercises_intensity_range') then
    alter table public.lift_session_exercises
      add constraint lift_session_exercises_intensity_range
      check (intensity is null or (intensity between 1 and 10));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'lift_session_exercises_duration_range') then
    alter table public.lift_session_exercises
      add constraint lift_session_exercises_duration_range
      check (duration_seconds is null or (duration_seconds between 0 and 86400));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The official cardio catalog
-- ---------------------------------------------------------------------------

create table if not exists public.lift_cardio_methods (
  id text primary key,
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.lift_cardio_methods is
  'Shared list of cardio modalities. Read-only to clients; "other" carries a private name instead.';

insert into public.lift_cardio_methods (id, name, sort) values
  ('treadmill', 'Treadmill', 10),
  ('incline-treadmill-walk', 'Incline Treadmill Walk', 20),
  ('curved-treadmill', 'Curved Treadmill', 30),
  ('air-runner', 'Assault / Air Runner', 40),
  ('outdoor-run', 'Outdoor Run', 50),
  ('outdoor-walk', 'Outdoor Walk', 60),
  ('trail-run', 'Trail Run', 70),
  ('hiking', 'Hiking', 80),
  ('ruck', 'Ruck', 90),
  ('stadium-stairs', 'Stadium Stairs', 100),
  ('air-bike', 'Air Bike', 110),
  ('fan-bike', 'Fan Bike', 120),
  ('stationary-bike', 'Stationary Bike', 130),
  ('spin-bike', 'Spin Bike', 140),
  ('recumbent-bike', 'Recumbent Bike', 150),
  ('outdoor-bike', 'Outdoor Bike', 160),
  ('row-machine', 'Row Machine', 170),
  ('ski-erg', 'SkiErg', 180),
  ('arm-ergometer', 'Arm Ergometer', 190),
  ('elliptical', 'Elliptical', 200),
  ('stair-climber', 'Stair Climber', 210),
  ('jacobs-ladder', 'Jacob''s Ladder', 220),
  ('versaclimber', 'VersaClimber', 230),
  ('jump-rope', 'Jump Rope', 240),
  ('battle-ropes', 'Battle Ropes', 250),
  ('sled-push', 'Sled Push', 260),
  ('sled-pull', 'Sled Pull', 270),
  ('farmer-carry', 'Farmer Carry', 280),
  ('kettlebell-swings', 'Kettlebell Swings', 290),
  ('wall-balls', 'Wall Balls', 300),
  ('box-step-ups', 'Box Step-Ups', 310),
  ('mountain-climbers', 'Mountain Climbers', 320),
  ('burpees', 'Burpees', 330),
  ('jumping-jacks', 'Jumping Jacks', 340),
  ('high-knees', 'High Knees', 350),
  ('butt-kicks', 'Butt Kicks', 360),
  ('jumping-lunges', 'Jumping Lunges', 370),
  ('skaters', 'Skaters', 380),
  ('broad-jumps', 'Broad Jumps', 390),
  ('bear-crawl', 'Bear Crawl', 400),
  ('agility-ladder', 'Agility Ladder', 410),
  ('shadow-boxing', 'Shadow Boxing', 420),
  ('heavy-bag', 'Heavy Bag', 430),
  ('speed-bag', 'Speed Bag', 440),
  ('kickboxing-cardio', 'Kickboxing Cardio', 450),
  ('swim', 'Swim', 460),
  ('pool-run', 'Pool Run', 470),
  ('water-aerobics', 'Water Aerobics', 480),
  ('dance-cardio', 'Dance Cardio', 490),
  ('aerobics', 'Aerobics', 500),
  ('circuit', 'Circuit', 510),
  ('mixed-modal', 'Mixed Modal', 520),
  ('other', 'Other', 9999)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

alter table public.lift_cardio_methods enable row level security;

drop policy if exists "Cardio methods are readable" on public.lift_cardio_methods;
create policy "Cardio methods are readable"
  on public.lift_cardio_methods for select
  to authenticated
  using (true);

revoke all on public.lift_cardio_methods from anon, authenticated;
grant select on public.lift_cardio_methods to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One demo clip per user per exercise
-- ---------------------------------------------------------------------------

create table if not exists public.lift_exercise_demos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The catalog slug, or 'custom:<uuid>' for a private exercise. One key either way.
  exercise_key text not null,
  video_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_key)
);

comment on table public.lift_exercise_demos is
  'At most one demo clip per user per exercise. Replacing overwrites; removing clears only theirs.';

alter table public.lift_exercise_demos enable row level security;

drop policy if exists "Own demos are readable" on public.lift_exercise_demos;
create policy "Own demos are readable"
  on public.lift_exercise_demos for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Own demos are writable" on public.lift_exercise_demos;
create policy "Own demos are writable"
  on public.lift_exercise_demos for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.lift_exercise_demos from anon, authenticated;
grant select, insert, update, delete on public.lift_exercise_demos to authenticated;

