-- Reminder copy includes the challenge name and opens Overview.
-- Duration: length_value / days_required is the saved length; ends_at is derived.

create or replace function public.challenge_display_title(ch public.challenges)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      case
        when lower(btrim(coalesce(ch.title, ''))) in ('untitled challenge', 'unknown challenge', 'challenge')
          then ''
        else btrim(coalesce(ch.title, ''))
      end,
      ''
    ),
    nullif(btrim(coalesce(ch.task, '')), ''),
    'this challenge'
  );
$$;

drop function if exists public.checkin_risk_line(int, text);

create or replace function public.checkin_risk_line(
  p_offset_hours int,
  p_seed text,
  p_challenge text,
  p_tone text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_lines text[];
  v_idx int;
  v_template text;
  v_name text;
  v_overhead int;
  v_max_name int;
begin
  if p_tone = 'honest' then
    if p_offset_hours = 8 then
      v_lines := array[
        'Check in for {challenge} or you are on the clock.',
        '{challenge} still needs a check-in. Do it today.',
        'Don’t ghost {challenge}. Check in while you can.'
      ];
    elsif p_offset_hours = 4 then
      v_lines := array[
        'Four hours on {challenge}. Check in or lose your seat.',
        '{challenge}: four hours. Check in.',
        'Four hours left. Check in for {challenge}.'
      ];
    else
      v_lines := array[
        'Two hours on {challenge}. Check in or you’re out.',
        '{challenge}: two hours. Check in now.',
        'Last two on {challenge}. Check in. No later.'
      ];
    end if;
  else
    if p_offset_hours = 8 then
      v_lines := array[
        'Check in for {challenge} — stay in it.',
        '{challenge} is still open. Check in when you can.',
        'Window’s open on {challenge}. One check-in keeps you in.'
      ];
    elsif p_offset_hours = 4 then
      v_lines := array[
        'Four hours on {challenge}. Check in and stay in it.',
        '{challenge}: four hours left. Check in.',
        'Four hours left on {challenge}. Check in.'
      ];
    else
      v_lines := array[
        'Two hours on {challenge}. Check in — stay in it.',
        '{challenge}: two hours. Check in now.',
        'Last two hours on {challenge}. Check in.'
      ];
    end if;
  end if;
  v_idx := 1 + mod(abs(hashtext(coalesce(p_seed, ''))), greatest(cardinality(v_lines), 1));
  v_template := v_lines[v_idx];
  v_overhead := greatest(char_length(v_template) - char_length('{challenge}'), 0);
  v_max_name := greatest(100 - v_overhead, 8);
  v_name := btrim(coalesce(nullif(p_challenge, ''), 'this challenge'));
  if char_length(v_name) > v_max_name then
    v_name := left(v_name, greatest(v_max_name - 1, 1)) || '…';
  end if;
  return left(replace(v_template, '{challenge}', v_name), 100);
end;
$$;

create or replace function public.enqueue_checkin_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_period record;
  rec record;
  v_offset int;
  v_next int;
  v_line text;
  v_key text;
  v_name text;
  v_tone text;
begin
  for ch in
    select *
    from public.challenges
    where status = 'live'
      and coalesce(is_unlimited, false) = false
      and starts_at is not null
      and now() >= starts_at
      and (
        (coalesce(is_official, false) and coalesce(series_id, '') <> '')
        or (
          coalesce(format, 'consistency') = 'consistency'
          and coalesce(frequency, 'daily') is distinct from 'once'
        )
      )
  loop
    begin
      v_name := public.challenge_display_title(ch);
      for v_period in
        select * from public.open_checkin_period(ch)
      loop
        foreach v_offset in array array[8, 4, 2]
        loop
          v_next := case v_offset when 8 then 4 when 4 then 2 else 0 end;
          if now() < v_period.ends_at - make_interval(hours => v_offset) then
            continue;
          end if;
          if now() >= v_period.ends_at - make_interval(hours => v_next) then
            continue;
          end if;

          for rec in
            select p.user_id
            from public.challenge_participants p
            where p.challenge_id = ch.id
              and p.eliminated_at is null
              and coalesce(p.status, 'joined') in ('active', 'joined', 'completed')
              and coalesce(p.status, 'joined') is distinct from 'withdrawn'
              and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
              and not public.period_was_submitted(ch.id, p.user_id, v_period.period_key)
              and public.checkin_miss_would_eliminate(ch, p.user_id)
          loop
            v_key := rec.user_id::text || ':' || ch.id::text || ':' || v_period.period_key::text || ':' || v_offset::text;
            select case
              when coalesce(nullif(pr.encouragement_tone, ''), nullif(pr.motivation_tone, ''), 'gentle') = 'honest'
                then 'honest'
              else 'gentle'
            end
            into v_tone
            from public.profiles pr
            where pr.id = rec.user_id;
            v_tone := coalesce(v_tone, 'gentle');
            v_line := public.checkin_risk_line(v_offset, v_key, v_name, v_tone);
            if coalesce(btrim(v_line), '') = '' then
              continue;
            end if;
            perform public.notify_user(
              rec.user_id,
              null,
              'challenge_checkin_reminder',
              v_line,
              v_line,
              jsonb_build_object(
                'type', 'challenge_checkin_reminder',
                'challenge_id', ch.id,
                'challengeId', ch.id,
                'period_key', v_period.period_key,
                'offset_hours', v_offset,
                'href', '/challenges/' || ch.id::text,
                'tab', 'overview',
                'dedupe_key', v_key
              )
            );
          end loop;
        end loop;
      end loop;
    exception when others then
      null;
    end;
  end loop;
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
  v_days := greatest(coalesce(new.length_value, new.days_required, 0), 0);
  if v_days < 1 then
    return new;
  end if;
  new.days_required := v_days;
  new.length_value := v_days;
  new.length_unit := coalesce(nullif(new.length_unit, ''), 'days');
  if new.starts_at is not null then
    new.ends_at := public.user_challenge_ends_at(new.starts_at, v_days);
  end if;
  return new;
end;
$$;

create or replace function public.trg_user_challenge_duration_update()
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
  v_days := greatest(coalesce(new.length_value, new.days_required, 0), 0);
  if v_days < 1 then
    return new;
  end if;
  new.days_required := v_days;
  new.length_value := v_days;
  new.length_unit := coalesce(nullif(new.length_unit, ''), 'days');
  if new.starts_at is not null then
    new.ends_at := public.user_challenge_ends_at(new.starts_at, v_days);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_challenge_duration_update on public.challenges;
create trigger trg_user_challenge_duration_update
  before update on public.challenges
  for each row
  execute function public.trg_user_challenge_duration_update();

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
        nullif(p_payload->>'duration_days', '')::int,
        nullif(p_payload->>'length_value', '')::int,
        nullif(p_payload->>'days_required', '')::int,
        ch.length_value,
        ch.days_required,
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

grant execute on function public.challenge_display_title(public.challenges) to authenticated, service_role;
grant execute on function public.checkin_risk_line(int, text, text, text) to authenticated, service_role;
grant execute on function public.enqueue_checkin_reminders() to authenticated, service_role;
grant execute on function public.update_user_challenge(uuid, jsonb) to authenticated;
