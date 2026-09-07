-- Cardio interval rounds.
--
-- A sprint interval is many rounds of the SAME machine — Air Bike 0:20 on, 0:10 off, eight times —
-- so the rounds belong to the one cardio row rather than to eight separate exercises. They live in
-- a jsonb array because their shape is a list of blocks, not a table of relations: nothing joins
-- to a round, nothing aggregates across rounds, and they are always read and written whole with
-- the row that owns them.
--
-- Round kinds:
--   on       Interval ON  — work, carries intensity
--   off      Interval OFF — active recovery on the same machine, no intensity
--   rest     stand or walk, no intensity
--   warmup / steady / sprint / cooldown  — extra blocks appended after a single-block cardio row

begin;

alter table public.lift_session_exercises
  add column if not exists rounds jsonb not null default '[]'::jsonb;

comment on column public.lift_session_exercises.rounds is
  'Cardio interval rounds: [{kind,minutes,seconds,intensity?}]. Empty for strength, rest, and single-block cardio.';

-- Shape guard rather than a full schema check: this keeps a malformed write out (an object, a
-- string, a number) without turning every future round field into a migration.
alter table public.lift_session_exercises
  drop constraint if exists lift_session_exercises_rounds_array;

alter table public.lift_session_exercises
  add constraint lift_session_exercises_rounds_array
  check (jsonb_typeof(rounds) = 'array');

-- A round list that is not cardio is meaningless, and letting one sit on a strength row would make
-- the Play button appear on a bench press.
alter table public.lift_session_exercises
  drop constraint if exists lift_session_exercises_rounds_cardio_only;

alter table public.lift_session_exercises
  add constraint lift_session_exercises_rounds_cardio_only
  check (kind = 'cardio' or rounds = '[]'::jsonb);

commit;

-- ---------------------------------------------------------------------------------------------
-- save_lift_session: carry the rounds array through, clamped and normalised.
-- ---------------------------------------------------------------------------------------------

create or replace function public.save_lift_session(
  p_session_id uuid,
  p_title text,
  p_performed_at timestamptz,
  p_muscle_keys text[],
  p_unit text,
  p_notes text,
  p_status text,
  p_exercises jsonb,
  p_source_session_id uuid default null,
  p_source_user_id uuid default null,
  p_overload_from_session_id uuid default null,
  p_overload_summary jsonb default null
)
returns public.lift_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid;
  v_row public.lift_sessions;
  v_exercise jsonb;
  v_set jsonb;
  v_row_id uuid;
  v_kind text;
  v_method text;
  v_exercise_id text;
  v_custom_id uuid;
  v_status text;
  v_source_session uuid;
  v_source_user uuid;
  v_overload_from uuid;
  v_rounds jsonb;
  v_round jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  v_status := case when coalesce(p_status, 'open') = 'saved' then 'saved' else 'open' end;

  -- Provenance only survives if this user can actually see the session it points at. Otherwise a
  -- crafted payload could claim descent from a stranger's private session.
  select id into v_source_session
  from public.lift_sessions
  where id = p_source_session_id and public.lift_session_readable(id, user_id);

  select id into v_overload_from
  from public.lift_sessions
  where id = p_overload_from_session_id and public.lift_session_readable(id, user_id);

  v_source_user := case when v_source_session is null then null else p_source_user_id end;

  if p_session_id is null then
    insert into public.lift_sessions (
      user_id, title, performed_at, muscle_keys, unit, notes, status,
      source_session_id, source_user_id, overload_from_session_id, overload_summary
    )
    values (
      v_uid,
      nullif(btrim(coalesce(p_title, '')), ''),
      coalesce(p_performed_at, now()),
      coalesce(p_muscle_keys, '{}'),
      case when p_unit = 'kg' then 'kg' else 'lb' end,
      nullif(btrim(coalesce(p_notes, '')), ''),
      v_status,
      v_source_session,
      v_source_user,
      v_overload_from,
      p_overload_summary
    )
    returning id into v_session;
  else
    update public.lift_sessions
    set title = nullif(btrim(coalesce(p_title, '')), ''),
        performed_at = coalesce(p_performed_at, performed_at),
        muscle_keys = coalesce(p_muscle_keys, muscle_keys),
        unit = case when p_unit = 'kg' then 'kg' else 'lb' end,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        status = v_status,
        completed_at = case when v_status = 'saved' then coalesce(completed_at, now()) else null end,
        source_session_id = coalesce(v_source_session, source_session_id),
        source_user_id = coalesce(v_source_user, source_user_id),
        overload_from_session_id = coalesce(v_overload_from, overload_from_session_id),
        overload_summary = coalesce(p_overload_summary, overload_summary),
        updated_at = now()
    where id = p_session_id and user_id = v_uid
    returning id into v_session;

    if v_session is null then
      raise exception 'NOT_FOUND';
    end if;
  end if;

  -- One open session per user: saving this one closes any other still hanging open.
  if v_status = 'open' then
    update public.lift_sessions
    set status = 'saved', completed_at = coalesce(completed_at, now()), updated_at = now()
    where user_id = v_uid and id <> v_session and status = 'open';
  end if;

  delete from public.lift_session_exercises where session_id = v_session;

  for v_exercise in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb))
  loop
    v_kind := case
      when v_exercise ->> 'kind' in ('cardio', 'rest') then v_exercise ->> 'kind'
      else 'strength'
    end;

    v_exercise_id := nullif(btrim(coalesce(v_exercise ->> 'exerciseId', '')), '');
    v_custom_id := nullif(btrim(coalesce(v_exercise ->> 'customExerciseId', '')), '')::uuid;

    v_method := case
      when v_kind <> 'cardio' then null
      when exists (
        select 1 from public.lift_cardio_methods m where m.id = v_exercise ->> 'cardioMethod'
      ) then v_exercise ->> 'cardioMethod'
      else 'other'
    end;

    -- Rounds are rebuilt element by element so a bad payload cannot store a shape the app will
    -- later choke on. Anything without a usable kind is dropped rather than guessed at.
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
      nullif(btrim(coalesce(v_exercise ->> 'demoUrl', '')), ''),
      v_rounds
    )
    returning id into v_row_id;

    for v_set in select * from jsonb_array_elements(
      case
        when jsonb_typeof(v_exercise -> 'sets') = 'array' then v_exercise -> 'sets'
        else '[]'::jsonb
      end
    )
    loop
      insert into public.lift_sets (
        session_exercise_id, kind, sort, weight, reps, completed_at
      )
      values (
        v_row_id,
        case when v_set ->> 'kind' = 'warmup' then 'warmup' else 'work' end,
        coalesce((v_set ->> 'sort')::int, 0),
        nullif(v_set ->> 'weight', '')::numeric,
        nullif(v_set ->> 'reps', '')::int,
        nullif(v_set ->> 'completedAt', '')::timestamptz
      );
    end loop;
  end loop;

  select * into v_row from public.lift_sessions where id = v_session;
  return v_row;
end;
$$;

grant execute on function public.save_lift_session(
  uuid, text, timestamptz, text[], text, text, text, jsonb, uuid, uuid, uuid, jsonb
) to authenticated;
