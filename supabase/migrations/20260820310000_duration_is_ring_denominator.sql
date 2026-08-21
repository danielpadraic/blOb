-- Host-saved duration is days_required / length_value and ends_at = starts_at + N days.
-- Check-in targets stay on required_checkins / target_count.

create or replace function public.user_challenge_ends_at(p_starts timestamptz, p_days int)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_starts is null then null
    else p_starts + (greatest(coalesce(p_days, 1), 1) * interval '1 day')
  end;
$$;

create or replace function public.trg_user_challenge_duration_insert()
returns trigger
language plpgsql
as $$
declare
  v_days int;
begin
  if coalesce(new.is_official, false) or coalesce(new.series_id, '') <> '' then
    return new;
  end if;
  if coalesce(new.is_unlimited, false) then
    new.ends_at := null;
    new.length_value := null;
    return new;
  end if;
  v_days := greatest(coalesce(new.length_value, 0), 0);
  if v_days < 1 then
    return new;
  end if;
  new.days_required := v_days;
  new.length_unit := coalesce(nullif(new.length_unit, ''), 'days');
  if new.starts_at is not null then
    new.ends_at := public.user_challenge_ends_at(new.starts_at, v_days);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_challenge_duration_insert on public.challenges;
create trigger trg_user_challenge_duration_insert
  before insert on public.challenges
  for each row
  execute function public.trg_user_challenge_duration_insert();

create or replace function public.update_user_challenge(p_challenge_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_min int;
  v_unlimited boolean;
  v_starts timestamptz;
  v_days int;
  v_ends timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if ch.status = 'live' then
    raise exception 'ALREADY_STARTED';
  end if;
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.workout_submissions s where s.challenge_id = p_challenge_id) then
    raise exception 'ALREADY_STARTED';
  end if;

  v_min := greatest(coalesce(nullif(p_payload->>'min_participants', '')::int, ch.min_participants, 2), 2);
  v_unlimited := coalesce((p_payload->>'is_unlimited')::boolean, ch.is_unlimited);
  v_starts := coalesce(nullif(p_payload->>'starts_at', '')::timestamptz, ch.starts_at);
  v_days := case
    when v_unlimited then null
    else greatest(
      coalesce(
        nullif(p_payload->>'length_value', '')::int,
        nullif(p_payload->>'days_required', '')::int,
        ch.length_value,
        1
      ),
      1
    )
  end;
  v_ends := case
    when v_unlimited then null
    else public.user_challenge_ends_at(v_starts, v_days)
  end;

  update public.challenges
  set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
    description = coalesce(p_payload->>'description', description),
    rules = coalesce(p_payload->>'rules', rules),
    starts_at = v_starts,
    ends_at = v_ends,
    is_unlimited = v_unlimited,
    min_participants = v_min,
    days_required = coalesce(v_days, days_required),
    target_count = coalesce(nullif(p_payload->>'target_count', '')::int, target_count),
    min_minutes = coalesce(nullif(p_payload->>'min_minutes', '')::int, min_minutes),
    frequency = coalesce(p_payload->>'frequency', frequency),
    proofs = coalesce(p_payload->'proofs', proofs),
    proof_requirements = coalesce(p_payload->'proof_requirements', proof_requirements),
    tasks = coalesce(p_payload->'tasks', tasks),
    rules_list = coalesce(p_payload->'rules_list', rules_list),
    visibility = coalesce(p_payload->>'visibility', visibility),
    discoverability = coalesce(p_payload->>'discoverability', discoverability),
    task = coalesce(p_payload->>'task', task),
    length_value = v_days,
    length_unit = case
      when v_unlimited then null
      else coalesce(p_payload->>'length_unit', length_unit, 'days')
    end,
    required_checkins = coalesce(nullif(p_payload->>'required_checkins', '')::int, required_checkins),
    misses_allowed = coalesce(nullif(p_payload->>'misses_allowed', '')::int, misses_allowed),
    proof_type = coalesce(p_payload->>'proof_type', proof_type),
    cover_image_url = coalesce(p_payload->>'cover_image_url', cover_image_url),
    rules_video_url = coalesce(p_payload->>'rules_video_url', rules_video_url),
    start_roll_pending = false,
    start_roll_shift_days = 0,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return to_jsonb(ch);
end;
$$;

grant execute on function public.update_user_challenge(uuid, jsonb) to authenticated;
grant execute on function public.user_challenge_ends_at(timestamptz, int) to authenticated;
