-- Cardio interval rounds were never actually saved.
--
-- 20260906181500_lift_cardio_rounds.sql added the rounds column and then defined save_lift_session
-- with a NEW parameter list (p_session_id / p_notes / p_status). In Postgres a different parameter
-- list is an overload, not a replacement, so the original save_lift_session(p_id ... p_completed ...)
-- survived untouched -- and that is the one the client calls. Result: the client sent rounds, the
-- live function ignored them, and every interval was stored as [].
--
-- This patches the overload the client actually calls, and drops the stray one, which was itself
-- broken twice over: it called lift_session_readable(id) with one argument (the helper takes two)
-- and it wrote a notes column that lift_sessions does not have.

CREATE OR REPLACE FUNCTION public.save_lift_session(p_id uuid, p_title text, p_performed_at timestamp with time zone, p_muscle_keys text[], p_unit text, p_completed boolean, p_exercises jsonb, p_source_session_id uuid DEFAULT NULL::uuid, p_overload_from_session_id uuid DEFAULT NULL::uuid, p_overload_summary jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_rounds jsonb;
  v_round jsonb;
begin
  if v_user is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  if not public.are_lift_muscle_keys(coalesce(p_muscle_keys, '{}')) then
    raise exception 'Unknown muscle group.' using errcode = '22023';
  end if;

  if p_source_session_id is not null then
    select s.user_id into v_source_user
      from public.lift_sessions s
     where s.id = p_source_session_id
       and public.lift_session_readable(s.id, s.user_id);
    v_source_id := case when v_source_user is null then null else p_source_session_id end;
  end if;

  if p_overload_from_session_id is not null
    and exists (
      select 1 from public.lift_sessions s
      where s.id = p_overload_from_session_id and s.user_id = v_user
    ) then
    v_overload_id := p_overload_from_session_id;
  end if;

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
    completed_at = case
      when p_completed then coalesce(lift_sessions.completed_at, now())
      else null
    end,
    status = case when p_completed then 'saved' else 'open' end,
    muscle_keys = excluded.muscle_keys,
    unit = excluded.unit,
    source_session_id = coalesce(lift_sessions.source_session_id, excluded.source_session_id),
    source_user_id = coalesce(lift_sessions.source_user_id, excluded.source_user_id),
    overload_from_session_id =
      coalesce(lift_sessions.overload_from_session_id, excluded.overload_from_session_id),
    overload_summary = coalesce(lift_sessions.overload_summary, excluded.overload_summary),
    updated_at = now()
  where lift_sessions.user_id = v_user
  returning id into v_session;

  if v_session is null then
    raise exception 'That lift session is not yours.' using errcode = '42501';
  end if;

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

    if v_kind <> 'strength' then
      v_exercise_id := null;
      v_custom_id := null;
    end if;
    if v_kind <> 'cardio' then
      v_method := null;
    end if;

    v_rounds := '[]'::jsonb;
    if v_kind = 'cardio' then
      for v_round in
        select * from jsonb_array_elements(
          case
            when jsonb_typeof(v_exercise -> 'rounds') = 'array' then v_exercise -> 'rounds'
            else '[]'::jsonb
          end
        )
      loop
        if jsonb_typeof(v_round) = 'object'
           and v_round ->> 'kind' in ('on', 'off', 'rest', 'warmup', 'steady', 'sprint', 'cooldown')
        then
          v_rounds := v_rounds || jsonb_build_array(
            jsonb_strip_nulls(
              jsonb_build_object(
                'kind', v_round ->> 'kind',
                'minutes', least(greatest(coalesce((v_round ->> 'minutes')::int, 0), 0), 1440),
                'seconds', least(greatest(coalesce((v_round ->> 'seconds')::int, 0), 0), 59),
                'intensity', case
                  when v_round ->> 'kind' = 'on' and (v_round ->> 'intensity') is not null
                    then least(greatest((v_round ->> 'intensity')::int, 1), 10)
                  else null
                end
              )
            )
          );
        end if;
      end loop;
    end if;

    insert into public.lift_session_exercises (
      session_id, exercise_id, custom_exercise_id, name, muscle_key, sort, superset_group,
      kind, cardio_method, cardio_custom_name, cardio_type, duration_seconds, intensity, demo_url,
      rounds
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
    ,
      v_rounds
    )
    returning id into v_row_id;

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
$function$;

-- The stray overload from 20260906181500. Nothing calls it and it cannot run.
drop function if exists public.save_lift_session(
  uuid, text, timestamptz, text[], text, text, text, jsonb, uuid, uuid, uuid, jsonb
);
