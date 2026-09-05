-- Lift: private strength logging.
--
-- A lift session is the user's own training log. It is not a check-in, not a proof, and not a
-- money path. Nothing here reads or writes challenges, escrow, or the coin ledger, and no row in
-- this file is visible on a public profile or a leaderboard.
--
-- Layering, so there is one place to look for each job:
--   lift_exercises           official catalog, read-only to every user (seeded by the next migration)
--   lift_custom_exercises    a name one user typed that the catalog did not have; owner-only
--   lift_sessions            one training session
--   lift_session_exercises   the exercises in that session, in order, with superset grouping
--   lift_sets                warm-up and work sets under an exercise
--
-- health_workouts and workout_sessions are untouched. A lift session has no HealthKit attach.

-- Keeping the muscle list in one function means the app's MUSCLE_KEYS and the table checks cannot
-- drift apart silently — a bad key fails the insert instead of rendering an empty section.
create or replace function public.is_lift_muscle_key(p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_key in (
    'chest', 'back', 'shoulders', 'traps', 'biceps', 'triceps', 'forearms',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'olympic'
  );
$$;

create or replace function public.are_lift_muscle_keys(p_keys text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_keys is null
    or not exists (
      select 1 from unnest(p_keys) as key where not public.is_lift_muscle_key(key)
    );
$$;

-- ---------------------------------------------------------------------------
-- Official catalog

create table if not exists public.lift_exercises (
  id text primary key,
  name text not null,
  primary_muscle text not null check (public.is_lift_muscle_key(primary_muscle)),
  secondary_muscles text[] not null default '{}' check (public.are_lift_muscle_keys(secondary_muscles)),
  -- Search-only spellings ("flat barbell bench press" for "Flat BB Bench Press"). Never displayed.
  aliases text[] not null default '{}',
  is_official boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.lift_exercises is
  'Official exercise catalog. Generated from lib/lift/catalogData.ts. Read-only to every user: there is no insert, update, or delete policy, so a user cannot edit or remove a seed row.';

create index if not exists lift_exercises_primary_muscle_idx
  on public.lift_exercises (primary_muscle);
create index if not exists lift_exercises_secondary_muscles_idx
  on public.lift_exercises using gin (secondary_muscles);

alter table public.lift_exercises enable row level security;

drop policy if exists "Signed-in users read the official catalog" on public.lift_exercises;
create policy "Signed-in users read the official catalog"
  on public.lift_exercises for select
  to authenticated
  using (true);

-- No insert / update / delete policy on purpose. The seed is owned by migrations.

-- Supabase default privileges hand `authenticated` every privilege on a new public table,
-- including TRUNCATE, which bypasses RLS entirely. Take it all back, then grant only the
-- verbs the app actually calls.
revoke all on public.lift_exercises from anon, authenticated;
grant select on public.lift_exercises to authenticated;
grant all on public.lift_exercises to service_role;

-- ---------------------------------------------------------------------------
-- A user's private exercises

create table if not exists public.lift_custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  primary_muscle text not null check (public.is_lift_muscle_key(primary_muscle)),
  secondary_muscles text[] not null default '{}' check (public.are_lift_muscle_keys(secondary_muscles)),
  created_at timestamptz not null default now()
);

comment on table public.lift_custom_exercises is
  'Exercises a user typed that the official catalog did not have. Owner-only in every direction: another user cannot read, search, or reuse them, and they never reach lift_exercises.';

-- One "Floor press" per user, however they capitalised it the second time.
create unique index if not exists lift_custom_exercises_owner_name_key
  on public.lift_custom_exercises (user_id, lower(btrim(name)));

alter table public.lift_custom_exercises enable row level security;

drop policy if exists "Owner reads own custom exercises" on public.lift_custom_exercises;
create policy "Owner reads own custom exercises"
  on public.lift_custom_exercises for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owner inserts own custom exercises" on public.lift_custom_exercises;
create policy "Owner inserts own custom exercises"
  on public.lift_custom_exercises for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Owner updates own custom exercises" on public.lift_custom_exercises;
create policy "Owner updates own custom exercises"
  on public.lift_custom_exercises for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Owner deletes own custom exercises" on public.lift_custom_exercises;
create policy "Owner deletes own custom exercises"
  on public.lift_custom_exercises for delete
  to authenticated
  using (user_id = auth.uid());

-- Supabase default privileges hand `authenticated` every privilege on a new public table,
-- including TRUNCATE, which bypasses RLS entirely. Take it all back, then grant only the
-- verbs the app actually calls.
revoke all on public.lift_custom_exercises from anon, authenticated;
grant select, insert, update, delete on public.lift_custom_exercises to authenticated;
grant all on public.lift_custom_exercises to service_role;

-- ---------------------------------------------------------------------------
-- Sessions

create table if not exists public.lift_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Null means the app titles it from the muscles and the date. A rename stores the text here.
  title text check (title is null or length(btrim(title)) between 1 and 120),
  performed_at timestamptz not null default now(),
  -- Null while the session is still open. Set on Save, which is what turns it read-only.
  completed_at timestamptz,
  muscle_keys text[] not null default '{}' check (public.are_lift_muscle_keys(muscle_keys)),
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lift_sessions is
  'One strength training session. Private to the owner: You -> Lifts only, never the public profile, never body_metrics, never a feed post in this slice.';

create index if not exists lift_sessions_user_performed_idx
  on public.lift_sessions (user_id, performed_at desc);
create index if not exists lift_sessions_muscle_keys_idx
  on public.lift_sessions using gin (muscle_keys);

alter table public.lift_sessions enable row level security;

drop policy if exists "Owner reads own lift sessions" on public.lift_sessions;
create policy "Owner reads own lift sessions"
  on public.lift_sessions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owner inserts own lift sessions" on public.lift_sessions;
create policy "Owner inserts own lift sessions"
  on public.lift_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Owner updates own lift sessions" on public.lift_sessions;
create policy "Owner updates own lift sessions"
  on public.lift_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Owner deletes own lift sessions" on public.lift_sessions;
create policy "Owner deletes own lift sessions"
  on public.lift_sessions for delete
  to authenticated
  using (user_id = auth.uid());

-- Supabase default privileges hand `authenticated` every privilege on a new public table,
-- including TRUNCATE, which bypasses RLS entirely. Take it all back, then grant only the
-- verbs the app actually calls.
revoke all on public.lift_sessions from anon, authenticated;
grant select, insert, update, delete on public.lift_sessions to authenticated;
grant all on public.lift_sessions to service_role;

-- ---------------------------------------------------------------------------
-- Exercises inside a session

create table if not exists public.lift_session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lift_sessions (id) on delete cascade,
  exercise_id text references public.lift_exercises (id) on delete restrict,
  custom_exercise_id uuid references public.lift_custom_exercises (id) on delete set null,
  -- Snapshot of the name as it was logged, so history still reads correctly after a custom is
  -- renamed or deleted.
  name text not null,
  muscle_key text not null check (public.is_lift_muscle_key(muscle_key)),
  sort integer not null default 0,
  -- Exercises sharing a group number are a superset. Null means it stands alone.
  superset_group integer,
  created_at timestamptz not null default now(),
  constraint lift_session_exercises_single_source check (
    exercise_id is null or custom_exercise_id is null
  )
);

comment on table public.lift_session_exercises is
  'An exercise as performed in one session. exercise_id points at the official catalog, custom_exercise_id at the owner''s private list, and never both. Both null is allowed only after a custom row was deleted; the name snapshot carries the history.';

create index if not exists lift_session_exercises_session_idx
  on public.lift_session_exercises (session_id, sort);

alter table public.lift_session_exercises enable row level security;

drop policy if exists "Owner reads own session exercises" on public.lift_session_exercises;
create policy "Owner reads own session exercises"
  on public.lift_session_exercises for select
  to authenticated
  using (
    exists (
      select 1 from public.lift_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Owner writes own session exercises" on public.lift_session_exercises;
create policy "Owner writes own session exercises"
  on public.lift_session_exercises for insert
  to authenticated
  with check (
    exists (
      select 1 from public.lift_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Owner updates own session exercises" on public.lift_session_exercises;
create policy "Owner updates own session exercises"
  on public.lift_session_exercises for update
  to authenticated
  using (
    exists (
      select 1 from public.lift_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.lift_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Owner deletes own session exercises" on public.lift_session_exercises;
create policy "Owner deletes own session exercises"
  on public.lift_session_exercises for delete
  to authenticated
  using (
    exists (
      select 1 from public.lift_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

-- Supabase default privileges hand `authenticated` every privilege on a new public table,
-- including TRUNCATE, which bypasses RLS entirely. Take it all back, then grant only the
-- verbs the app actually calls.
revoke all on public.lift_session_exercises from anon, authenticated;
grant select, insert, update, delete on public.lift_session_exercises to authenticated;
grant all on public.lift_session_exercises to service_role;

-- ---------------------------------------------------------------------------
-- Sets

create table if not exists public.lift_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_row_id uuid not null references public.lift_session_exercises (id) on delete cascade,
  kind text not null default 'work' check (kind in ('warmup', 'work')),
  sort integer not null default 0,
  -- Stored in the session's unit. Bounds are the client clamps: past them it is a typo, not a lift.
  weight numeric check (weight is null or (weight >= 0 and weight <= 2000)),
  reps numeric check (reps is null or (reps >= 0 and reps <= 1000)),
  -- Null until the row is checked off. This is the single tap on the set row.
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.lift_sets is
  'Warm-up and work sets. Weight is in the parent session''s unit, so a kg session is never silently read as pounds.';

create index if not exists lift_sets_exercise_idx
  on public.lift_sets (exercise_row_id, sort);

alter table public.lift_sets enable row level security;

drop policy if exists "Owner reads own lift sets" on public.lift_sets;
create policy "Owner reads own lift sets"
  on public.lift_sets for select
  to authenticated
  using (
    exists (
      select 1
      from public.lift_session_exercises e
      join public.lift_sessions s on s.id = e.session_id
      where e.id = exercise_row_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Owner writes own lift sets" on public.lift_sets;
create policy "Owner writes own lift sets"
  on public.lift_sets for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.lift_session_exercises e
      join public.lift_sessions s on s.id = e.session_id
      where e.id = exercise_row_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Owner updates own lift sets" on public.lift_sets;
create policy "Owner updates own lift sets"
  on public.lift_sets for update
  to authenticated
  using (
    exists (
      select 1
      from public.lift_session_exercises e
      join public.lift_sessions s on s.id = e.session_id
      where e.id = exercise_row_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.lift_session_exercises e
      join public.lift_sessions s on s.id = e.session_id
      where e.id = exercise_row_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Owner deletes own lift sets" on public.lift_sets;
create policy "Owner deletes own lift sets"
  on public.lift_sets for delete
  to authenticated
  using (
    exists (
      select 1
      from public.lift_session_exercises e
      join public.lift_sessions s on s.id = e.session_id
      where e.id = exercise_row_id and s.user_id = auth.uid()
    )
  );

-- Supabase default privileges hand `authenticated` every privilege on a new public table,
-- including TRUNCATE, which bypasses RLS entirely. Take it all back, then grant only the
-- verbs the app actually calls.
revoke all on public.lift_sets from anon, authenticated;
grant select, insert, update, delete on public.lift_sets to authenticated;
grant all on public.lift_sets to service_role;

-- ---------------------------------------------------------------------------
-- Save

-- One call writes the whole session. Doing it row by row from the client would leave a half-saved
-- session behind any dropped request, and a stepper tap must not cost a round trip.
create or replace function public.save_lift_session(
  p_id uuid,
  p_title text,
  p_performed_at timestamptz,
  p_muscle_keys text[],
  p_unit text,
  p_completed boolean,
  p_exercises jsonb
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
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  if not public.are_lift_muscle_keys(coalesce(p_muscle_keys, '{}')) then
    raise exception 'Unknown muscle group.' using errcode = '22023';
  end if;

  insert into public.lift_sessions (id, user_id, title, performed_at, completed_at, muscle_keys, unit)
  values (
    coalesce(p_id, gen_random_uuid()),
    v_user,
    nullif(btrim(coalesce(p_title, '')), ''),
    coalesce(p_performed_at, now()),
    case when p_completed then now() else null end,
    coalesce(p_muscle_keys, '{}'),
    case when p_unit = 'kg' then 'kg' else 'lb' end
  )
  on conflict (id) do update set
    title = excluded.title,
    performed_at = excluded.performed_at,
    -- Keep the original finish time once a session has been saved; a later edit is not a new finish.
    completed_at = case
      when p_completed then coalesce(lift_sessions.completed_at, now())
      else null
    end,
    muscle_keys = excluded.muscle_keys,
    unit = excluded.unit,
    updated_at = now()
  where lift_sessions.user_id = v_user
  returning id into v_session;

  if v_session is null then
    raise exception 'That lift session is not yours.' using errcode = '42501';
  end if;

  -- Replace rather than reconcile: the client owns the running order, and a session is small.
  delete from public.lift_session_exercises where session_id = v_session;

  for v_exercise in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb))
  loop
    v_exercise_id := nullif(v_exercise ->> 'exerciseId', '');
    v_custom_id := nullif(v_exercise ->> 'customExerciseId', '')::uuid;

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

    insert into public.lift_session_exercises (
      session_id, exercise_id, custom_exercise_id, name, muscle_key, sort, superset_group
    )
    values (
      v_session,
      v_exercise_id,
      case when v_exercise_id is null then v_custom_id else null end,
      left(btrim(coalesce(v_exercise ->> 'name', 'Exercise')), 80),
      v_exercise ->> 'muscleKey',
      coalesce((v_exercise ->> 'sort')::int, 0),
      nullif(v_exercise ->> 'supersetGroup', '')::int
    )
    returning id into v_row_id;

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
  end loop;

  return v_session;
end;
$$;

comment on function public.save_lift_session(uuid, text, timestamptz, text[], text, boolean, jsonb) is
  'Writes one lift session and its exercises and sets in a single statement. Owner-only: the session id must belong to auth.uid(). Touches no challenge, escrow, or ledger table.';

revoke all on function public.save_lift_session(uuid, text, timestamptz, text[], text, boolean, jsonb) from anon;
grant execute on function public.save_lift_session(uuid, text, timestamptz, text[], text, boolean, jsonb)
  to authenticated, service_role;
