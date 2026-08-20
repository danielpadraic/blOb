-- Wiping check-ins when a not-live user challenge changes starts_at.
-- Keep posts (checkin_id SET NULL). Do not claw back first_proof coins.

create or replace function public.wipe_user_challenge_progress(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    return;
  end if;
  if ch.status in ('live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled', 'distributing') then
    return;
  end if;

  -- posts.checkin_id ON DELETE SET NULL — feed/Home stay.
  delete from public.challenge_checkins
  where challenge_id = p_challenge_id;

  -- Day count lives on workout_submissions. first_proof grant is insert-only + user_grants unique.
  delete from public.workout_submissions
  where challenge_id = p_challenge_id;

  update public.challenge_participants
  set
    days_completed = 0,
    completed_at = null,
    status = case
      when coalesce(status, 'joined') in ('completed', 'active') then 'joined'
      else coalesce(status, 'joined')
    end
  where challenge_id = p_challenge_id
    and coalesce(status, 'joined') is distinct from 'refunded_pre_start'
    and coalesce(status, 'joined') is distinct from 'withdrawn';
end;
$$;

revoke all on function public.wipe_user_challenge_progress(uuid) from public, anon, authenticated;

create or replace function public.apply_challenge_start(
  p_challenge_id uuid,
  p_starts_at timestamptz,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  v_start timestamptz;
  v_end timestamptz;
  v_keep int;
  v_days int;
  v_old_days int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if v_mode not in ('keep', 'shorten') then
    raise exception 'INVALID_MODE';
  end if;
  if p_starts_at is null then
    raise exception 'START_REQUIRED';
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
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled', 'distributing') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform public.wipe_user_challenge_progress(p_challenge_id);

  v_start := p_starts_at;
  while v_start <= now() loop
    v_start := v_start + interval '1 day';
  end loop;

  if ch.ends_at is not null and ch.starts_at is not null then
    v_old_days := greatest(1, ceil(extract(epoch from (ch.ends_at - ch.starts_at)) / 86400.0)::int);
  else
    v_old_days := greatest(1, coalesce(ch.length_value, ch.days_required, 1)::int);
  end if;
  v_keep := greatest(coalesce(ch.start_roll_keep_days, v_old_days), 1);

  if v_mode = 'keep' then
    v_days := v_keep;
    if ch.ends_at is null then
      v_end := null;
    else
      v_end := v_start + (v_days * interval '1 day');
    end if;
  else
    v_end := ch.ends_at;
    if v_end is null then
      raise exception 'DURATION_TOO_SHORT';
    end if;
    if v_end < v_start + interval '1 day' then
      raise exception 'DURATION_TOO_SHORT';
    end if;
    v_days := greatest(1, ceil(extract(epoch from (v_end - v_start)) / 86400.0)::int);
  end if;

  update public.challenges
  set
    starts_at = v_start,
    ends_at = v_end,
    length_value = case when v_end is null then length_value else v_days end,
    length_unit = case when v_end is null then length_unit else coalesce(nullif(length_unit, ''), 'days') end,
    days_required = case
      when days_required is not null
           and days_required in (v_old_days, v_keep, coalesce(ch.length_value, -1)) then v_days
      else days_required
    end,
    required_checkins = case
      when required_checkins is not null
           and required_checkins in (v_old_days, v_keep, coalesce(ch.length_value, -1)) then v_days
      else required_checkins
    end,
    target_count = case
      when target_count is not null
           and target_count in (v_old_days, v_keep, coalesce(ch.length_value, -1)) then v_days
      else target_count
    end,
    start_roll_pending = false,
    start_roll_shift_days = 0,
    start_roll_keep_days = case when v_end is null then start_roll_keep_days else v_days end,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', ch.id,
    'starts_at', ch.starts_at,
    'ends_at', ch.ends_at,
    'length_value', ch.length_value,
    'length_unit', ch.length_unit,
    'days_required', ch.days_required,
    'start_roll_pending', ch.start_roll_pending
  );
end;
$$;

grant execute on function public.apply_challenge_start(uuid, timestamptz, text) to authenticated;

create or replace function public.nudge_challenge_start(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_keep int;
  v_start timestamptz;
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

  perform public.wipe_user_challenge_progress(p_challenge_id);

  if ch.ends_at is not null then
    v_keep := greatest(1, ceil(extract(epoch from (ch.ends_at - ch.starts_at)) / 86400.0)::int);
  else
    v_keep := greatest(1, coalesce(ch.length_value, ch.days_required, 1)::int);
  end if;
  if coalesce(ch.start_roll_pending, false) and coalesce(ch.start_roll_keep_days, 0) > 0 then
    v_keep := ch.start_roll_keep_days;
  end if;

  v_start := ch.starts_at + interval '1 day';
  while v_start <= now() loop
    v_start := v_start + interval '1 day';
  end loop;

  update public.challenges
  set
    starts_at = v_start,
    start_roll_pending = true,
    start_roll_keep_days = v_keep,
    start_roll_shift_days = coalesce(start_roll_shift_days, 0) + 1,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', ch.id,
    'starts_at', ch.starts_at,
    'ends_at', ch.ends_at,
    'length_value', ch.length_value,
    'start_roll_pending', ch.start_roll_pending,
    'start_roll_keep_days', ch.start_roll_keep_days
  );
end;
$$;

create or replace function public.roll_user_challenge_start(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_keep int;
  v_shift int := 0;
  v_start timestamptz;
begin
  select * into ch from public.challenges where id = p_id for update;
  if not found then
    return;
  end if;
  if coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '' then
    return;
  end if;
  if ch.status in ('live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    return;
  end if;

  v_start := ch.starts_at;
  if v_start is null then
    return;
  end if;
  if ch.ends_at is not null then
    v_keep := greatest(1, ceil(extract(epoch from (ch.ends_at - v_start)) / 86400.0)::int);
  else
    v_keep := greatest(1, coalesce(ch.length_value, ch.days_required, 1)::int);
  end if;
  if coalesce(ch.start_roll_pending, false) and coalesce(ch.start_roll_keep_days, 0) > 0 then
    v_keep := ch.start_roll_keep_days;
  end if;

  while v_start <= now() loop
    v_start := v_start + interval '1 day';
    v_shift := v_shift + 1;
  end loop;
  if v_shift <= 0 then
    return;
  end if;

  perform public.wipe_user_challenge_progress(p_id);

  update public.challenges
  set
    starts_at = v_start,
    status = case when status in ('upcoming', 'starting', 'in_progress') then 'open' else status end,
    official_started_at = null,
    start_roll_pending = true,
    start_roll_keep_days = v_keep,
    start_roll_shift_days = coalesce(start_roll_shift_days, 0) + v_shift,
    updated_at = now()
  where id = p_id
  returning * into ch;

  begin
    perform public.notify_start_rolled(ch);
  exception when others then
    null;
  end;
end;
$$;

grant execute on function public.apply_challenge_start(uuid, timestamptz, text) to authenticated;
grant execute on function public.nudge_challenge_start(uuid) to authenticated;

notify pgrst, 'reload schema';
