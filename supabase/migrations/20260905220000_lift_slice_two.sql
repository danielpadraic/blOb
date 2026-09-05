-- Lift slice two: progressive overload, shareable recap posts, and import.
--
-- Slice one kept every lift row owner-only. This opens exactly one door: a session becomes readable
-- by other people when its owner attaches it to a post those people can already see. The door is
-- the post, so audience, blocks, and challenge membership are decided by `can_read_post` and are
-- never re-implemented here.
--
-- Nothing in this file grants a write. A viewer who can read a shared session can copy its shape
-- into a brand new session of their own; they can never edit the original.

-- ---------------------------------------------------------------- session provenance

alter table public.lift_sessions
  add column if not exists source_session_id uuid references public.lift_sessions(id) on delete set null,
  add column if not exists shared_post_id uuid,
  add column if not exists overload_from_session_id uuid references public.lift_sessions(id) on delete set null,
  add column if not exists overload_summary jsonb;

comment on column public.lift_sessions.source_session_id is
  'The session this one was copied from: "Start this again", "Use last session", or an import from a shared card.';
comment on column public.lift_sessions.overload_from_session_id is
  'Set only when the copy went through the Overload sheet. Points at the session whose numbers were bumped.';
comment on column public.lift_sessions.overload_summary is
  'What the bump was, so the recap card can say "+2.5 lb": { weightDelta, repsDelta }.';

-- ---------------------------------------------------------------- the post that shares a session

alter table public.posts
  add column if not exists lift_session_id uuid references public.lift_sessions(id) on delete set null;

comment on column public.posts.lift_session_id is
  'A lift recap card renders from this session. Also the key that makes the session readable to this post''s audience.';

create index if not exists posts_lift_session_idx
  on public.posts (lift_session_id)
  where lift_session_id is not null;

-- `lift_session` joins the existing post kinds. Home and Live both render it as a compact card.
alter table public.posts drop constraint if exists posts_type_allowed;
alter table public.posts add constraint posts_type_allowed check (
  type is null or type in (
    'feed',
    'checkin',
    'challenge',
    'share',
    'profile_photo',
    'wave',
    'round',
    'round_share',
    'wave_share',
    'circle_invite',
    'circle_join',
    'circle_challenge_share',
    'lift_session'
  )
);

-- The recap post must point at a session its author actually owns. Without this a caller could
-- publish someone else's private log by guessing an id.
create or replace function public.lift_post_owner_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lift_session_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.lift_sessions s
    where s.id = new.lift_session_id and s.user_id = new.author_id
  ) then
    raise exception 'That lift is not yours to share.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_lift_session_owner on public.posts;
create trigger posts_lift_session_owner
  before insert or update of lift_session_id, author_id on public.posts
  for each row execute function public.lift_post_owner_check();

-- ---------------------------------------------------------------- visibility

/**
 * True when the signed-in user may read this session: they own it, or a post they can already see
 * points at it.
 *
 * Security definer so the check can read `posts` without handing the caller a way to enumerate the
 * table. `can_read_post` is the single source of truth for who sees a post, so a lift card can
 * never be more visible than the post carrying it.
 */
create or replace function public.lift_session_readable(p_session_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      auth.uid() = p_owner_id
      or exists (
        select 1
        from public.posts p
        where p.lift_session_id = p_session_id
          and p.deleted_at is null
          and public.can_read_post(p.author_id, p.audience, p.audience_user_ids, p.challenge_id)
      )
    );
$$;

revoke all on function public.lift_session_readable(uuid, uuid) from public, anon;
grant execute on function public.lift_session_readable(uuid, uuid) to authenticated;

drop policy if exists "Owner reads own lift sessions" on public.lift_sessions;
create policy "Read own or shared lift sessions"
  on public.lift_sessions for select
  to authenticated
  using (public.lift_session_readable(id, user_id));

drop policy if exists "Owner reads own session exercises" on public.lift_session_exercises;
create policy "Read own or shared session exercises"
  on public.lift_session_exercises for select
  to authenticated
  using (
    exists (
      select 1 from public.lift_sessions s
      where s.id = lift_session_exercises.session_id
        and public.lift_session_readable(s.id, s.user_id)
    )
  );

drop policy if exists "Owner reads own lift sets" on public.lift_sets;
create policy "Read own or shared lift sets"
  on public.lift_sets for select
  to authenticated
  using (
    exists (
      select 1
      from public.lift_session_exercises e
      join public.lift_sessions s on s.id = e.session_id
      where e.id = lift_sets.exercise_row_id
        and public.lift_session_readable(s.id, s.user_id)
    )
  );

-- Write policies are untouched: insert / update / delete stay `user_id = auth.uid()` from slice one.

-- ---------------------------------------------------------------- save RPC

-- Replacing the slice-one signature rather than overloading it: two functions with the same name
-- would leave PostgREST unable to pick one.
drop function if exists public.save_lift_session(uuid, text, timestamptz, text[], text, boolean, jsonb);

create function public.save_lift_session(
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
  v_overload_id uuid;
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
  --
  -- A source must be something they can actually read.
  if p_source_session_id is not null
    and not exists (
      select 1 from public.lift_sessions s
      where s.id = p_source_session_id
        and public.lift_session_readable(s.id, s.user_id)
    ) then
    v_source_id := null;
  else
    v_source_id := p_source_session_id;
  end if;

  -- Overload bumps your own numbers. A friend's card can supply structure, never a starting load.
  if p_overload_from_session_id is not null
    and not exists (
      select 1 from public.lift_sessions s
      where s.id = p_overload_from_session_id and s.user_id = v_user
    ) then
    v_overload_id := null;
  else
    v_overload_id := p_overload_from_session_id;
  end if;

  insert into public.lift_sessions (
    id, user_id, title, performed_at, completed_at, muscle_keys, unit,
    source_session_id, overload_from_session_id, overload_summary
  )
  values (
    coalesce(p_id, gen_random_uuid()),
    v_user,
    left(nullif(btrim(coalesce(p_title, '')), ''), 120),
    coalesce(p_performed_at, now()),
    case when p_completed then now() else null end,
    coalesce(p_muscle_keys, '{}'),
    case when p_unit = 'kg' then 'kg' else 'lb' end,
    v_source_id,
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
    muscle_keys = excluded.muscle_keys,
    unit = excluded.unit,
    -- Provenance is written once, by the save that created the session. A later autosave passes
    -- nulls and must not erase where the session came from.
    source_session_id = coalesce(lift_sessions.source_session_id, excluded.source_session_id),
    overload_from_session_id =
      coalesce(lift_sessions.overload_from_session_id, excluded.overload_from_session_id),
    overload_summary = coalesce(lift_sessions.overload_summary, excluded.overload_summary),
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

revoke all on function public.save_lift_session(uuid, text, timestamptz, text[], text, boolean, jsonb, uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_lift_session(uuid, text, timestamptz, text[], text, boolean, jsonb, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- linking a session to its post

/**
 * Records which post shares a session. Kept as an RPC so the owner check lives next to the write
 * and the client never needs update rights on someone else's row.
 */
create or replace function public.set_lift_session_post(p_session_id uuid, p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  update public.lift_sessions
  set shared_post_id = p_post_id, updated_at = now()
  where id = p_session_id and user_id = v_uid;

  if not found then
    raise exception 'That lift is not yours.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.set_lift_session_post(uuid, uuid) from public, anon;
grant execute on function public.set_lift_session_post(uuid, uuid) to authenticated;
