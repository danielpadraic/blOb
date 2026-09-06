-- Lift: starting and saving a session.
--
-- Split out from the schema migration that runs immediately before this one. Both are safe to
-- re-run, and both are already applied on the project.
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
