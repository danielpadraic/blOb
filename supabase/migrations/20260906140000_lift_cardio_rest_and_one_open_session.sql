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

-- ---------------------------------------------------------------------------
-- 6. Starting a session adopts the open one instead of adding another
-- ---------------------------------------------------------------------------

create or replace function public.start_lift_session(
  p_muscle_keys text[],
  p_unit text default 'lb'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_open uuid;
  v_keys text[] := coalesce(p_muscle_keys, '{}');
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  if not public.are_lift_muscle_keys(v_keys) then
    raise exception 'Unknown muscle group.' using errcode = '22023';
  end if;

  -- Picking Back while a Chest session is still open widens that session rather than opening a
  -- second one. This is the whole point of the single-open-session rule: there is one place your
  -- sets can land, so no tap can strand work in a row you will never see again.
  select id into v_open
    from public.lift_sessions
   where user_id = v_user and status = 'open'
   limit 1;

  if v_open is not null then
    update public.lift_sessions
       set muscle_keys = (
             select coalesce(array_agg(distinct key), '{}')
               from unnest(muscle_keys || v_keys) as key
           ),
           unit = case when p_unit = 'kg' then 'kg' else 'lb' end,
           updated_at = now()
     where id = v_open;
    return v_open;
  end if;

  insert into public.lift_sessions (user_id, muscle_keys, unit, status)
  values (v_user, v_keys, case when p_unit = 'kg' then 'kg' else 'lb' end, 'open')
  returning id into v_open;

  return v_open;
end;
$$;

revoke all on function public.start_lift_session(text[], text) from public, anon;
grant execute on function public.start_lift_session(text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Saving: status, cardio rows, demo urls, and who the copy came from
-- ---------------------------------------------------------------------------

create or replace function public.save_lift_session(
  p_id uuid,
  p_title text,
  p_performed_at timestamptz,
  p_muscle_keys text[],
  p_unit text,
  p_completed boolean,
  p_exercises jsonb,
  p_source_session_id uuid default null,
  p_overload_from_session_id uuid default null,
  p_overload_summary jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_row_id uuid;
  v_exercise_id text;
  v_custom_id uuid;
  v_source_id uuid;
  v_source_user uuid;
  v_overload_id uuid;
  v_kind text;
  v_method text;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  if not public.are_lift_muscle_keys(coalesce(p_muscle_keys, '{}')) then
    raise exception 'Unknown muscle group.' using errcode = '22023';
  end if;

  -- Provenance the caller cannot back up is dropped rather than rejected. Every autosave re-sends
  -- these ids, so raising here would break logging; and silently storing an unreadable id would let
  -- the column be used to probe for sessions that are none of the caller's business.
  if p_source_session_id is not null then
    select s.user_id into v_source_user
      from public.lift_sessions s
     where s.id = p_source_session_id
       and public.lift_session_readable(s.id, s.user_id);
    v_source_id := case when v_source_user is null then null else p_source_session_id end;
  end if;

  -- Overload bumps your own numbers. A friend's card can supply structure, never a starting load.
  if p_overload_from_session_id is not null
    and exists (
      select 1 from public.lift_sessions s
      where s.id = p_overload_from_session_id and s.user_id = v_user
    ) then
    v_overload_id := p_overload_from_session_id;
  end if;

  -- Opening a new session finishes whatever was already open. Without this the unique index would
  -- reject the save, and the user would be stuck behind an error they cannot act on.
  if not coalesce(p_completed, false) then
    select id into v_existing
      from public.lift_sessions
     where user_id = v_user and status = 'open' and id is distinct from p_id
     limit 1;

    if v_existing is not null then
      if exists (select 1 from public.lift_session_exercises where session_id = v_existing) then
        update public.lift_sessions
           set status = 'saved', completed_at = coalesce(completed_at, now()), updated_at = now()
         where id = v_existing;
      else
        delete from public.lift_sessions where id = v_existing;
      end if;
    end if;
  end if;

  insert into public.lift_sessions (
    id, user_id, title, performed_at, completed_at, status, muscle_keys, unit,
    source_session_id, source_user_id, overload_from_session_id, overload_summary
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    v_user,
    left(nullif(btrim(coalesce(p_title, '')), ''), 120),
    coalesce(p_performed_at, now()),
    case when p_completed then now() else null end,
    case when p_completed then 'saved' else 'open' end,
    coalesce(p_muscle_keys, '{}'),
    case when p_unit = 'kg' then 'kg' else 'lb' end,
    v_source_id,
    v_source_user,
    v_overload_id,
    p_overload_summary
  )
  on conflict (id) do update set
    title = excluded.title,
    performed_at = excluded.performed_at,
    -- Keep the original finish time once a session has been saved; a later edit is not a new finish.
    completed_at = case
      when p_completed then coalesce(lift_sessions.completed_at, now())
      else null
    end,
    status = case when p_completed then 'saved' else 'open' end,
    muscle_keys = excluded.muscle_keys,
    unit = excluded.unit,
    -- Provenance is written once, by the save that created the session. A later autosave passes
    -- nulls and must not erase where the session came from.
    source_session_id = coalesce(lift_sessions.source_session_id, excluded.source_session_id),
    source_user_id = coalesce(lift_sessions.source_user_id, excluded.source_user_id),
    overload_from_session_id =
      coalesce(lift_sessions.overload_from_session_id, excluded.overload_from_session_id),
    overload_summary = coalesce(lift_sessions.overload_summary, excluded.overload_summary),
    updated_at = now()
  where lift_sessions.user_id = v_user
  returning id into v_session;

  -- An id belonging to someone else matches no row this user may update, so the copy stays a copy.
  if v_session is null then
    raise exception 'That lift session is not yours.' using errcode = '42501';
  end if;

  -- Replace rather than reconcile: the client owns the running order, and a session is small.
  delete from public.lift_session_exercises where session_id = v_session;

  for v_exercise in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb))
  loop
    v_kind := case
      when v_exercise ->> 'kind' in ('cardio', 'rest') then v_exercise ->> 'kind'
      else 'strength'
    end;

    v_exercise_id := nullif(v_exercise ->> 'exerciseId', '');
    v_custom_id := nullif(v_exercise ->> 'customExerciseId', '')::uuid;
    v_method := nullif(v_exercise ->> 'cardioMethod', '');

    -- A catalog id that no longer exists, or someone else's custom, degrades to the name snapshot
    -- instead of failing the whole save.
    if v_exercise_id is not null
      and not exists (select 1 from public.lift_exercises where id = v_exercise_id) then
      v_exercise_id := null;
    end if;
    if v_custom_id is not null
      and not exists (
        select 1 from public.lift_custom_exercises
        where id = v_custom_id and user_id = v_user
      ) then
      v_custom_id := null;
    end if;
    if v_method is not null
      and not exists (select 1 from public.lift_cardio_methods where id = v_method) then
      v_method := 'other';
    end if;

    -- Cardio and rest are not exercises out of the catalog, so they never carry those ids.
    if v_kind <> 'strength' then
      v_exercise_id := null;
      v_custom_id := null;
    end if;
    if v_kind <> 'cardio' then
      v_method := null;
    end if;

    insert into public.lift_session_exercises (
      session_id, exercise_id, custom_exercise_id, name, muscle_key, sort, superset_group,
      kind, cardio_method, cardio_custom_name, cardio_type, duration_seconds, intensity, demo_url
    )
    values (
      v_session,
      v_exercise_id,
      case when v_exercise_id is null then v_custom_id else null end,
      left(btrim(coalesce(v_exercise ->> 'name', 'Exercise')), 80),
      v_exercise ->> 'muscleKey',
      coalesce((v_exercise ->> 'sort')::int, 0),
      nullif(v_exercise ->> 'supersetGroup', '')::int,
      v_kind,
      v_method,
      case
        when v_kind = 'cardio' and v_method = 'other'
          then nullif(left(btrim(coalesce(v_exercise ->> 'cardioCustomName', '')), 60), '')
        else null
      end,
      case
        when v_kind = 'cardio'
          and v_exercise ->> 'cardioType' in ('warmup', 'steady', 'sprint', 'interval', 'cooldown')
          then v_exercise ->> 'cardioType'
        else null
      end,
      case
        when v_kind = 'strength' then null
        else least(greatest(coalesce((v_exercise ->> 'durationSeconds')::int, 0), 0), 86400)
      end,
      case
        when v_kind = 'cardio' and (v_exercise ->> 'intensity') is not null
          then least(greatest((v_exercise ->> 'intensity')::int, 1), 10)
        else null
      end,
      nullif(btrim(coalesce(v_exercise ->> 'demoUrl', '')), '')
    )
    returning id into v_row_id;

    -- Only strength rows have sets. A cardio or rest row is fully described by its own columns.
    if v_kind = 'strength' then
      for v_set in select * from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb))
      loop
        insert into public.lift_sets (exercise_row_id, kind, sort, weight, reps, completed_at)
        values (
          v_row_id,
          case when v_set ->> 'kind' = 'warmup' then 'warmup' else 'work' end,
          coalesce((v_set ->> 'sort')::int, 0),
          nullif(v_set ->> 'weight', '')::numeric,
          nullif(v_set ->> 'reps', '')::numeric,
          nullif(v_set ->> 'completedAt', '')::timestamptz
        );
      end loop;
    end if;
  end loop;

  return v_session;
end;
$$;

revoke all on function public.save_lift_session(
  uuid, text, timestamptz, text[], text, boolean, jsonb, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.save_lift_session(
  uuid, text, timestamptz, text[], text, boolean, jsonb, uuid, uuid, jsonb
) to authenticated;
